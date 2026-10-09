/*
# Receive product with lot (atomic) + Classify untracked stock

## Purpose
Two new SECURITY DEFINER RPCs:

1. receive_product_lot — physical stock entry that can optionally create a
   new lot in the same transaction. Replaces the two-step "create lot then
   add_inventory_stock" flow for new lots.

2. classify_untracked_stock — transfers quantity from the virtual "Sem lote"
   balance into a real lot. Does NOT change products.quantity_in_stock.
   Creates the lot if it doesn't exist, or increments an existing lot.

## What changes
- New function public.receive_product_lot(...)
- New function public.classify_untracked_stock(...)
- Both are SECURITY DEFINER, search_path = public, pg_temp
- Both derive institution_id from auth.uid() via user_profiles
- EXECUTE revoked from PUBLIC and anon; granted to authenticated only

## What does NOT change
- Existing products, lots, operations, ledger — all untouched
- add_inventory_stock, adjust_inventory_stock, archive_product_lot — unchanged
- create_product_lot, update_product_lot, delete_product_lot — unchanged
- No tables, columns, indexes, or RLS policies altered
*/

-- ============================================================
-- 1. receive_product_lot — physical stock entry with optional new lot
-- ============================================================

CREATE OR REPLACE FUNCTION public.receive_product_lot(
  p_product_id uuid,
  p_quantity numeric,
  p_idempotency_key text,
  p_lot_number text DEFAULT NULL,
  p_expiration_date date DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_effective_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_ledger_active boolean;
  v_product_row public.products;
  v_lot_row public.product_lots;
  v_lot_id uuid;
  v_lot_number_trim text;
  v_unit text;
  v_total_cost numeric;
  v_group_id uuid;
  v_existing_expiration date;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT institution_id INTO v_institution_id
  FROM public.user_profiles WHERE id = v_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF v_institution_id IS NULL THEN RAISE EXCEPTION 'PROFILE_NO_INSTITUTION'; END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  -- Idempotency check
  PERFORM 1 FROM public.inventory_movements
  WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('status','IDEMPOTENT','message','Request already processed');
  END IF;

  -- Validate product
  SELECT * INTO v_product_row
  FROM public.products
  WHERE id = p_product_id AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN'; END IF;
  v_unit := v_product_row.unit;

  v_lot_number_trim := NULLIF(btrim(COALESCE(p_lot_number, '')), '');

  IF v_lot_number_trim IS NOT NULL THEN
    -- Check if lot already exists for this product with same number (case-insensitive, trimmed)
    SELECT * INTO v_lot_row
    FROM public.product_lots
    WHERE product_id = p_product_id
      AND btrim(lower(lot_number)) = btrim(lower(v_lot_number_trim))
    LIMIT 1;

    IF FOUND THEN
      -- Lot exists: check archived
      IF v_lot_row.archived_at IS NOT NULL THEN
        RAISE EXCEPTION 'LOT_ARCHIVED';
      END IF;

      -- Check expiration conflict
      IF p_expiration_date IS NOT NULL
         AND v_lot_row.expiration_date IS NOT NULL
         AND v_lot_row.expiration_date != p_expiration_date
      THEN
        RAISE EXCEPTION 'LOT_EXPIRATION_CONFLICT';
      END IF;

      v_lot_id := v_lot_row.id;
    ELSE
      -- Create new lot
      INSERT INTO public.product_lots (product_id, lot_number, quantity, expiration_date)
      VALUES (p_product_id, v_lot_number_trim, 0, p_expiration_date)
      RETURNING id INTO v_lot_id;
    END IF;
  ELSE
    v_lot_id := NULL;
  END IF;

  -- Update product stock
  UPDATE public.products
  SET quantity_in_stock = quantity_in_stock + p_quantity, updated_at = now()
  WHERE id = p_product_id;

  -- Update lot stock if lot provided/created
  IF v_lot_id IS NOT NULL THEN
    UPDATE public.product_lots
    SET quantity = quantity + p_quantity, updated_at = now()
    WHERE id = v_lot_id;
  END IF;

  -- Write ledger if active
  SELECT opening_balance_complete INTO v_ledger_active
  FROM public.institution_ledger_config
  WHERE institution_id = v_institution_id;

  IF v_ledger_active THEN
    v_group_id := gen_random_uuid();
    IF p_unit_cost IS NOT NULL AND p_unit_cost > 0 THEN
      v_total_cost := p_unit_cost * p_quantity;
    END IF;

    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      movement_group_id, movement_kind, movement_type, quantity,
      unit_snapshot, unit_cost, total_cost, reason, notes,
      source_type, idempotency_key, created_by, effective_at
    ) VALUES (
      v_institution_id, p_product_id, v_lot_id,
      v_lot_number_trim,
      v_group_id, 'PHYSICAL', 'STOCK_IN', p_quantity,
      v_unit, p_unit_cost, v_total_cost, p_reason, p_notes,
      'manual', p_idempotency_key, v_user_id,
      COALESCE(p_effective_at, now())
    );
  END IF;

  RETURN jsonb_build_object(
    'status','OK',
    'product_id', p_product_id,
    'quantity_added', p_quantity,
    'lot_id', v_lot_id,
    'lot_number', v_lot_number_trim,
    'new_stock', v_product_row.quantity_in_stock + p_quantity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.receive_product_lot(
  uuid, numeric, text, text, date, text, text, numeric, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receive_product_lot(
  uuid, numeric, text, text, date, text, text, numeric, timestamptz
) FROM anon;
GRANT EXECUTE ON FUNCTION public.receive_product_lot(
  uuid, numeric, text, text, date, text, text, numeric, timestamptz
) TO authenticated;

-- ============================================================
-- 2. classify_untracked_stock — transfer Sem lote to a real lot
-- ============================================================

CREATE OR REPLACE FUNCTION public.classify_untracked_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_lot_number text,
  p_expiration_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_ledger_active boolean;
  v_product_row public.products;
  v_lot_row public.product_lots;
  v_lot_id uuid;
  v_lot_number_trim text;
  v_tracked_sum numeric;
  v_untracked numeric;
  v_group_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT institution_id INTO v_institution_id
  FROM public.user_profiles WHERE id = v_user_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF v_institution_id IS NULL THEN RAISE EXCEPTION 'PROFILE_NO_INSTITUTION'; END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  v_lot_number_trim := NULLIF(btrim(COALESCE(p_lot_number, '')), '');
  IF v_lot_number_trim IS NULL THEN
    RAISE EXCEPTION 'LOT_NUMBER_REQUIRED';
  END IF;

  -- Lock product
  SELECT * INTO v_product_row
  FROM public.products
  WHERE id = p_product_id AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN'; END IF;

  -- Calculate untracked stock
  SELECT COALESCE(SUM(quantity), 0) INTO v_tracked_sum
  FROM public.product_lots
  WHERE product_id = p_product_id;

  v_untracked := v_product_row.quantity_in_stock - v_tracked_sum;

  IF v_untracked < p_quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_UNTRACKED_STOCK';
  END IF;

  -- Check if lot already exists
  SELECT * INTO v_lot_row
  FROM public.product_lots
  WHERE product_id = p_product_id
    AND btrim(lower(lot_number)) = btrim(lower(v_lot_number_trim))
  LIMIT 1;

  IF FOUND THEN
    IF v_lot_row.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'LOT_ARCHIVED';
    END IF;

    IF p_expiration_date IS NOT NULL
       AND v_lot_row.expiration_date IS NOT NULL
       AND v_lot_row.expiration_date != p_expiration_date
    THEN
      RAISE EXCEPTION 'LOT_EXPIRATION_CONFLICT';
    END IF;

    v_lot_id := v_lot_row.id;
  ELSE
    INSERT INTO public.product_lots (product_id, lot_number, quantity, expiration_date)
    VALUES (p_product_id, v_lot_number_trim, 0, p_expiration_date)
    RETURNING id INTO v_lot_id;
  END IF;

  -- Increment lot quantity (does NOT change products.quantity_in_stock)
  UPDATE public.product_lots
  SET quantity = quantity + p_quantity, updated_at = now()
  WHERE id = v_lot_id;

  -- Write ledger classification movements (net zero)
  SELECT opening_balance_complete INTO v_ledger_active
  FROM public.institution_ledger_config
  WHERE institution_id = v_institution_id;

  IF v_ledger_active THEN
    v_group_id := gen_random_uuid();

    -- Out from untracked
    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      movement_group_id, movement_kind, movement_type, quantity,
      unit_snapshot, reason, notes, source_type, created_by
    ) VALUES (
      v_institution_id, p_product_id, NULL, NULL,
      v_group_id, 'CLASSIFICATION', 'LOT_CLASSIFICATION', -p_quantity,
      v_product_row.unit, 'classify_from_untracked', p_notes,
      'manual', v_user_id
    );

    -- In to lot
    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      movement_group_id, movement_kind, movement_type, quantity,
      unit_snapshot, reason, notes, source_type, created_by
    ) VALUES (
      v_institution_id, p_product_id, v_lot_id, v_lot_number_trim,
      v_group_id, 'CLASSIFICATION', 'LOT_CLASSIFICATION', p_quantity,
      v_product_row.unit, 'classify_to_lot', p_notes,
      'manual', v_user_id
    );
  END IF;

  RETURN jsonb_build_object(
    'status','OK',
    'product_id', p_product_id,
    'quantity_classified', p_quantity,
    'lot_id', v_lot_id,
    'lot_number', v_lot_number_trim
  );
END;
$$;

REVOKE ALL ON FUNCTION public.classify_untracked_stock(
  uuid, numeric, text, date, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classify_untracked_stock(
  uuid, numeric, text, date, text
) FROM anon;
GRANT EXECUTE ON FUNCTION public.classify_untracked_stock(
  uuid, numeric, text, date, text
) TO authenticated;
