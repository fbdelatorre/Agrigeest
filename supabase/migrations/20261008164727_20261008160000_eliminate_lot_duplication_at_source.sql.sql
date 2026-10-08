/*
# Eliminate Lot Duplication at Source

## Purpose
Prevent duplicate product lot records by enforcing uniqueness at the database level
and adding explicit validation in all lot-mutation RPCs. Also removes direct
INSERT/UPDATE/DELETE table grants from authenticated/anon so all lot mutations
must go through the SECURITY DEFINER RPCs.

## Decision (approved)
For a given product, (product_id, lot_number) represents a single physical lot.
Future inventory_movements will track separate receipts. Therefore
(product_id, lot_number) must be unique.

## Changes

### 1. UNIQUE constraint
- Add UNIQUE(product_id, lot_number) on product_lots.
- Safe to apply: PRE validation confirmed zero duplicate groups.

### 2. create_product_lot — updated
- TRIM p_lot_number before validation and INSERT.
- Reject empty lot_number after trim.
- Check for existing (product_id, lot_number) before INSERT → LOT_NUMBER_ALREADY_EXISTS.
- Catch unique_violation (SQLSTATE 23505) and re-raise as LOT_NUMBER_ALREADY_EXISTS.
- All existing logic preserved: SECURITY DEFINER, auth, institution, FOR UPDATE lock,
  stock invariant, no quantity_in_stock change.

### 3. create_product_with_lots — updated
- TRIM each lot_number in the payload before duplicate-within-payload check and INSERT.
- This ensures " ABC123 " and "ABC123" are treated as the same lot within one payload.
- All existing logic preserved: product INSERT, set-based lot INSERT, stock calculation.

### 4. update_product_lot — updated
- TRIM p_lot_number when provided.
- When lot_number is being changed, check if another lot for the same product
  already has that lot_number → LOT_NUMBER_ALREADY_EXISTS.
- Exclude the lot being edited from the check (it can keep its own number).
- All existing logic preserved: optimistic concurrency, FOR UPDATE locks, stock invariant.

### 5. delete_product_lot — unchanged
- No changes needed. Confirmed compatible with UNIQUE constraint.

### 6. Grants revoked
- REVOKE INSERT, UPDATE, DELETE on product_lots FROM authenticated.
- REVOKE INSERT, UPDATE, DELETE on product_lots FROM anon.
- SELECT preserved for both roles (RLS-gated).
- service_role and postgres retain all privileges.
- RLS policies for INSERT/UPDATE/DELETE remain in place but are now unenforceable
  for authenticated/anon because table-level grants are revoked. They are kept
  to avoid unnecessary cosmetic changes; the grants are the enforceable gate.

## Security
- All 4 lot RPCs remain SECURITY DEFINER, owned by postgres, search_path = public, pg_temp.
- EXECUTE on all 4 RPCs: authenticated only (anon/PUBLIC revoked, preserved from prior migrations).
- Table-level mutation grants removed from authenticated and anon.
- RLS SELECT policy preserved for frontend reads.
- No FK changes. No data changes.

## Rollback
- DROP CONSTRAINT product_lots_product_id_lot_number_key
- Restore previous RPC versions (without TRIM/duplicate check)
- GRANT INSERT, UPDATE, DELETE ON product_lots TO authenticated, anon
*/

-- ============================================================
-- 1. UNIQUE constraint
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_lots_product_id_lot_number_key'
      AND conrelid = 'public.product_lots'::regclass
  ) THEN
    ALTER TABLE public.product_lots
      ADD CONSTRAINT product_lots_product_id_lot_number_key UNIQUE (product_id, lot_number);
  END IF;
END $$;

-- ============================================================
-- 2. create_product_lot — TRIM + duplicate check + unique_violation handling
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_product_lot(
  p_product_id uuid,
  p_lot_number text,
  p_quantity numeric,
  p_expiration_date date DEFAULT NULL
)
RETURNS public.product_lots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_product_stock numeric;
  v_old_sum numeric;
  v_new_sum numeric;
  v_created_lot public.product_lots;
  v_lot_number text;
BEGIN
  -- 1. Authentication
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

  -- 2. Validate inputs (TRIM lot_number)
  v_lot_number := btrim(p_lot_number);

  IF v_lot_number IS NULL OR v_lot_number = '' THEN
    RAISE EXCEPTION 'LOT_NUMBER_REQUIRED';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  -- 3. Lock product row FOR UPDATE (serializes with operation RPCs)
  SELECT quantity_in_stock INTO v_product_stock
  FROM public.products
  WHERE id = p_product_id
    AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  -- 4. Compute current SUM of lots for this product
  SELECT COALESCE(SUM(quantity), 0) INTO v_old_sum
  FROM public.product_lots
  WHERE product_id = p_product_id;

  -- 5. Validate invariant
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

  -- 6. Check for existing lot with same (product_id, lot_number)
  IF EXISTS (
    SELECT 1 FROM public.product_lots
    WHERE product_id = p_product_id AND lot_number = v_lot_number
  ) THEN
    RAISE EXCEPTION 'LOT_NUMBER_ALREADY_EXISTS';
  END IF;

  -- 7. INSERT lot
  BEGIN
    INSERT INTO public.product_lots (
      product_id,
      lot_number,
      quantity,
      expiration_date
    )
    VALUES (
      p_product_id,
      v_lot_number,
      p_quantity,
      p_expiration_date
    )
    RETURNING * INTO v_created_lot;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'LOT_NUMBER_ALREADY_EXISTS';
  END;

  -- 8. Return created lot
  RETURN v_created_lot;
END;
$$;

-- Re-apply grants for create_product_lot
REVOKE ALL ON FUNCTION public.create_product_lot(
  uuid, text, numeric, date
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_product_lot(
  uuid, text, numeric, date
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_product_lot(
  uuid, text, numeric, date
) TO authenticated;

-- ============================================================
-- 3. create_product_with_lots — TRIM lot_numbers in payload
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_product_with_lots(
  p_name text,
  p_category text,
  p_unit text,
  p_min_stock_level numeric DEFAULT 0,
  p_price numeric DEFAULT 0,
  p_supplier text DEFAULT NULL::text,
  p_description text DEFAULT NULL::text,
  p_untracked_quantity numeric DEFAULT 0,
  p_lots jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_lot jsonb;
  v_lot_number text;
  v_lot_quantity numeric;
  v_lots_total numeric := 0;
  v_total numeric;
  v_product_id uuid;
  v_product_row public.products;
  v_created_lots jsonb;
  v_lot_count int;
  v_i int;
  v_seen_lot_numbers text[] := '{}';
  v_trimmed_lots jsonb := '[]'::jsonb;
BEGIN
  -- 1. Authentication
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
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

  -- 2. Validate product fields
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'NAME_REQUIRED';
  END IF;

  IF p_category IS NULL OR btrim(p_category) = '' THEN
    RAISE EXCEPTION 'CATEGORY_REQUIRED';
  END IF;

  IF p_unit IS NULL OR btrim(p_unit) = '' THEN
    RAISE EXCEPTION 'UNIT_REQUIRED';
  END IF;

  IF p_min_stock_level IS NULL OR p_min_stock_level < 0 THEN
    RAISE EXCEPTION 'INVALID_MIN_STOCK_LEVEL';
  END IF;

  IF p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'INVALID_PRICE';
  END IF;

  -- 3. Validate untracked quantity
  IF p_untracked_quantity IS NULL THEN
    p_untracked_quantity := 0;
  END IF;

  IF p_untracked_quantity < 0 THEN
    RAISE EXCEPTION 'INVALID_UNTRACKED_QUANTITY';
  END IF;

  -- 4. Validate lots: TRIM each lot_number, build cleaned array, check duplicates
  v_lot_count := jsonb_array_length(COALESCE(p_lots, '[]'::jsonb));

  FOR v_i IN 0..v_lot_count - 1 LOOP
    v_lot := p_lots->v_i;

    v_lot_number := btrim(v_lot->>'lot_number');
    IF v_lot_number IS NULL OR v_lot_number = '' THEN
      RAISE EXCEPTION 'LOT_NUMBER_REQUIRED';
    END IF;

    v_lot_quantity := (v_lot->>'quantity')::numeric;
    IF v_lot_quantity IS NULL OR v_lot_quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_LOT_QUANTITY';
    END IF;

    -- Check duplicate lot_number within this payload (after trim)
    IF v_lot_number = ANY(v_seen_lot_numbers) THEN
      RAISE EXCEPTION 'DUPLICATE_LOT_NUMBER';
    END IF;
    v_seen_lot_numbers := array_append(v_seen_lot_numbers, v_lot_number);

    -- Accumulate total
    v_lots_total := v_lots_total + v_lot_quantity;

    -- Build trimmed lots array for INSERT
    v_trimmed_lots := v_trimmed_lots || jsonb_build_object(
      'lot_number', v_lot_number,
      'quantity', v_lot->>'quantity',
      'expiration_date', v_lot->>'expiration_date'
    );
  END LOOP;

  -- 5. Calculate total stock
  v_total := v_lots_total + p_untracked_quantity;

  -- 6. INSERT product
  INSERT INTO public.products (
    name, category, unit, quantity_in_stock,
    min_stock_level, price, supplier, description,
    institution_id
  )
  VALUES (
    p_name, p_category, p_unit, v_total,
    p_min_stock_level, p_price, p_supplier, p_description,
    v_institution_id
  )
  RETURNING * INTO v_product_row;

  v_product_id := v_product_row.id;

  -- 7. INSERT all lots (set-based, using trimmed lot_numbers)
  IF v_lot_count > 0 THEN
    INSERT INTO public.product_lots (product_id, lot_number, quantity, expiration_date)
    SELECT
      v_product_id,
      (lot->>'lot_number'),
      (lot->>'quantity')::numeric,
      CASE WHEN lot->>'expiration_date' IS NOT NULL AND (lot->>'expiration_date') != ''
        THEN (lot->>'expiration_date')::date
        ELSE NULL
      END
    FROM jsonb_array_elements(v_trimmed_lots) AS t(lot);
  END IF;

  -- 8. Re-fetch created lots for the return value
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pl.id,
    'product_id', pl.product_id,
    'lot_number', pl.lot_number,
    'quantity', pl.quantity,
    'expiration_date', pl.expiration_date,
    'created_at', pl.created_at,
    'updated_at', pl.updated_at
  ) ORDER BY pl.created_at), '[]'::jsonb)
  INTO v_created_lots
  FROM public.product_lots pl
  WHERE pl.product_id = v_product_id;

  -- 9. Return result
  RETURN jsonb_build_object(
    'product', jsonb_build_object(
      'id', v_product_row.id,
      'name', v_product_row.name,
      'category', v_product_row.category,
      'unit', v_product_row.unit,
      'quantity_in_stock', v_product_row.quantity_in_stock,
      'min_stock_level', v_product_row.min_stock_level,
      'price', v_product_row.price,
      'supplier', v_product_row.supplier,
      'description', v_product_row.description,
      'institution_id', v_product_row.institution_id,
      'created_at', v_product_row.created_at,
      'updated_at', v_product_row.updated_at
    ),
    'lots', v_created_lots
  );
END;
$$;

-- Re-apply grants for create_product_with_lots
REVOKE ALL ON FUNCTION public.create_product_with_lots(
  text, text, text, numeric, numeric, text, text, numeric, jsonb
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_product_with_lots(
  text, text, text, numeric, numeric, text, text, numeric, jsonb
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_product_with_lots(
  text, text, text, numeric, numeric, text, text, numeric, jsonb
) TO authenticated;

-- ============================================================
-- 4. update_product_lot — TRIM + duplicate check on rename
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_product_lot(
  p_lot_id uuid,
  p_lot_number text DEFAULT NULL::text,
  p_quantity numeric DEFAULT NULL::numeric,
  p_expiration_date date DEFAULT NULL::date,
  p_expected_quantity numeric DEFAULT NULL::numeric
)
RETURNS public.product_lots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
BEGIN
  -- 1. Authentication
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

  -- 2. Validate inputs (TRIM lot_number when provided)
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

  -- 3. Read current lot to get product_id
  SELECT * INTO v_old_lot
  FROM public.product_lots
  WHERE id = p_lot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND';
  END IF;

  v_product_id := v_old_lot.product_id;

  -- 4. Lock product row FOR UPDATE
  SELECT quantity_in_stock INTO v_product_stock
  FROM public.products
  WHERE id = v_product_id
    AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  -- 5. Lock lot row FOR UPDATE
  SELECT * INTO v_old_lot
  FROM public.product_lots
  WHERE id = p_lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND';
  END IF;

  v_old_lot_quantity := v_old_lot.quantity;

  -- 6. Optimistic concurrency check
  IF p_quantity IS NOT NULL THEN
    IF p_expected_quantity IS NULL OR p_expected_quantity != v_old_lot_quantity THEN
      RAISE EXCEPTION 'LOT_QUANTITY_STALE';
    END IF;
  END IF;

  -- 7. Duplicate lot_number check (when renaming)
  IF v_update_lot_number IS NOT NULL AND v_update_lot_number != v_old_lot.lot_number THEN
    IF EXISTS (
      SELECT 1 FROM public.product_lots
      WHERE product_id = v_product_id
        AND lot_number = v_update_lot_number
        AND id != p_lot_id
    ) THEN
      RAISE EXCEPTION 'LOT_NUMBER_ALREADY_EXISTS';
    END IF;
  END IF;

  -- 8. Compute old_sum and new_sum
  SELECT COALESCE(SUM(quantity), 0) INTO v_old_sum
  FROM public.product_lots
  WHERE product_id = v_product_id;

  v_new_sum := v_old_sum - v_old_lot_quantity + COALESCE(p_quantity, v_old_lot_quantity);

  -- 9. Validate invariant
  IF v_old_sum <= v_product_stock THEN
    IF v_new_sum > v_product_stock THEN
      RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
    END IF;
  ELSE
    IF v_new_sum > v_old_sum THEN
      RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
    END IF;
  END IF;

  -- 10. Build update fields
  v_update_lot_number := COALESCE(v_update_lot_number, v_old_lot.lot_number);
  v_update_quantity := COALESCE(p_quantity, v_old_lot_quantity);
  v_update_expiration_date := COALESCE(p_expiration_date, v_old_lot.expiration_date);

  -- 11. UPDATE lot
  UPDATE public.product_lots
  SET
    lot_number = v_update_lot_number,
    quantity = v_update_quantity,
    expiration_date = v_update_expiration_date,
    updated_at = now()
  WHERE id = p_lot_id
  RETURNING * INTO v_updated_lot;

  -- 12. Return updated lot
  RETURN v_updated_lot;
END;
$$;

-- Re-apply grants for update_product_lot
REVOKE ALL ON FUNCTION public.update_product_lot(
  uuid, text, numeric, date, numeric
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_product_lot(
  uuid, text, numeric, date, numeric
) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_product_lot(
  uuid, text, numeric, date, numeric
) TO authenticated;

-- ============================================================
-- 5. Revoke direct mutation grants on product_lots
-- ============================================================
REVOKE INSERT, UPDATE, DELETE ON public.product_lots FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.product_lots FROM anon;
