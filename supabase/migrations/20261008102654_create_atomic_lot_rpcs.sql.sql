/*
# Create atomic product lot RPCs (create, update, delete)

## Purpose
Replaces the frontend's multi-step lot management flow (INSERT/UPDATE/DELETE lot +
recompute SUM(lots) + write quantity_in_stock) with single atomic PostgreSQL functions.

## New Business Rule (ETAPA 3J)
- products.quantity_in_stock = ESTOQUE TOTAL REAL (physical stock)
- product_lots.quantity = PARCELA RASTREADA (tracked/attributed to this lot)
- SUM(product_lots.quantity) is NOT the total stock
- Lot mutations (create/edit/delete) do NOT alter products.quantity_in_stock
- Invariant for NEW mutations: SUM(lots) <= quantity_in_stock (when not in legacy excess)
- Legacy exception: if SUM(lots) already > quantity_in_stock, new mutations must not worsen it

## New Functions
1. public.create_product_lot(p_product_id, p_lot_number, p_quantity, p_expiration_date)
   - Derives institution_id from auth.uid() via user_profiles
   - Locks product row FOR UPDATE (serializes with operation RPCs)
   - Validates SUM(lots) + new_quantity <= quantity_in_stock (or legacy rule)
   - INSERTs lot, does NOT alter products.quantity_in_stock
   - Returns created lot row

2. public.update_product_lot(p_lot_id, p_lot_number, p_quantity, p_expiration_date)
   - Derives institution_id from auth.uid() via user_profiles
   - Locks product FOR UPDATE, then lot FOR UPDATE (same order as operation RPCs)
   - Computes old_sum and new_sum using DB values (not client state)
   - Validates new_sum <= quantity_in_stock (or legacy rule: new_sum <= old_sum)
   - UPDATEs lot, does NOT alter products.quantity_in_stock
   - Returns updated lot row

3. public.delete_product_lot(p_lot_id)
   - Derives institution_id from auth.uid() via user_profiles
   - Locks product FOR UPDATE, then lot FOR UPDATE
   - DELETEs lot, does NOT alter products.quantity_in_stock
   - Returns deleted lot row

## Security
- All 3 functions: SECURITY DEFINER, owned by postgres, search_path = public, pg_temp
- EXECUTE revoked from PUBLIC and anon
- EXECUTE granted to authenticated only
- Institution isolation enforced inside function body
- institution_id always derived from auth.uid(), never from parameters

## Lock Order
- All 3 lot RPCs lock products FOR UPDATE first, then product_lots FOR UPDATE
- This matches the operation RPCs which update products first, then product_lots
- No deadlock risk with existing operation RPCs

## Legacy Exception Rule
- If old_sum <= product.quantity_in_stock: new_sum must be <= quantity_in_stock
- If old_sum > product.quantity_in_stock (legacy excess): new_sum must be <= old_sum
- Delete is always allowed (reduces SUM)
- This prevents worsening existing divergences without correcting historical data

## Important Notes
1. No triggers, no ledger, no RLS changes
2. The 3 operation RPCs are NOT modified
3. No existing data is altered
4. p_expiration_date accepts NULL (no expiration)
5. All quantity values must be >= 0
6. Lot number is required (not empty)
*/

-- ============================================================
-- 1. create_product_lot
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

  -- 2. Validate inputs
  IF p_lot_number IS NULL OR btrim(p_lot_number) = '' THEN
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
    -- Normal case: new_sum must not exceed total stock
    IF v_new_sum > v_product_stock THEN
      RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
    END IF;
  ELSE
    -- Legacy excess case: new_sum must not worsen (must be <= old_sum)
    IF v_new_sum > v_old_sum THEN
      RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
    END IF;
  END IF;

  -- 6. INSERT lot (does NOT alter products.quantity_in_stock)
  INSERT INTO public.product_lots (
    product_id,
    lot_number,
    quantity,
    expiration_date
  )
  VALUES (
    p_product_id,
    p_lot_number,
    p_quantity,
    p_expiration_date
  )
  RETURNING * INTO v_created_lot;

  -- 7. Return created lot
  RETURN v_created_lot;
END;
$$;

-- Grants for create_product_lot
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
-- 2. update_product_lot
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_product_lot(
  p_lot_id uuid,
  p_lot_number text DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
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

  -- 2. Validate inputs
  IF p_lot_number IS NOT NULL AND btrim(p_lot_number) = '' THEN
    RAISE EXCEPTION 'LOT_NUMBER_REQUIRED';
  END IF;

  IF p_quantity IS NOT NULL AND p_quantity < 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  -- 3. Read current lot to get product_id (without lock first)
  SELECT * INTO v_old_lot
  FROM public.product_lots
  WHERE id = p_lot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND';
  END IF;

  v_product_id := v_old_lot.product_id;
  v_old_lot_quantity := v_old_lot.quantity;

  -- 4. Lock product row FOR UPDATE (same order as operation RPCs: product first)
  SELECT quantity_in_stock INTO v_product_stock
  FROM public.products
  WHERE id = v_product_id
    AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  -- 5. Lock lot row FOR UPDATE (product first, then lot — no deadlock)
  SELECT * INTO v_old_lot
  FROM public.product_lots
  WHERE id = p_lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND';
  END IF;

  -- Use locked values as source of truth
  v_old_lot_quantity := v_old_lot.quantity;

  -- 6. Compute old_sum and new_sum using DB values
  SELECT COALESCE(SUM(quantity), 0) INTO v_old_sum
  FROM public.product_lots
  WHERE product_id = v_product_id;

  v_new_sum := v_old_sum - v_old_lot_quantity + COALESCE(p_quantity, v_old_lot_quantity);

  -- 7. Validate invariant
  IF v_old_sum <= v_product_stock THEN
    -- Normal case: new_sum must not exceed total stock
    IF v_new_sum > v_product_stock THEN
      RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
    END IF;
  ELSE
    -- Legacy excess case: new_sum must not worsen (must be <= old_sum)
    IF v_new_sum > v_old_sum THEN
      RAISE EXCEPTION 'LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK';
    END IF;
  END IF;

  -- 8. Build update fields (only update provided fields)
  v_update_lot_number := COALESCE(p_lot_number, v_old_lot.lot_number);
  v_update_quantity := COALESCE(p_quantity, v_old_lot_quantity);
  v_update_expiration_date := COALESCE(p_expiration_date, v_old_lot.expiration_date);

  -- 9. UPDATE lot (does NOT alter products.quantity_in_stock)
  UPDATE public.product_lots
  SET
    lot_number = v_update_lot_number,
    quantity = v_update_quantity,
    expiration_date = v_update_expiration_date,
    updated_at = now()
  WHERE id = p_lot_id
  RETURNING * INTO v_updated_lot;

  -- 10. Return updated lot
  RETURN v_updated_lot;
END;
$$;

-- Grants for update_product_lot
REVOKE ALL ON FUNCTION public.update_product_lot(
  uuid, text, numeric, date
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_product_lot(
  uuid, text, numeric, date
) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_product_lot(
  uuid, text, numeric, date
) TO authenticated;

-- ============================================================
-- 3. delete_product_lot
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_product_lot(
  p_lot_id uuid
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
  v_deleted_lot public.product_lots;
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

  -- 2. Read current lot to get product_id
  SELECT * INTO v_old_lot
  FROM public.product_lots
  WHERE id = p_lot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND';
  END IF;

  v_product_id := v_old_lot.product_id;

  -- 3. Lock product row FOR UPDATE (same order as operation RPCs: product first)
  PERFORM 1
  FROM public.products
  WHERE id = v_product_id
    AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  -- 4. Lock lot row FOR UPDATE (product first, then lot — no deadlock)
  SELECT * INTO v_old_lot
  FROM public.product_lots
  WHERE id = p_lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND';
  END IF;

  -- 5. DELETE lot (does NOT alter products.quantity_in_stock)
  DELETE FROM public.product_lots
  WHERE id = p_lot_id
  RETURNING * INTO v_deleted_lot;

  -- 6. Return deleted lot
  RETURN v_deleted_lot;
END;
$$;

-- Grants for delete_product_lot
REVOKE ALL ON FUNCTION public.delete_product_lot(
  uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.delete_product_lot(
  uuid
) FROM anon;

GRANT EXECUTE ON FUNCTION public.delete_product_lot(
  uuid
) TO authenticated;
