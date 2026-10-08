/*
# ETAPA 4G — Stock Operations RPCs

## Purpose
Add 4 new SECURITY DEFINER RPCs for post-cutover stock operations:
1. add_inventory_stock — physical stock entry with idempotency
2. adjust_inventory_stock — admin-only inventory adjustment (physical count correction)
3. archive_product_lot — archive empty lots (soft delete, preserves ledger history)
4. check_inventory_reconciliation — read-only discrepancy report (admin-only)

Also adds archived-lot guards to create_product_lot and update_product_lot.

## Security
- All RPCs derive institution_id from auth.uid() via user_profiles — never from client input
- adjust_inventory_stock and check_inventory_reconciliation are admin-only (is_admin = true)
- No new grants on inventory_movements — all writes go through SECURITY DEFINER functions
- No INSERT/UPDATE/DELETE on inventory_movements for anon/authenticated roles

## Idempotency
- add_inventory_stock and adjust_inventory_stock require idempotency_key
- Repeated requests with same key return stable result without duplicating stock or movements
- Unique constraint on inventory_movements.idempotency_key prevents duplicate inserts
*/

-- ============================================================
-- 1. add_inventory_stock — physical stock entry
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_inventory_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_idempotency_key text,
  p_lot_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_unit_cost numeric DEFAULT NULL,
  p_effective_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_ledger_active boolean;
  v_product_row public.products;
  v_lot_row public.product_lots;
  v_lot_number text;
  v_unit text;
  v_total_cost numeric;
  v_group_id uuid;
BEGIN
IF v_user_id IS NULL THEN
  RAISE EXCEPTION 'AUTH_REQUIRED';
END IF;

SELECT institution_id INTO v_institution_id
FROM public.user_profiles
WHERE id = v_user_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'PROFILE_NOT_FOUND';
END IF;

IF v_institution_id IS NULL THEN
  RAISE EXCEPTION 'PROFILE_NO_INSTITUTION';
END IF;

IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
  RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
END IF;

IF p_quantity IS NULL OR p_quantity <= 0 THEN
  RAISE EXCEPTION 'INVALID_QUANTITY';
END IF;

-- Check idempotency: if movement with this key exists, return stable result
PERFORM 1 FROM public.inventory_movements
WHERE idempotency_key = p_idempotency_key;

IF FOUND THEN
  RETURN jsonb_build_object(
    'status', 'IDEMPOTENT',
    'message', 'Request already processed',
    'product_id', p_product_id,
    'quantity', p_quantity,
    'lot_id', p_lot_id
  );
END IF;

-- Validate product belongs to institution
SELECT * INTO v_product_row
FROM public.products
WHERE id = p_product_id
AND institution_id = v_institution_id
FOR UPDATE;

IF NOT FOUND THEN
  RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
END IF;

v_unit := v_product_row.unit;

-- Validate lot if provided
IF p_lot_id IS NOT NULL THEN
  SELECT * INTO v_lot_row
  FROM public.product_lots
  WHERE id = p_lot_id
  AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH';
  END IF;

  -- Block archived lots
  IF v_lot_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'LOT_ARCHIVED';
  END IF;

  v_lot_number := v_lot_row.lot_number;
ELSE
  v_lot_number := NULL;
END IF;

-- Compute total cost if unit_cost provided
IF p_unit_cost IS NOT NULL AND p_unit_cost > 0 THEN
  v_total_cost := p_unit_cost * p_quantity;
END IF;

-- Update product stock
UPDATE public.products
SET quantity_in_stock = quantity_in_stock + p_quantity,
    updated_at = now()
WHERE id = p_product_id;

-- Update lot stock if lot provided
IF p_lot_id IS NOT NULL THEN
  UPDATE public.product_lots
  SET quantity = quantity + p_quantity,
      updated_at = now()
  WHERE id = p_lot_id;
END IF;

-- Write ledger movement if ledger active
SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

IF v_ledger_active THEN
  v_group_id := gen_random_uuid();

  INSERT INTO public.inventory_movements (
    institution_id, product_id, lot_id, lot_number_snapshot,
    movement_group_id, movement_kind, movement_type, quantity,
    unit_snapshot, unit_cost, total_cost, reason, notes,
    source_type, idempotency_key, created_by, effective_at
  ) VALUES (
    v_institution_id, p_product_id, p_lot_id, v_lot_number,
    v_group_id, 'PHYSICAL', 'STOCK_IN', p_quantity,
    v_unit, p_unit_cost, v_total_cost, p_reason, p_notes,
    'manual', p_idempotency_key, v_user_id,
    COALESCE(p_effective_at, now())
  );
END IF;

RETURN jsonb_build_object(
  'status', 'OK',
  'product_id', p_product_id,
  'quantity_added', p_quantity,
  'lot_id', p_lot_id,
  'new_stock', v_product_row.quantity_in_stock + p_quantity
);
END;
$function$;

-- ============================================================
-- 2. adjust_inventory_stock — admin-only inventory adjustment
-- ============================================================

CREATE OR REPLACE FUNCTION public.adjust_inventory_stock(
  p_product_id uuid,
  p_target_quantity numeric,
  p_reason text,
  p_idempotency_key text,
  p_lot_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_is_admin boolean;
  v_ledger_active boolean;
  v_product_row public.products;
  v_lot_row public.product_lots;
  v_current_qty numeric;
  v_delta numeric;
  v_lot_number text;
  v_unit text;
  v_movement_type text;
  v_group_id uuid;
  v_tracked_sum numeric;
BEGIN
IF v_user_id IS NULL THEN
  RAISE EXCEPTION 'AUTH_REQUIRED';
END IF;

SELECT institution_id, is_admin INTO v_institution_id, v_is_admin
FROM public.user_profiles
WHERE id = v_user_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'PROFILE_NOT_FOUND';
END IF;

IF v_institution_id IS NULL THEN
  RAISE EXCEPTION 'PROFILE_NO_INSTITUTION';
END IF;

IF NOT v_is_admin THEN
  RAISE EXCEPTION 'ADMIN_REQUIRED';
END IF;

IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
  RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED';
END IF;

IF p_reason IS NULL OR btrim(p_reason) = '' THEN
  RAISE EXCEPTION 'REASON_REQUIRED';
END IF;

IF p_target_quantity IS NULL OR p_target_quantity < 0 THEN
  RAISE EXCEPTION 'INVALID_TARGET_QUANTITY';
END IF;

-- Check idempotency
PERFORM 1 FROM public.inventory_movements
WHERE idempotency_key = p_idempotency_key;

IF FOUND THEN
  RETURN jsonb_build_object(
    'status', 'IDEMPOTENT',
    'message', 'Request already processed',
    'product_id', p_product_id,
    'lot_id', p_lot_id
  );
END IF;

-- Validate product
SELECT * INTO v_product_row
FROM public.products
WHERE id = p_product_id
AND institution_id = v_institution_id
FOR UPDATE;

IF NOT FOUND THEN
  RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
END IF;

v_unit := v_product_row.unit;

IF p_lot_id IS NOT NULL THEN
  -- Lot-specific adjustment
  SELECT * INTO v_lot_row
  FROM public.product_lots
  WHERE id = p_lot_id
  AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH';
  END IF;

  IF v_lot_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'LOT_ARCHIVED';
  END IF;

  v_lot_number := v_lot_row.lot_number;
  v_current_qty := v_lot_row.quantity;
  v_delta := p_target_quantity - v_current_qty;

  IF v_delta = 0 THEN
    RETURN jsonb_build_object('status', 'NO_CHANGE', 'message', 'Target equals current quantity');
  END IF;

  -- Check that new lot quantity won't exceed product stock
  SELECT COALESCE(SUM(quantity), 0) INTO v_tracked_sum
  FROM public.product_lots
  WHERE product_id = p_product_id AND id != p_lot_id;

  IF v_tracked_sum + p_target_quantity > v_product_row.quantity_in_stock THEN
    RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
  END IF;

  -- Apply lot update
  UPDATE public.product_lots
  SET quantity = p_target_quantity,
      updated_at = now()
  WHERE id = p_lot_id;

  -- Apply product stock delta (same delta)
  UPDATE public.products
  SET quantity_in_stock = quantity_in_stock + v_delta,
      updated_at = now()
  WHERE id = p_product_id;

  v_movement_type := CASE WHEN v_delta > 0 THEN 'ADJUSTMENT_IN' ELSE 'ADJUSTMENT_OUT' END;

ELSE
  -- Untracked adjustment
  v_lot_number := NULL;

  SELECT COALESCE(SUM(quantity), 0) INTO v_tracked_sum
  FROM public.product_lots
  WHERE product_id = p_product_id;

  v_current_qty := v_product_row.quantity_in_stock - v_tracked_sum;
  v_delta := p_target_quantity - v_current_qty;

  IF v_delta = 0 THEN
    RETURN jsonb_build_object('status', 'NO_CHANGE', 'message', 'Target equals current untracked quantity');
  END IF;

  -- Check no negative
  IF v_product_row.quantity_in_stock + v_delta < 0 THEN
    RAISE EXCEPTION 'NEGATIVE_STOCK_NOT_ALLOWED';
  END IF;

  -- Apply product stock update only
  UPDATE public.products
  SET quantity_in_stock = quantity_in_stock + v_delta,
      updated_at = now()
  WHERE id = p_product_id;

  v_movement_type := CASE WHEN v_delta > 0 THEN 'ADJUSTMENT_IN' ELSE 'ADJUSTMENT_OUT' END;
END IF;

-- Write ledger movement if ledger active
SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

IF v_ledger_active THEN
  v_group_id := gen_random_uuid();

  INSERT INTO public.inventory_movements (
    institution_id, product_id, lot_id, lot_number_snapshot,
    movement_group_id, movement_kind, movement_type, quantity,
    unit_snapshot, reason, notes,
    source_type, idempotency_key, created_by
  ) VALUES (
    v_institution_id, p_product_id, p_lot_id, v_lot_number,
    v_group_id, 'PHYSICAL', v_movement_type, v_delta,
    v_unit, p_reason, p_notes,
    'manual', p_idempotency_key, v_user_id
  );
END IF;

RETURN jsonb_build_object(
  'status', 'OK',
  'product_id', p_product_id,
  'lot_id', p_lot_id,
  'delta', v_delta,
  'movement_type', v_movement_type,
  'new_stock', v_product_row.quantity_in_stock + v_delta
);
END;
$function$;

-- ============================================================
-- 3. archive_product_lot — archive empty lot
-- ============================================================

CREATE OR REPLACE FUNCTION public.archive_product_lot(
  p_lot_id uuid
) RETURNS public.product_lots
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_lot_row public.product_lots;
  v_product_id uuid;
  v_archived_lot public.product_lots;
BEGIN
IF v_user_id IS NULL THEN
  RAISE EXCEPTION 'AUTH_REQUIRED';
END IF;

SELECT institution_id INTO v_institution_id
FROM public.user_profiles
WHERE id = v_user_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'PROFILE_NOT_FOUND';
END IF;

IF v_institution_id IS NULL THEN
  RAISE EXCEPTION 'PROFILE_NO_INSTITUTION';
END IF;

SELECT * INTO v_lot_row
FROM public.product_lots
WHERE id = p_lot_id
FOR UPDATE;

IF NOT FOUND THEN
  RAISE EXCEPTION 'LOT_NOT_FOUND';
END IF;

v_product_id := v_lot_row.product_id;

-- Verify product belongs to institution
PERFORM 1 FROM public.products
WHERE id = v_product_id
AND institution_id = v_institution_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
END IF;

-- Already archived?
IF v_lot_row.archived_at IS NOT NULL THEN
  RAISE EXCEPTION 'LOT_ALREADY_ARCHIVED';
END IF;

-- Must be empty
IF v_lot_row.quantity > 0 THEN
  RAISE EXCEPTION 'LOT_NOT_EMPTY';
END IF;

-- Archive (soft delete)
UPDATE public.product_lots
SET archived_at = now(),
    archived_by = v_user_id,
    updated_at = now()
WHERE id = p_lot_id
RETURNING * INTO v_archived_lot;

RETURN v_archived_lot;
END;
$function$;

-- ============================================================
-- 4. check_inventory_reconciliation — read-only discrepancy report
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_inventory_reconciliation()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_is_admin boolean;
  v_product_discrepancies jsonb;
  v_lot_discrepancies jsonb;
  v_untracked_discrepancies jsonb;
  v_total_discrepancies int;
BEGIN
IF v_user_id IS NULL THEN
  RAISE EXCEPTION 'AUTH_REQUIRED';
END IF;

SELECT institution_id, is_admin INTO v_institution_id, v_is_admin
FROM public.user_profiles
WHERE id = v_user_id;

IF NOT FOUND THEN
  RAISE EXCEPTION 'PROFILE_NOT_FOUND';
END IF;

IF NOT v_is_admin THEN
  RAISE EXCEPTION 'ADMIN_REQUIRED';
END IF;

-- Product-level discrepancies
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'product_id', p.id,
  'product_name', p.name,
  'ledger_balance', COALESCE(SUM(im.quantity), 0),
  'materialized_balance', p.quantity_in_stock,
  'difference', p.quantity_in_stock - COALESCE(SUM(im.quantity), 0),
  'scope', 'product'
)), '[]'::jsonb)
INTO v_product_discrepancies
FROM public.products p
LEFT JOIN public.inventory_movements im ON im.product_id = p.id AND im.institution_id = v_institution_id
WHERE p.institution_id = v_institution_id
GROUP BY p.id, p.name, p.quantity_in_stock
HAVING ABS(p.quantity_in_stock - COALESCE(SUM(im.quantity), 0)) > 0.0001;

-- Lot-level discrepancies
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'product_id', pl.product_id,
  'lot_id', pl.id,
  'lot_number', pl.lot_number,
  'ledger_balance', COALESCE(SUM(im.quantity), 0),
  'materialized_balance', pl.quantity,
  'difference', pl.quantity - COALESCE(SUM(im.quantity), 0),
  'scope', 'lot'
)), '[]'::jsonb)
INTO v_lot_discrepancies
FROM public.product_lots pl
LEFT JOIN public.inventory_movements im ON im.lot_id = pl.id AND im.institution_id = v_institution_id
JOIN public.products p ON p.id = pl.product_id AND p.institution_id = v_institution_id
GROUP BY pl.id, pl.product_id, pl.lot_number, pl.quantity
HAVING ABS(pl.quantity - COALESCE(SUM(im.quantity), 0)) > 0.0001;

-- Untracked discrepancies
SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'product_id', p.id,
  'product_name', p.name,
  'ledger_untracked', COALESCE(SUM(im.quantity), 0),
  'materialized_untracked', p.quantity_in_stock - COALESCE(SUM(pl.quantity), 0),
  'difference', (p.quantity_in_stock - COALESCE(SUM(pl.quantity), 0)) - COALESCE(SUM(im.quantity), 0),
  'scope', 'untracked'
)), '[]'::jsonb)
INTO v_untracked_discrepancies
FROM public.products p
LEFT JOIN public.product_lots pl ON pl.product_id = p.id
LEFT JOIN public.inventory_movements im ON im.product_id = p.id AND im.lot_id IS NULL AND im.institution_id = v_institution_id
WHERE p.institution_id = v_institution_id
GROUP BY p.id, p.name, p.quantity_in_stock
HAVING ABS((p.quantity_in_stock - COALESCE(SUM(pl.quantity), 0)) - COALESCE(SUM(im.quantity), 0)) > 0.0001;

v_total_discrepancies :=
  jsonb_array_length(v_product_discrepancies) +
  jsonb_array_length(v_lot_discrepancies) +
  jsonb_array_length(v_untracked_discrepancies);

RETURN jsonb_build_object(
  'total_discrepancies', v_total_discrepancies,
  'product_discrepancies', v_product_discrepancies,
  'lot_discrepancies', v_lot_discrepancies,
  'untracked_discrepancies', v_untracked_discrepancies
);
END;
$function$;

-- ============================================================
-- 5. Guard archived lots in create_product_lot
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_product_lot(
  p_product_id uuid, p_lot_number text, p_quantity numeric,
  p_expiration_date date DEFAULT NULL
) RETURNS public.product_lots
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_product_stock numeric;
  v_old_sum numeric;
  v_new_sum numeric;
  v_created_lot public.product_lots;
  v_lot_number text;
  v_ledger_active boolean;
  v_group_id uuid;
  v_unit text;
BEGIN
IF v_user_id IS NULL THEN
RAISE EXCEPTION 'AUTH_REQUIRED';
END IF;

SELECT institution_id INTO v_institution_id
FROM public.user_profiles
WHERE id = v_user_id;

IF NOT FOUND THEN
RAISE EXCEPTION 'PROFILE_NOT_FOUND';
END IF;

IF v_institution_id IS NULL THEN
RAISE EXCEPTION 'PROFILE_NO_INSTITUTION';
END IF;

v_lot_number := btrim(p_lot_number);
IF v_lot_number IS NULL OR v_lot_number = '' THEN
RAISE EXCEPTION 'LOT_NUMBER_REQUIRED';
END IF;

IF p_quantity IS NULL OR p_quantity < 0 THEN
RAISE EXCEPTION 'INVALID_QUANTITY';
END IF;

SELECT quantity_in_stock INTO v_product_stock
FROM public.products
WHERE id = p_product_id
AND institution_id = v_institution_id
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
END IF;

SELECT COALESCE(SUM(quantity), 0) INTO v_old_sum
FROM public.product_lots
WHERE product_id = p_product_id;

v_new_sum := v_old_sum + p_quantity;

IF v_old_sum <= v_product_stock THEN
IF v_new_sum > v_product_stock THEN
RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
END IF;
ELSE
IF v_new_sum > v_old_sum THEN
RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
END IF;
END IF;

-- Only check non-archived lots for uniqueness
IF EXISTS (
SELECT 1 FROM public.product_lots
WHERE product_id = p_product_id AND lot_number = v_lot_number
AND archived_at IS NULL
) THEN
RAISE EXCEPTION 'LOT_NUMBER_ALREADY_EXISTS';
END IF;

BEGIN
INSERT INTO public.product_lots (
product_id, lot_number, quantity, expiration_date
)
VALUES (
p_product_id, v_lot_number, p_quantity, p_expiration_date
)
RETURNING * INTO v_created_lot;
EXCEPTION
WHEN unique_violation THEN
RAISE EXCEPTION 'LOT_NUMBER_ALREADY_EXISTS';
END;

SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

IF v_ledger_active AND p_quantity > 0 THEN
  v_group_id := gen_random_uuid();
  SELECT unit INTO v_unit FROM public.products WHERE id = p_product_id;

  INSERT INTO public.inventory_movements (
    institution_id, product_id, lot_id, lot_number_snapshot,
    movement_group_id, movement_kind, movement_type, quantity,
    unit_snapshot, source_type, idempotency_key, created_by
  ) VALUES (
    v_institution_id, p_product_id, NULL, NULL,
    v_group_id, 'CLASSIFICATION', 'LOT_CLASSIFICATION', -p_quantity,
    v_unit, 'manual',
    'LOTCLASS_CREATE_NULL_' || v_created_lot.id::text,
    v_user_id
  );

  INSERT INTO public.inventory_movements (
    institution_id, product_id, lot_id, lot_number_snapshot,
    movement_group_id, movement_kind, movement_type, quantity,
    unit_snapshot, source_type, idempotency_key, created_by
  ) VALUES (
    v_institution_id, p_product_id, v_created_lot.id, v_lot_number,
    v_group_id, 'CLASSIFICATION', 'LOT_CLASSIFICATION', p_quantity,
    v_unit, 'manual',
    'LOTCLASS_CREATE_LOT_' || v_created_lot.id::text,
    v_user_id
  );
END IF;

RETURN v_created_lot;
END;
$function$;

-- ============================================================
-- 6. Guard archived lots in update_product_lot
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_product_lot(
  p_lot_id uuid, p_lot_number text DEFAULT NULL,
  p_quantity numeric DEFAULT NULL, p_expiration_date date DEFAULT NULL,
  p_expected_quantity numeric DEFAULT NULL
) RETURNS public.product_lots
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_old_lot public.product_lots;
  v_product_id uuid;
  v_product_stock numeric;
  v_old_sum numeric;
  v_new_sum numeric;
  v_old_lot_quantity numeric;
  v_updated_lot public.product_lots;
  v_update_lot_number text;
  v_update_quantity numeric;
  v_update_expiration_date date;
  v_ledger_active boolean;
  v_group_id uuid;
  v_unit text;
  v_delta numeric;
BEGIN
IF v_user_id IS NULL THEN
RAISE EXCEPTION 'AUTH_REQUIRED';
END IF;

SELECT institution_id INTO v_institution_id
FROM public.user_profiles
WHERE id = v_user_id;

IF NOT FOUND THEN
RAISE EXCEPTION 'PROFILE_NOT_FOUND';
END IF;

IF v_institution_id IS NULL THEN
RAISE EXCEPTION 'PROFILE_NO_INSTITUTION';
END IF;

IF p_lot_number IS NOT NULL THEN
v_update_lot_number := btrim(p_lot_number);
IF v_update_lot_number = '' THEN
RAISE EXCEPTION 'LOT_NUMBER_REQUIRED';
END IF;
END IF;

IF p_quantity IS NOT NULL AND p_quantity < 0 THEN
RAISE EXCEPTION 'INVALID_QUANTITY';
END IF;

IF p_quantity IS NOT NULL AND p_expected_quantity IS NULL THEN
RAISE EXCEPTION 'EXPECTED_QUANTITY_REQUIRED';
END IF;

SELECT * INTO v_old_lot
FROM public.product_lots
WHERE id = p_lot_id;

IF NOT FOUND THEN
RAISE EXCEPTION 'LOT_NOT_FOUND';
END IF;

-- Block archived lots from being updated
IF v_old_lot.archived_at IS NOT NULL THEN
RAISE EXCEPTION 'LOT_ARCHIVED';
END IF;

v_product_id := v_old_lot.product_id;

SELECT quantity_in_stock INTO v_product_stock
FROM public.products
WHERE id = v_product_id
AND institution_id = v_institution_id
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
END IF;

SELECT * INTO v_old_lot
FROM public.product_lots
WHERE id = p_lot_id
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'LOT_NOT_FOUND';
END IF;

v_old_lot_quantity := v_old_lot.quantity;

IF p_quantity IS NOT NULL THEN
IF p_expected_quantity IS NULL OR p_expected_quantity != v_old_lot_quantity THEN
RAISE EXCEPTION 'LOT_QUANTITY_STALE';
END IF;
END IF;

IF v_update_lot_number IS NOT NULL AND v_update_lot_number != v_old_lot.lot_number THEN
IF EXISTS (
SELECT 1 FROM public.product_lots
WHERE product_id = v_product_id
AND lot_number = v_update_lot_number
AND id != p_lot_id
AND archived_at IS NULL
) THEN
RAISE EXCEPTION 'LOT_NUMBER_ALREADY_EXISTS';
END IF;
END IF;

SELECT COALESCE(SUM(quantity), 0) INTO v_old_sum
FROM public.product_lots
WHERE product_id = v_product_id;

v_new_sum := v_old_sum - v_old_lot_quantity + COALESCE(p_quantity, v_old_lot_quantity);

IF v_old_sum <= v_product_stock THEN
IF v_new_sum > v_product_stock THEN
RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
END IF;
ELSE
IF v_new_sum > v_old_sum THEN
RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
END IF;
END IF;

v_update_lot_number := COALESCE(v_update_lot_number, v_old_lot.lot_number);
v_update_quantity := COALESCE(p_quantity, v_old_lot_quantity);
v_update_expiration_date := COALESCE(p_expiration_date, v_old_lot.expiration_date);

UPDATE public.product_lots
SET
lot_number = v_update_lot_number,
quantity = v_update_quantity,
expiration_date = v_update_expiration_date,
updated_at = now()
WHERE id = p_lot_id
RETURNING * INTO v_updated_lot;

SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

IF v_ledger_active AND p_quantity IS NOT NULL AND p_quantity != v_old_lot_quantity THEN
  v_group_id := gen_random_uuid();
  v_delta := p_quantity - v_old_lot_quantity;
  SELECT unit INTO v_unit FROM public.products WHERE id = v_product_id;

  IF v_delta > 0 THEN
    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      movement_group_id, movement_kind, movement_type, quantity,
      unit_snapshot, source_type, idempotency_key, created_by
    ) VALUES (
      v_institution_id, v_product_id, NULL, NULL,
      v_group_id, 'CLASSIFICATION', 'LOT_CLASSIFICATION', -v_delta,
      v_unit, 'manual',
      'LOTCLASS_UPD_NULL_' || p_lot_id::text || '_' || v_group_id::text,
      v_user_id
    );

    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      movement_group_id, movement_kind, movement_type, quantity,
      unit_snapshot, source_type, idempotency_key, created_by
    ) VALUES (
      v_institution_id, v_product_id, p_lot_id, v_update_lot_number,
      v_group_id, 'CLASSIFICATION', 'LOT_CLASSIFICATION', v_delta,
      v_unit, 'manual',
      'LOTCLASS_UPD_LOT_' || p_lot_id::text || '_' || v_group_id::text,
      v_user_id
    );
  ELSIF v_delta < 0 THEN
    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      movement_group_id, movement_kind, movement_type, quantity,
      unit_snapshot, source_type, idempotency_key, created_by
    ) VALUES (
      v_institution_id, v_product_id, p_lot_id, v_update_lot_number,
      v_group_id, 'CLASSIFICATION', 'LOT_CLASSIFICATION', v_delta,
      v_unit, 'manual',
      'LOTCLASS_UPD_LOT_' || p_lot_id::text || '_' || v_group_id::text,
      v_user_id
    );

    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      movement_group_id, movement_kind, movement_type, quantity,
      unit_snapshot, source_type, idempotency_key, created_by
    ) VALUES (
      v_institution_id, v_product_id, NULL, NULL,
      v_group_id, 'CLASSIFICATION', 'LOT_CLASSIFICATION', -v_delta,
      v_unit, 'manual',
      'LOTCLASS_UPD_NULL_' || p_lot_id::text || '_' || v_group_id::text,
      v_user_id
    );
  END IF;
END IF;

RETURN v_updated_lot;
END;
$function$;

-- ============================================================
-- Grant EXECUTE on new RPCs to authenticated only
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.add_inventory_stock(uuid, numeric, text, uuid, text, text, numeric, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_inventory_stock(uuid, numeric, text, uuid, text, text, numeric, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, numeric, text, text, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(uuid, numeric, text, text, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.archive_product_lot(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_product_lot(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.check_inventory_reconciliation() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_inventory_reconciliation() TO authenticated;