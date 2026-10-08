/*
# Add optimistic concurrency (expected_quantity) to update_product_lot

## Purpose
Prevents stale-write when a user edits a lot's quantity on a screen that
was loaded before another transaction (e.g. an operation RPC) modified
the same lot's quantity. Without this, the manual edit overwrites the
operation's stock movement silently.

## Change
- DROP old update_product_lot(uuid, text, numeric, date) — no CASCADE
- CREATE new update_product_lot(uuid, text, numeric, date, numeric)
  with p_expected_quantity as the last parameter
- Re-apply all security: SECURITY DEFINER, search_path, REVOKE, GRANT
- Preserve all existing validations (institution isolation, invariant, legacy exception)
- New logic: when p_quantity IS NOT NULL, require p_expected_quantity
  and compare it against the locked DB value; reject with LOT_QUANTITY_STALE
  if they differ

## No data changes
- No UPDATE/INSERT/DELETE on any table
- No RLS changes
- No changes to other RPCs
*/

-- 1. Drop old signature (no CASCADE — only this one function)
DROP FUNCTION IF EXISTS public.update_product_lot(uuid, text, numeric, date);

-- 2. Create new function with p_expected_quantity
CREATE OR REPLACE FUNCTION public.update_product_lot(
  p_lot_id uuid,
  p_lot_number text DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_expiration_date date DEFAULT NULL,
  p_expected_quantity numeric DEFAULT NULL
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

  -- 3. Require p_expected_quantity when p_quantity is provided
  IF p_quantity IS NOT NULL AND p_expected_quantity IS NULL THEN
    RAISE EXCEPTION 'EXPECTED_QUANTITY_REQUIRED';
  END IF;

  -- 4. Read current lot to get product_id (without lock first)
  SELECT * INTO v_old_lot
  FROM public.product_lots
  WHERE id = p_lot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND';
  END IF;

  v_product_id := v_old_lot.product_id;

  -- 5. Lock product row FOR UPDATE (same order as operation RPCs: product first)
  SELECT quantity_in_stock INTO v_product_stock
  FROM public.products
  WHERE id = v_product_id
    AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  -- 6. Lock lot row FOR UPDATE (product first, then lot — no deadlock)
  SELECT * INTO v_old_lot
  FROM public.product_lots
  WHERE id = p_lot_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOT_NOT_FOUND';
  END IF;

  -- Use locked values as source of truth
  v_old_lot_quantity := v_old_lot.quantity;

  -- 7. Optimistic concurrency check: compare expected vs actual
  IF p_quantity IS NOT NULL THEN
    IF p_expected_quantity IS NULL OR p_expected_quantity != v_old_lot_quantity THEN
      RAISE EXCEPTION 'LOT_QUANTITY_STALE';
    END IF;
  END IF;

  -- 8. Compute old_sum and new_sum using DB values
  SELECT COALESCE(SUM(quantity), 0) INTO v_old_sum
  FROM public.product_lots
  WHERE product_id = v_product_id;

  v_new_sum := v_old_sum - v_old_lot_quantity + COALESCE(p_quantity, v_old_lot_quantity);

  -- 9. Validate invariant
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

  -- 10. Build update fields (only update provided fields)
  v_update_lot_number := COALESCE(p_lot_number, v_old_lot.lot_number);
  v_update_quantity := COALESCE(p_quantity, v_old_lot_quantity);
  v_update_expiration_date := COALESCE(p_expiration_date, v_old_lot.expiration_date);

  -- 11. UPDATE lot (does NOT alter products.quantity_in_stock)
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

-- 3. Re-apply grants for new function signature
REVOKE ALL ON FUNCTION public.update_product_lot(
  uuid, text, numeric, date, numeric
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_product_lot(
  uuid, text, numeric, date, numeric
) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_product_lot(
  uuid, text, numeric, date, numeric
) TO authenticated;
