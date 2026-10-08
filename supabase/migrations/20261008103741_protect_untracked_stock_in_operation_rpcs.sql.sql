/*
# Protect untracked stock in operation RPCs

## Purpose
Closes the P1 risk identified in ETAPA 3J: operations without lotId could
consume more than the untracked stock (quantity_in_stock - SUM(lots)),
causing SUM(lots) > quantity_in_stock.

## Changes
1. create_operation_with_stock: adds untracked stock validation for products
   used without lotId. Before deducting stock, locks each affected product
   FOR UPDATE, computes untracked = stock - SUM(lots), and validates
   usage_without_lot <= untracked. Raises INSUFFICIENT_UNTRACKED_STOCK if not.

2. update_operation_with_stock: adds untracked stock validation for products
   where the no-lot usage INCREASES (delta_without_lot > 0). Locks affected
   products FOR UPDATE, computes untracked, validates delta <= untracked.

3. delete_operation_with_stock: NOT modified. Confirmed compatible — returns
   stock to quantity_in_stock for no-lot items (increases untracked), and
   returns to both product and lot for lot items (untracked unchanged).

## New Business Rule
- Operation WITHOUT lotId: can only consume untracked stock
  (quantity_in_stock - SUM(product_lots.quantity))
- Operation WITH lotId: consumes both total and tracked stock simultaneously
  (untracked remains unchanged)
- Mixed usage (same product, some with lot, some without): validated separately
- Legacy excess (tracked > total): blocks any no-lot consumption

## Lock Order
- New validation step: SELECT products FOR UPDATE (deterministic UUID order)
- Existing deduction step: UPDATE products (uses same locked rows)
- Existing lot deduction: UPDATE product_lots
- Order: products -> product_lots (compatible with lot RPCs from ETAPA 3J)

## Security
- All functions retain: SECURITY DEFINER, search_path = public, pg_temp
- REVOKE FROM PUBLIC/anon, GRANT TO authenticated
- Institution isolation preserved
- No RLS changes, no data changes, no lot RPC changes

## Important Notes
1. Signatures are IDENTICAL to existing functions (CREATE OR REPLACE, no overload)
2. delete_operation_with_stock is NOT modified
3. 3 lot RPCs from ETAPA 3J are NOT modified
4. No existing data is altered
5. Historical orphan product rules from ETAPA 3E preserved
6. The untracked check uses a single condition: untracked < delta_without_lot
   This covers both normal (untracked >= 0) and legacy (untracked < 0) cases
*/

-- ============================================================
-- 1. CREATE OR REPLACE create_operation_with_stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_operation_with_stock(
  p_area_id uuid,
  p_type text,
  p_start_date timestamptz,
  p_description text,
  p_operated_by text,
  p_season_id uuid DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_next_operation_date timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_products_used jsonb DEFAULT NULL,
  p_operation_size numeric DEFAULT NULL,
  p_yield_per_hectare numeric DEFAULT NULL,
  p_seeds_per_hectare numeric DEFAULT NULL
)
RETURNS public.operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_products jsonb := COALESCE(p_products_used, '[]'::jsonb);
  v_item jsonb;
  v_product_id text;
  v_lot_id text;
  v_quantity numeric;
  v_dose numeric;
  v_product_uuid uuid;
  v_lot_uuid uuid;
  v_agg_product RECORD;
  v_agg_lot RECORD;
  v_updated_count int;
  v_operation public.operations;
  v_product_agg jsonb;
  v_lot_agg jsonb;
  v_product_no_lot_agg jsonb;
  v_product_stock numeric;
  v_tracked_stock numeric;
  v_untracked_stock numeric;
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

  -- 2. Validate area
  PERFORM 1 FROM public.areas
  WHERE id = p_area_id AND institution_id = v_institution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AREA_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  -- 3. Validate season (only when non-NULL)
  IF p_season_id IS NOT NULL THEN
    PERFORM 1 FROM public.seasons
    WHERE id = p_season_id AND institution_id = v_institution_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SEASON_NOT_FOUND_OR_FORBIDDEN';
    END IF;
  END IF;

  -- 4. Validate products_used is an array
  IF jsonb_typeof(v_products) != 'array' THEN
    RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
  END IF;

  -- 5. Validate each item and collect aggregates
  v_product_agg := '{}'::jsonb;
  v_lot_agg := '{}'::jsonb;
  v_product_no_lot_agg := '{}'::jsonb;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_products)
  LOOP
    IF jsonb_typeof(v_item) != 'object' THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END IF;

    v_product_id := v_item ->> 'productId';
    IF v_product_id IS NULL OR v_product_id = '' THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END IF;

    BEGIN
      v_product_uuid := v_product_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END;

    BEGIN
      v_quantity := (v_item ->> 'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END IF;

    IF v_item ? 'dose' AND (v_item ->> 'dose') IS NOT NULL THEN
      BEGIN
        v_dose := (v_item ->> 'dose')::numeric;
      EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
        RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
      END;
      IF v_dose < 0 THEN
        RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
      END IF;
    END IF;

    v_lot_id := v_item ->> 'lotId';
    IF v_lot_id IS NULL OR v_lot_id = '' THEN
      v_lot_id := NULL;
      v_lot_uuid := NULL;
    ELSE
      BEGIN
        v_lot_uuid := v_lot_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
      END;
    END IF;

    -- Aggregate by productId
    v_product_agg := jsonb_set(
      v_product_agg,
      ARRAY[v_product_id],
      to_jsonb(COALESCE((v_product_agg ->> v_product_id)::numeric, 0) + v_quantity)
    );

    -- Aggregate by lotId when present
    IF v_lot_uuid IS NOT NULL THEN
      v_lot_agg := jsonb_set(
        v_lot_agg,
        ARRAY[v_lot_id],
        to_jsonb(COALESCE((v_lot_agg ->> v_lot_id)::numeric, 0) + v_quantity)
      );
    ELSE
      -- Aggregate no-lot usage by productId
      v_product_no_lot_agg := jsonb_set(
        v_product_no_lot_agg,
        ARRAY[v_product_id],
        to_jsonb(COALESCE((v_product_no_lot_agg ->> v_product_id)::numeric, 0) + v_quantity)
      );
    END IF;
  END LOOP;

  -- 6. Validate each product exists and belongs to institution
  FOR v_product_id IN SELECT DISTINCT jsonb_object_keys(v_product_agg)
  LOOP
    v_product_uuid := v_product_id::uuid;
    v_quantity := (v_product_agg ->> v_product_id)::numeric;

    PERFORM 1 FROM public.products
    WHERE id = v_product_uuid AND institution_id = v_institution_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
    END IF;
  END LOOP;

  -- 7. Validate each lot exists, matches product, and belongs to institution
  FOR v_lot_id IN SELECT DISTINCT jsonb_object_keys(v_lot_agg)
  LOOP
    v_lot_uuid := v_lot_id::uuid;
    v_quantity := (v_lot_agg ->> v_lot_id)::numeric;

    SELECT elem ->> 'productId' INTO v_product_id
    FROM jsonb_array_elements(v_products) elem
    WHERE elem ->> 'lotId' = v_lot_id
    LIMIT 1;

    v_product_uuid := v_product_id::uuid;

    PERFORM 1
    FROM public.product_lots pl
    JOIN public.products p ON p.id = pl.product_id
    WHERE pl.id = v_lot_uuid
      AND pl.product_id = v_product_uuid
      AND p.institution_id = v_institution_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH';
    END IF;
  END LOOP;

  -- 7.5. Validate untracked stock for products with no-lot usage
  -- Lock products FOR UPDATE (serializes with lot RPCs) and check
  -- that untracked stock (stock - SUM(lots)) >= no-lot usage
  FOR v_product_id IN SELECT jsonb_object_keys(v_product_no_lot_agg) ORDER BY jsonb_object_keys(v_product_no_lot_agg)
  LOOP
    v_product_uuid := v_product_id::uuid;
    v_quantity := (v_product_no_lot_agg ->> v_product_id)::numeric;

    SELECT quantity_in_stock INTO v_product_stock
    FROM public.products
    WHERE id = v_product_uuid
      AND institution_id = v_institution_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
    END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO v_tracked_stock
    FROM public.product_lots
    WHERE product_id = v_product_uuid;

    v_untracked_stock := v_product_stock - v_tracked_stock;

    IF v_untracked_stock < v_quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_UNTRACKED_STOCK';
    END IF;
  END LOOP;

  -- 8. Deduct product stock atomically (deterministic order)
  FOR v_product_id IN SELECT jsonb_object_keys(v_product_agg) ORDER BY jsonb_object_keys(v_product_agg)
  LOOP
    v_product_uuid := v_product_id::uuid;
    v_quantity := (v_product_agg ->> v_product_id)::numeric;

    UPDATE public.products
    SET quantity_in_stock = quantity_in_stock - v_quantity,
        updated_at = now()
    WHERE id = v_product_uuid
      AND institution_id = v_institution_id
      AND quantity_in_stock >= v_quantity
    RETURNING id INTO v_updated_count;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INSUFFICIENT_PRODUCT_STOCK';
    END IF;
  END LOOP;

  -- 9. Deduct lot stock atomically (deterministic order)
  FOR v_lot_id IN SELECT jsonb_object_keys(v_lot_agg) ORDER BY jsonb_object_keys(v_lot_agg)
  LOOP
    v_lot_uuid := v_lot_id::uuid;
    v_quantity := (v_lot_agg ->> v_lot_id)::numeric;

    SELECT elem ->> 'productId' INTO v_product_id
    FROM jsonb_array_elements(v_products) elem
    WHERE elem ->> 'lotId' = v_lot_id
    LIMIT 1;
    v_product_uuid := v_product_id::uuid;

    UPDATE public.product_lots
    SET quantity = quantity - v_quantity,
        updated_at = now()
    WHERE id = v_lot_uuid
      AND product_id = v_product_uuid
      AND quantity >= v_quantity
    RETURNING id INTO v_updated_count;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INSUFFICIENT_LOT_STOCK';
    END IF;
  END LOOP;

  -- 10. Insert operation
  INSERT INTO public.operations (
    area_id,
    season_id,
    type,
    start_date,
    end_date,
    next_operation_date,
    description,
    operated_by,
    notes,
    products_used,
    operation_size,
    yield_per_hectare,
    seeds_per_hectare,
    user_id,
    institution_id
  )
  VALUES (
    p_area_id,
    p_season_id,
    p_type,
    p_start_date,
    p_end_date,
    p_next_operation_date,
    p_description,
    p_operated_by,
    p_notes,
    v_products,
    p_operation_size,
    p_yield_per_hectare,
    p_seeds_per_hectare,
    v_user_id,
    v_institution_id
  )
  RETURNING * INTO v_operation;

  -- 11. Return the created operation
  RETURN v_operation;
END;
$$;

-- Grants for create_operation_with_stock (preserve existing)
REVOKE ALL ON FUNCTION public.create_operation_with_stock(
  uuid, text, timestamptz, text, text,
  uuid, timestamptz, timestamptz, text, jsonb, numeric, numeric, numeric
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.create_operation_with_stock(
  uuid, text, timestamptz, text, text,
  uuid, timestamptz, timestamptz, text, jsonb, numeric, numeric, numeric
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_operation_with_stock(
  uuid, text, timestamptz, text, text,
  uuid, timestamptz, timestamptz, text, jsonb, numeric, numeric, numeric
) TO authenticated;


-- ============================================================
-- 2. CREATE OR REPLACE update_operation_with_stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_operation_with_stock(
  p_operation_id uuid,
  p_area_id uuid,
  p_type text,
  p_start_date timestamptz,
  p_description text,
  p_operated_by text,
  p_season_id uuid DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_next_operation_date timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_products_used jsonb DEFAULT NULL,
  p_operation_size numeric DEFAULT NULL,
  p_yield_per_hectare numeric DEFAULT NULL,
  p_seeds_per_hectare numeric DEFAULT NULL
)
RETURNS public.operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_old_products jsonb;
  v_old_user_id uuid;
  v_new_products jsonb := COALESCE(p_products_used, '[]'::jsonb);
  v_item jsonb;
  v_product_id text;
  v_lot_id text;
  v_quantity numeric;
  v_dose numeric;
  v_product_uuid uuid;
  v_lot_uuid uuid;
  v_old_prod_agg jsonb;
  v_new_prod_agg jsonb;
  v_old_lot_agg jsonb;
  v_new_lot_agg jsonb;
  v_old_prod_no_lot_agg jsonb;
  v_new_prod_no_lot_agg jsonb;
  v_old_qty numeric;
  v_new_qty numeric;
  v_delta numeric;
  v_delta_no_lot numeric;
  v_old_lot_qty numeric;
  v_new_lot_qty numeric;
  v_delta_lot numeric;
  v_product_exists boolean;
  v_lot_exists boolean;
  v_updated_count int;
  v_operation public.operations;
  v_all_product_ids text[];
  v_all_lot_ids text[];
  v_all_no_lot_ids text[];
  v_pid text;
  v_lid text;
  v_nlid text;
  v_product_stock numeric;
  v_tracked_stock numeric;
  v_untracked_stock numeric;
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

  -- 2. Lock the operation row (FOR UPDATE prevents concurrent edits)
  SELECT products_used, user_id INTO v_old_products, v_old_user_id
  FROM public.operations
  WHERE id = p_operation_id
    AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  v_old_products := COALESCE(v_old_products, '[]'::jsonb);

  -- 3. Validate area
  PERFORM 1 FROM public.areas
  WHERE id = p_area_id AND institution_id = v_institution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AREA_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  -- 4. Validate season (only when non-NULL)
  IF p_season_id IS NOT NULL THEN
    PERFORM 1 FROM public.seasons
    WHERE id = p_season_id AND institution_id = v_institution_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SEASON_NOT_FOUND_OR_FORBIDDEN';
    END IF;
  END IF;

  -- 5. Validate NEW products_used is an array
  IF jsonb_typeof(v_new_products) != 'array' THEN
    RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
  END IF;

  -- 6. Validate each NEW item and build aggregates
  v_new_prod_agg := '{}'::jsonb;
  v_new_lot_agg := '{}'::jsonb;
  v_new_prod_no_lot_agg := '{}'::jsonb;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_new_products)
  LOOP
    IF jsonb_typeof(v_item) != 'object' THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END IF;

    v_product_id := v_item ->> 'productId';
    IF v_product_id IS NULL OR v_product_id = '' THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END IF;

    BEGIN
      v_product_uuid := v_product_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END;

    BEGIN
      v_quantity := (v_item ->> 'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END;
    IF v_quantity IS NULL OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END IF;

    IF v_item ? 'dose' AND (v_item ->> 'dose') IS NOT NULL THEN
      BEGIN
        v_dose := (v_item ->> 'dose')::numeric;
      EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
        RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
      END;
      IF v_dose < 0 THEN
        RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
      END IF;
    END IF;

    v_lot_id := v_item ->> 'lotId';
    IF v_lot_id IS NULL OR v_lot_id = '' THEN
      v_lot_id := NULL;
      v_lot_uuid := NULL;
    ELSE
      BEGIN
        v_lot_uuid := v_lot_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
      END;
    END IF;

    -- Aggregate NEW by productId
    v_new_prod_agg := jsonb_set(
      v_new_prod_agg,
      ARRAY[v_product_id],
      to_jsonb(COALESCE((v_new_prod_agg ->> v_product_id)::numeric, 0) + v_quantity)
    );

    -- Aggregate NEW by lotId when present
    IF v_lot_uuid IS NOT NULL THEN
      v_new_lot_agg := jsonb_set(
        v_new_lot_agg,
        ARRAY[v_lot_id],
        to_jsonb(COALESCE((v_new_lot_agg ->> v_lot_id)::numeric, 0) + v_quantity)
      );
    ELSE
      -- Aggregate NEW no-lot usage by productId
      v_new_prod_no_lot_agg := jsonb_set(
        v_new_prod_no_lot_agg,
        ARRAY[v_product_id],
        to_jsonb(COALESCE((v_new_prod_no_lot_agg ->> v_product_id)::numeric, 0) + v_quantity)
      );
    END IF;
  END LOOP;

  -- 7. Build OLD aggregates
  v_old_prod_agg := '{}'::jsonb;
  v_old_lot_agg := '{}'::jsonb;
  v_old_prod_no_lot_agg := '{}'::jsonb;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_old_products)
  LOOP
    v_product_id := v_item ->> 'productId';
    IF v_product_id IS NULL OR v_product_id = '' THEN
      CONTINUE;
    END IF;

    BEGIN
      v_quantity := (v_item ->> 'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
      v_quantity := 0;
    END;
    IF v_quantity IS NULL THEN
      v_quantity := 0;
    END IF;

    v_old_prod_agg := jsonb_set(
      v_old_prod_agg,
      ARRAY[v_product_id],
      to_jsonb(COALESCE((v_old_prod_agg ->> v_product_id)::numeric, 0) + v_quantity)
    );

    v_lot_id := v_item ->> 'lotId';
    IF v_lot_id IS NOT NULL AND v_lot_id != '' THEN
      v_old_lot_agg := jsonb_set(
        v_old_lot_agg,
        ARRAY[v_lot_id],
        to_jsonb(COALESCE((v_old_lot_agg ->> v_lot_id)::numeric, 0) + v_quantity)
      );
    ELSE
      -- Aggregate OLD no-lot usage by productId
      v_old_prod_no_lot_agg := jsonb_set(
        v_old_prod_no_lot_agg,
        ARRAY[v_product_id],
        to_jsonb(COALESCE((v_old_prod_no_lot_agg ->> v_product_id)::numeric, 0) + v_quantity)
      );
    END IF;
  END LOOP;

  -- 8. Collect all productIds (union of OLD and NEW keys), sorted for determinism
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[]) INTO v_all_product_ids
  FROM (
    SELECT jsonb_object_keys(v_old_prod_agg) AS k
    UNION
    SELECT jsonb_object_keys(v_new_prod_agg) AS k
  ) keys;

  -- 8.5. Validate untracked stock for products where no-lot usage increases
  -- For each product where delta_without_lot > 0, lock product FOR UPDATE,
  -- compute untracked = stock - SUM(lots), validate delta <= untracked.
  -- Products that don't exist (historical orphans) are skipped here —
  -- the existing delta logic in step 9 handles them.
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[]) INTO v_all_no_lot_ids
  FROM (
    SELECT jsonb_object_keys(v_old_prod_no_lot_agg) AS k
    UNION
    SELECT jsonb_object_keys(v_new_prod_no_lot_agg) AS k
  ) keys;

  FOREACH v_nlid IN ARRAY v_all_no_lot_ids
  LOOP
    v_old_qty := COALESCE((v_old_prod_no_lot_agg ->> v_nlid)::numeric, 0);
    v_new_qty := COALESCE((v_new_prod_no_lot_agg ->> v_nlid)::numeric, 0);
    v_delta_no_lot := v_new_qty - v_old_qty;

    IF v_delta_no_lot > 0 THEN
      BEGIN
        v_product_uuid := v_nlid::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
      END;

      -- Check if product exists and belongs to institution
      SELECT EXISTS(
        SELECT 1 FROM public.products
        WHERE id = v_product_uuid AND institution_id = v_institution_id
      ) INTO v_product_exists;

      IF NOT v_product_exists THEN
        -- Product is historical or cross-institution — let step 9 handle it
        CONTINUE;
      END IF;

      -- Lock product FOR UPDATE (serializes with lot RPCs)
      SELECT quantity_in_stock INTO v_product_stock
      FROM public.products
      WHERE id = v_product_uuid
        AND institution_id = v_institution_id
      FOR UPDATE;

      SELECT COALESCE(SUM(quantity), 0) INTO v_tracked_stock
      FROM public.product_lots
      WHERE product_id = v_product_uuid;

      v_untracked_stock := v_product_stock - v_tracked_stock;

      IF v_untracked_stock < v_delta_no_lot THEN
        RAISE EXCEPTION 'INSUFFICIENT_UNTRACKED_STOCK';
      END IF;
    END IF;
  END LOOP;

  -- 9. Process product deltas in deterministic order
  FOREACH v_pid IN ARRAY v_all_product_ids
  LOOP
    BEGIN
      v_product_uuid := v_pid::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END;

    v_old_qty := COALESCE((v_old_prod_agg ->> v_pid)::numeric, 0);
    v_new_qty := COALESCE((v_new_prod_agg ->> v_pid)::numeric, 0);
    v_delta := v_new_qty - v_old_qty;

    -- Check if product exists AND belongs to this institution
    SELECT EXISTS(
      SELECT 1 FROM public.products
      WHERE id = v_product_uuid AND institution_id = v_institution_id
    ) INTO v_product_exists;

    IF v_product_exists THEN
      -- Product exists and belongs to institution: apply delta atomically
      IF v_delta > 0 THEN
        UPDATE public.products
        SET quantity_in_stock = quantity_in_stock - v_delta,
            updated_at = now()
        WHERE id = v_product_uuid
          AND institution_id = v_institution_id
          AND quantity_in_stock >= v_delta
        RETURNING id INTO v_updated_count;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'INSUFFICIENT_PRODUCT_STOCK';
        END IF;

      ELSIF v_delta < 0 THEN
        UPDATE public.products
        SET quantity_in_stock = quantity_in_stock + ABS(v_delta),
            updated_at = now()
        WHERE id = v_product_uuid
          AND institution_id = v_institution_id
        RETURNING id INTO v_updated_count;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
        END IF;
      END IF;
      -- delta = 0: do nothing

    ELSE
      -- Product does NOT exist in products table for this institution
      -- Check if it exists but belongs to another institution
      PERFORM 1 FROM public.products WHERE id = v_product_uuid;
      IF FOUND THEN
        -- Exists but wrong institution: reject as forbidden
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
      END IF;

      -- Product is historically excluded (truly absent from products table)
      IF v_new_qty = v_old_qty THEN
        -- Scenario A/F: same quantity (including dose-only changes): allow, no stock change
        NULL;
      ELSIF v_new_qty = 0 AND v_old_qty > 0 THEN
        -- Scenario B: user removed the historical product: allow, do NOT return stock
        NULL;
      ELSIF v_new_qty > 0 AND v_old_qty = 0 THEN
        -- Scenario D: trying to introduce a non-existent product: block
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
      ELSE
        -- Scenario C: quantity changed on a historical product: block
        RAISE EXCEPTION 'HISTORICAL_PRODUCT_UNAVAILABLE';
      END IF;
    END IF;
  END LOOP;

  -- 10. Validate NEW lots: each must exist, match product, and belong to institution
  FOR v_lot_id IN SELECT DISTINCT jsonb_object_keys(v_new_lot_agg)
  LOOP
    BEGIN
      v_lot_uuid := v_lot_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END;

    SELECT elem ->> 'productId' INTO v_product_id
    FROM jsonb_array_elements(v_new_products) elem
    WHERE elem ->> 'lotId' = v_lot_id
    LIMIT 1;

    BEGIN
      v_product_uuid := v_product_id::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END;

    PERFORM 1
    FROM public.product_lots pl
    JOIN public.products p ON p.id = pl.product_id
    WHERE pl.id = v_lot_uuid
      AND pl.product_id = v_product_uuid
      AND p.institution_id = v_institution_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH';
    END IF;
  END LOOP;

  -- 11. Collect all lotIds (union of OLD and NEW), sorted for determinism
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[]) INTO v_all_lot_ids
  FROM (
    SELECT jsonb_object_keys(v_old_lot_agg) AS k
    UNION
    SELECT jsonb_object_keys(v_new_lot_agg) AS k
  ) keys;

  -- 12. Process lot deltas in deterministic order
  FOREACH v_lid IN ARRAY v_all_lot_ids
  LOOP
    BEGIN
      v_lot_uuid := v_lid::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
    END;

    v_old_lot_qty := COALESCE((v_old_lot_agg ->> v_lid)::numeric, 0);
    v_new_lot_qty := COALESCE((v_new_lot_agg ->> v_lid)::numeric, 0);
    v_delta_lot := v_new_lot_qty - v_old_lot_qty;

    SELECT EXISTS(
      SELECT 1 FROM public.product_lots WHERE id = v_lot_uuid
    ) INTO v_lot_exists;

    IF v_lot_exists THEN
      -- Find productId for this lot (from NEW if present, otherwise from OLD)
      SELECT elem ->> 'productId' INTO v_product_id
      FROM jsonb_array_elements(v_new_products) elem
      WHERE elem ->> 'lotId' = v_lid
      LIMIT 1;

      IF v_product_id IS NULL THEN
        SELECT elem ->> 'productId' INTO v_product_id
        FROM jsonb_array_elements(v_old_products) elem
        WHERE elem ->> 'lotId' = v_lid
        LIMIT 1;
      END IF;

      BEGIN
        v_product_uuid := v_product_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
      END;

      IF v_delta_lot > 0 THEN
        UPDATE public.product_lots
        SET quantity = quantity - v_delta_lot,
            updated_at = now()
        WHERE id = v_lot_uuid
          AND product_id = v_product_uuid
          AND quantity >= v_delta_lot
        RETURNING id INTO v_updated_count;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'INSUFFICIENT_LOT_STOCK';
        END IF;

      ELSIF v_delta_lot < 0 THEN
        UPDATE public.product_lots
        SET quantity = quantity + ABS(v_delta_lot),
            updated_at = now()
        WHERE id = v_lot_uuid
          AND product_id = v_product_uuid
        RETURNING id INTO v_updated_count;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH';
        END IF;
      END IF;
      -- delta_lot = 0: do nothing

    ELSE
      -- Lot does NOT exist (historically excluded)
      IF v_new_lot_qty = v_old_lot_qty THEN
        NULL;
      ELSIF v_new_lot_qty = 0 AND v_old_lot_qty > 0 THEN
        NULL;
      ELSIF v_new_lot_qty > 0 AND v_old_lot_qty = 0 THEN
        RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH';
      ELSE
        RAISE EXCEPTION 'HISTORICAL_LOT_UNAVAILABLE';
      END IF;
    END IF;
  END LOOP;

  -- 13. Update the operation row (preserve user_id, institution_id, created_at)
  UPDATE public.operations
  SET
    area_id = p_area_id,
    season_id = p_season_id,
    type = p_type,
    start_date = p_start_date,
    end_date = p_end_date,
    next_operation_date = p_next_operation_date,
    description = p_description,
    operated_by = p_operated_by,
    notes = p_notes,
    products_used = v_new_products,
    operation_size = p_operation_size,
    yield_per_hectare = p_yield_per_hectare,
    seeds_per_hectare = p_seeds_per_hectare,
    updated_at = now()
  WHERE id = p_operation_id
    AND institution_id = v_institution_id
  RETURNING * INTO v_operation;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  -- 14. Return the updated operation
  RETURN v_operation;
END;
$$;

-- Grants for update_operation_with_stock (preserve existing)
REVOKE ALL ON FUNCTION public.update_operation_with_stock(
  uuid, uuid, text, timestamptz, text, text,
  uuid, timestamptz, timestamptz, text, jsonb, numeric, numeric, numeric
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.update_operation_with_stock(
  uuid, uuid, text, timestamptz, text, text,
  uuid, timestamptz, timestamptz, text, jsonb, numeric, numeric, numeric
) FROM anon;

GRANT EXECUTE ON FUNCTION public.update_operation_with_stock(
  uuid, uuid, text, timestamptz, text, text,
  uuid, timestamptz, timestamptz, text, jsonb, numeric, numeric, numeric
) TO authenticated;
