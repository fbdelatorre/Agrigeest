/*
# Create update_product_details RPC with optimistic concurrency

## Purpose
Replaces the direct `supabase.from('products').update(...)` call with a
SECURITY DEFINER RPC that implements optimistic concurrency control via
`p_expected_updated_at`. Prevents stale-write / lost-update when two users
edit the same product concurrently.

## Existing trigger
`update_products_updated_at` BEFORE UPDATE ON products → `update_updated_at_column()`
This trigger auto-updates `updated_at = now()` on every UPDATE. The RPC does
NOT set `updated_at` manually — the trigger handles it.

## Optimistic concurrency
1. SELECT ... FOR UPDATE to lock the row
2. Compare current `updated_at` with `p_expected_updated_at` (ms precision, to
   handle JS Date microsecond truncation)
3. If different → RAISE EXCEPTION 'PRODUCT_STALE'
4. If equal → proceed with UPDATE

## Security
- SECURITY DEFINER, SET search_path = public, pg_temp
- REVOKE FROM PUBLIC, anon; GRANT TO authenticated
- institution_id derived from auth context, never from client
- FORBIDDEN if product belongs to different institution

## No data changes
- No UPDATE/INSERT/DELETE on existing rows
- No RLS changes
- No changes to other RPCs
*/

CREATE OR REPLACE FUNCTION public.update_product_details(
  p_product_id uuid,
  p_name text,
  p_category text,
  p_unit text,
  p_min_stock_level numeric,
  p_price numeric,
  p_supplier text,
  p_description text,
  p_expected_updated_at timestamptz
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_product public.products;
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

  -- 2. Lock product row and verify institution
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  IF v_product.institution_id IS DISTINCT FROM v_institution_id THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- 3. Optimistic concurrency check (millisecond precision for JS Date compat)
  IF date_trunc('milliseconds', v_product.updated_at) != date_trunc('milliseconds', p_expected_updated_at) THEN
    RAISE EXCEPTION 'PRODUCT_STALE';
  END IF;

  -- 4. Validate fields
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

  -- 5. UPDATE (trigger auto-updates updated_at)
  UPDATE public.products
  SET
    name = p_name,
    category = p_category,
    unit = p_unit,
    min_stock_level = p_min_stock_level,
    price = p_price,
    supplier = p_supplier,
    description = p_description
  WHERE id = p_product_id
  RETURNING * INTO v_product;

  RETURN v_product;
END;
$$;

-- Grants
REVOKE ALL ON FUNCTION public.update_product_details(
  uuid, text, text, text, numeric, numeric, text, text, timestamptz
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_product_details(
  uuid, text, text, text, numeric, numeric, text, text, timestamptz
) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_product_details(
  uuid, text, text, text, numeric, numeric, text, text, timestamptz
) TO authenticated;
