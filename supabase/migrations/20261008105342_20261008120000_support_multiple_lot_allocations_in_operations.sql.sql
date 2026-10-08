/*
# Support multiple lot allocations per product in operation RPCs

## Purpose
Implements Design A from ETAPA 3L: allows a single product entry in
operations.products_used to source its quantity from multiple lots
simultaneously (e.g. 70 L from Lot A + 80 L from Lot B + 30 L untracked).

## Changes
1. create_operation_with_stock: detects `lotAllocations` array in each
   products_used item. If present, validates and uses it for lot stock
   deductions. If absent, uses legacy `lotId` scalar (backward compatible).
2. update_operation_with_stock: normalizes both OLD and NEW products_used
   into the same aggregate structure (product totals, lot totals, no-lot
   totals) regardless of whether they use legacy lotId or new
   lotAllocations. Delta computation and stock adjustments remain
   architecturally unchanged.
3. delete_operation_with_stock: detects `lotAllocations` in OLD
   products_used. If present, returns stock per allocation. If absent,
   uses legacy lotId (backward compatible).

## New Validation Rules (only when lotAllocations is present)
- SUM(lotAllocations.quantity) must equal item.quantity (tolerance 0.000001)
- No duplicate lotId within the same item's lotAllocations
- At most one allocation with lotId = null per item
- Each allocation quantity must be > 0
- Each lotId must be a valid UUID or null

## New Error Codes
- LOT_ALLOCATIONS_TOTAL_MISMATCH: allocations sum != item quantity
- DUPLICATE_LOT_ALLOCATION: same lotId appears twice in one item

## Backward Compatibility
- 309 existing operations use legacy format (lotId scalar or no lotId)
- No backfill, no data migration, no automatic conversion
- Legacy format continues to work identically
- When lotAllocations is present, lotId scalar is ignored for stock movements
- Orphan product/lot rules from ETAPA 3E preserved

## Security
- All functions retain: SECURITY DEFINER, search_path = public, pg_temp
- REVOKE FROM PUBLIC/anon, GRANT TO authenticated
- Institution isolation preserved
- No RLS changes, no lot RPC changes, no data changes
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
  v_alloc jsonb;
  v_product_id text;
  v_lot_id text;
  v_quantity numeric;
  v_dose numeric;
  v_alloc_qty numeric;
  v_alloc_sum numeric;
  v_product_uuid uuid;
  v_lot_uuid uuid;
  v_updated_count int;
  v_operation public.operations;
  v_product_agg jsonb;
  v_lot_agg jsonb;
  v_product_no_lot_agg jsonb;
  v_product_stock numeric;
  v_tracked_stock numeric;
  v_untracked_stock numeric;
  v_has_allocations boolean;
  v_seen_lot_ids text[];
  v_null_count int;
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

  PERFORM 1 FROM public.areas
  WHERE id = p_area_id AND institution_id = v_institution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AREA_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF p_season_id IS NOT NULL THEN
    PERFORM 1 FROM public.seasons
    WHERE id = p_season_id AND institution_id = v_institution_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SEASON_NOT_FOUND_OR_FORBIDDEN';
    END IF;
  END IF;

  IF jsonb_typeof(v_products) != 'array' THEN
    RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
  END IF;

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

    v_has_allocations := v_item ? 'lotAllocations' AND jsonb_typeof(v_item -> 'lotAllocations') = 'array';

    v_product_agg := jsonb_set(
      v_product_agg,
      ARRAY[v_product_id],
      to_jsonb(COALESCE((v_product_agg ->> v_product_id)::numeric, 0) + v_quantity)
    );

    IF v_has_allocations THEN
      v_alloc_sum := 0;
      v_seen_lot_ids := ARRAY[]::text[];
      v_null_count := 0;

      FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_item -> 'lotAllocations')
      LOOP
        IF jsonb_typeof(v_alloc) != 'object' THEN
          RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
        END IF;

        v_lot_id := v_alloc ->> 'lotId';

        BEGIN
          v_alloc_qty := (v_alloc ->> 'quantity')::numeric;
        EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
          RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
        END;
        IF v_alloc_qty IS NULL OR v_alloc_qty <= 0 THEN
          RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
        END IF;

        v_alloc_sum := v_alloc_sum + v_alloc_qty;

        IF v_lot_id IS NULL OR v_lot_id = '' THEN
          v_null_count := v_null_count + 1;
          IF v_null_count > 1 THEN
            RAISE EXCEPTION 'DUPLICATE_LOT_ALLOCATION';
          END IF;

          v_product_no_lot_agg := jsonb_set(
            v_product_no_lot_agg,
            ARRAY[v_product_id],
            to_jsonb(COALESCE((v_product_no_lot_agg ->> v_product_id)::numeric, 0) + v_alloc_qty)
          );
        ELSE
          IF v_seen_lot_ids @> ARRAY[v_lot_id] THEN
            RAISE EXCEPTION 'DUPLICATE_LOT_ALLOCATION';
          END IF;
          v_seen_lot_ids := array_append(v_seen_lot_ids, v_lot_id);

          BEGIN
            v_lot_uuid := v_lot_id::uuid;
          EXCEPTION WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
          END;

          v_lot_agg := jsonb_set(
            v_lot_agg,
            ARRAY[v_lot_id],
            to_jsonb(COALESCE((v_lot_agg ->> v_lot_id)::numeric, 0) + v_alloc_qty)
          );
        END IF;
      END LOOP;

      IF ABS(v_alloc_sum - v_quantity) > 0.000001 THEN
        RAISE EXCEPTION 'LOT_ALLOCATIONS_TOTAL_MISMATCH';
      END IF;

    ELSE
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

      IF v_lot_uuid IS NOT NULL THEN
        v_lot_agg := jsonb_set(
          v_lot_agg,
          ARRAY[v_lot_id],
          to_jsonb(COALESCE((v_lot_agg ->> v_lot_id)::numeric, 0) + v_quantity)
        );
      ELSE
        v_product_no_lot_agg := jsonb_set(
          v_product_no_lot_agg,
          ARRAY[v_product_id],
          to_jsonb(COALESCE((v_product_no_lot_agg ->> v_product_id)::numeric, 0) + v_quantity)
        );
      END IF;
    END IF;
  END LOOP;

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

  FOR v_lot_id IN SELECT DISTINCT jsonb_object_keys(v_lot_agg)
  LOOP
    v_lot_uuid := v_lot_id::uuid;
    v_quantity := (v_lot_agg ->> v_lot_id)::numeric;

    SELECT elem ->> 'productId' INTO v_product_id
    FROM jsonb_array_elements(v_products) elem
    WHERE elem ->> 'lotId' = v_lot_id
       OR (elem -> 'lotAllocations' IS NOT NULL AND EXISTS(
         SELECT 1 FROM jsonb_array_elements(elem -> 'lotAllocations') la
         WHERE la ->> 'lotId' = v_lot_id
       ))
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

  FOR v_lot_id IN SELECT jsonb_object_keys(v_lot_agg) ORDER BY jsonb_object_keys(v_lot_agg)
  LOOP
    v_lot_uuid := v_lot_id::uuid;
    v_quantity := (v_lot_agg ->> v_lot_id)::numeric;

    SELECT elem ->> 'productId' INTO v_product_id
    FROM jsonb_array_elements(v_products) elem
    WHERE elem ->> 'lotId' = v_lot_id
       OR (elem -> 'lotAllocations' IS NOT NULL AND EXISTS(
         SELECT 1 FROM jsonb_array_elements(elem -> 'lotAllocations') la
         WHERE la ->> 'lotId' = v_lot_id
       ))
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

  INSERT INTO public.operations (
    area_id, season_id, type, start_date, end_date, next_operation_date,
    description, operated_by, notes, products_used, operation_size,
    yield_per_hectare, seeds_per_hectare, user_id, institution_id
  )
  VALUES (
    p_area_id, p_season_id, p_type, p_start_date, p_end_date, p_next_operation_date,
    p_description, p_operated_by, p_notes, v_products, p_operation_size,
    p_yield_per_hectare, p_seeds_per_hectare, v_user_id, v_institution_id
  )
  RETURNING * INTO v_operation;

  RETURN v_operation;
END;
$$;

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
  v_alloc jsonb;
  v_product_id text;
  v_lot_id text;
  v_quantity numeric;
  v_dose numeric;
  v_alloc_qty numeric;
  v_alloc_sum numeric;
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
  v_has_allocations boolean;
  v_seen_lot_ids text[];
  v_null_count int;
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

  SELECT products_used, user_id INTO v_old_products, v_old_user_id
  FROM public.operations
  WHERE id = p_operation_id
    AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  v_old_products := COALESCE(v_old_products, '[]'::jsonb);

  PERFORM 1 FROM public.areas
  WHERE id = p_area_id AND institution_id = v_institution_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AREA_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  IF p_season_id IS NOT NULL THEN
    PERFORM 1 FROM public.seasons
    WHERE id = p_season_id AND institution_id = v_institution_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SEASON_NOT_FOUND_OR_FORBIDDEN';
    END IF;
  END IF;

  IF jsonb_typeof(v_new_products) != 'array' THEN
    RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
  END IF;

  -- Build NEW aggregates
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

    v_has_allocations := v_item ? 'lotAllocations' AND jsonb_typeof(v_item -> 'lotAllocations') = 'array';

    v_new_prod_agg := jsonb_set(
      v_new_prod_agg,
      ARRAY[v_product_id],
      to_jsonb(COALESCE((v_new_prod_agg ->> v_product_id)::numeric, 0) + v_quantity)
    );

    IF v_has_allocations THEN
      v_alloc_sum := 0;
      v_seen_lot_ids := ARRAY[]::text[];
      v_null_count := 0;

      FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_item -> 'lotAllocations')
      LOOP
        IF jsonb_typeof(v_alloc) != 'object' THEN
          RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
        END IF;

        v_lot_id := v_alloc ->> 'lotId';

        BEGIN
          v_alloc_qty := (v_alloc ->> 'quantity')::numeric;
        EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
          RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
        END;
        IF v_alloc_qty IS NULL OR v_alloc_qty <= 0 THEN
          RAISE EXCEPTION 'INVALID_PRODUCTS_USED';
        END IF;

        v_alloc_sum := v_alloc_sum + v_alloc_qty;

        IF v_lot_id IS NULL OR v_lot_id = '' THEN
          v_null_count := v_null_count + 1;
          IF v_null_count > 1 THEN
            RAISE EXCEPTION 'DUPLICATE_LOT_ALLOCATION';
          END IF;

          v_new_prod_no_lot_agg := jsonb_set(
            v_new_prod_no_lot_agg,
            ARRAY[v_product_id],
            to_jsonb(COALESCE((v_new_prod_no_lot_agg ->> v_product_id)::numeric, 0) + v_alloc_qty)
          );
        ELSE
          IF v_seen_lot_ids @> ARRAY[v_lot_id] THEN
            RAISE EXCEPTION 'DUPLICATE_LOT_ALLOCATION';
          END IF;
          v_seen_lot_ids := array_append(v_seen_lot_ids, v_lot_id);

          v_new_lot_agg := jsonb_set(
            v_new_lot_agg,
            ARRAY[v_lot_id],
            to_jsonb(COALESCE((v_new_lot_agg ->> v_lot_id)::numeric, 0) + v_alloc_qty)
          );
        END IF;
      END LOOP;

      IF ABS(v_alloc_sum - v_quantity) > 0.000001 THEN
        RAISE EXCEPTION 'LOT_ALLOCATIONS_TOTAL_MISMATCH';
      END IF;

    ELSE
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

      IF v_lot_uuid IS NOT NULL THEN
        v_new_lot_agg := jsonb_set(
          v_new_lot_agg,
          ARRAY[v_lot_id],
          to_jsonb(COALESCE((v_new_lot_agg ->> v_lot_id)::numeric, 0) + v_quantity)
        );
      ELSE
        v_new_prod_no_lot_agg := jsonb_set(
          v_new_prod_no_lot_agg,
          ARRAY[v_product_id],
          to_jsonb(COALESCE((v_new_prod_no_lot_agg ->> v_product_id)::numeric, 0) + v_quantity)
        );
      END IF;
    END IF;
  END LOOP;

  -- Build OLD aggregates (supports both formats)
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

    v_has_allocations := v_item ? 'lotAllocations' AND jsonb_typeof(v_item -> 'lotAllocations') = 'array';

    IF v_has_allocations THEN
      FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_item -> 'lotAllocations')
      LOOP
        v_lot_id := v_alloc ->> 'lotId';

        BEGIN
          v_alloc_qty := (v_alloc ->> 'quantity')::numeric;
        EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
          v_alloc_qty := 0;
        END;
        IF v_alloc_qty IS NULL THEN
          v_alloc_qty := 0;
        END IF;

        IF v_lot_id IS NULL OR v_lot_id = '' THEN
          v_old_prod_no_lot_agg := jsonb_set(
            v_old_prod_no_lot_agg,
            ARRAY[v_product_id],
            to_jsonb(COALESCE((v_old_prod_no_lot_agg ->> v_product_id)::numeric, 0) + v_alloc_qty)
          );
        ELSE
          v_old_lot_agg := jsonb_set(
            v_old_lot_agg,
            ARRAY[v_lot_id],
            to_jsonb(COALESCE((v_old_lot_agg ->> v_lot_id)::numeric, 0) + v_alloc_qty)
          );
        END IF;
      END LOOP;
    ELSE
      v_lot_id := v_item ->> 'lotId';
      IF v_lot_id IS NOT NULL AND v_lot_id != '' THEN
        v_old_lot_agg := jsonb_set(
          v_old_lot_agg,
          ARRAY[v_lot_id],
          to_jsonb(COALESCE((v_old_lot_agg ->> v_lot_id)::numeric, 0) + v_quantity)
        );
      ELSE
        v_old_prod_no_lot_agg := jsonb_set(
          v_old_prod_no_lot_agg,
          ARRAY[v_product_id],
          to_jsonb(COALESCE((v_old_prod_no_lot_agg ->> v_product_id)::numeric, 0) + v_quantity)
        );
      END IF;
    END IF;
  END LOOP;

  -- Collect all productIds
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[]) INTO v_all_product_ids
  FROM (
    SELECT jsonb_object_keys(v_old_prod_agg) AS k
    UNION
    SELECT jsonb_object_keys(v_new_prod_agg) AS k
  ) keys;

  -- Validate untracked stock for products where no-lot usage increases
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

      SELECT EXISTS(
        SELECT 1 FROM public.products
        WHERE id = v_product_uuid AND institution_id = v_institution_id
      ) INTO v_product_exists;

      IF NOT v_product_exists THEN
        CONTINUE;
      END IF;

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

  -- Process product deltas
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

    SELECT EXISTS(
      SELECT 1 FROM public.products
      WHERE id = v_product_uuid AND institution_id = v_institution_id
    ) INTO v_product_exists;

    IF v_product_exists THEN
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

    ELSE
      PERFORM 1 FROM public.products WHERE id = v_product_uuid;
      IF FOUND THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
      END IF;

      IF v_new_qty = v_old_qty THEN
        NULL;
      ELSIF v_new_qty = 0 AND v_old_qty > 0 THEN
        NULL;
      ELSIF v_new_qty > 0 AND v_old_qty = 0 THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
      ELSE
        RAISE EXCEPTION 'HISTORICAL_PRODUCT_UNAVAILABLE';
      END IF;
    END IF;
  END LOOP;

  -- Validate NEW lots exist
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
       OR (elem -> 'lotAllocations' IS NOT NULL AND EXISTS(
         SELECT 1 FROM jsonb_array_elements(elem -> 'lotAllocations') la
         WHERE la ->> 'lotId' = v_lot_id
       ))
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

  -- Collect all lotIds
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[]) INTO v_all_lot_ids
  FROM (
    SELECT jsonb_object_keys(v_old_lot_agg) AS k
    UNION
    SELECT jsonb_object_keys(v_new_lot_agg) AS k
  ) keys;

  -- Process lot deltas
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
      SELECT elem ->> 'productId' INTO v_product_id
      FROM jsonb_array_elements(v_new_products) elem
      WHERE elem ->> 'lotId' = v_lid
         OR (elem -> 'lotAllocations' IS NOT NULL AND EXISTS(
           SELECT 1 FROM jsonb_array_elements(elem -> 'lotAllocations') la
           WHERE la ->> 'lotId' = v_lid
         ))
      LIMIT 1;

      IF v_product_id IS NULL THEN
        SELECT elem ->> 'productId' INTO v_product_id
        FROM jsonb_array_elements(v_old_products) elem
        WHERE elem ->> 'lotId' = v_lid
           OR (elem -> 'lotAllocations' IS NOT NULL AND EXISTS(
             SELECT 1 FROM jsonb_array_elements(elem -> 'lotAllocations') la
             WHERE la ->> 'lotId' = v_lid
           ))
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

    ELSE
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

  -- Update the operation row
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

  RETURN v_operation;
END;
$$;

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


-- ============================================================
-- 3. CREATE OR REPLACE delete_operation_with_stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_operation_with_stock(
  p_operation_id uuid
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
  v_item jsonb;
  v_alloc jsonb;
  v_product_id text;
  v_lot_id text;
  v_quantity numeric;
  v_alloc_qty numeric;
  v_product_uuid uuid;
  v_lot_uuid uuid;
  v_prod_agg jsonb;
  v_lot_agg jsonb;
  v_product_exists boolean;
  v_lot_exists boolean;
  v_updated_count int;
  v_deleted_operation public.operations;
  v_all_product_ids text[];
  v_all_lot_ids text[];
  v_pid text;
  v_lid text;
  v_has_allocations boolean;
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

  SELECT products_used INTO v_old_products
  FROM public.operations
  WHERE id = p_operation_id
    AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  v_old_products := COALESCE(v_old_products, '[]'::jsonb);

  -- Build aggregates (supports both formats)
  v_prod_agg := '{}'::jsonb;
  v_lot_agg := '{}'::jsonb;

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

    v_prod_agg := jsonb_set(
      v_prod_agg,
      ARRAY[v_product_id],
      to_jsonb(COALESCE((v_prod_agg ->> v_product_id)::numeric, 0) + v_quantity)
    );

    v_has_allocations := v_item ? 'lotAllocations' AND jsonb_typeof(v_item -> 'lotAllocations') = 'array';

    IF v_has_allocations THEN
      FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_item -> 'lotAllocations')
      LOOP
        v_lot_id := v_alloc ->> 'lotId';

        BEGIN
          v_alloc_qty := (v_alloc ->> 'quantity')::numeric;
        EXCEPTION WHEN invalid_text_representation OR datatype_mismatch THEN
          v_alloc_qty := 0;
        END;
        IF v_alloc_qty IS NULL THEN
          v_alloc_qty := 0;
        END IF;

        IF v_lot_id IS NOT NULL AND v_lot_id != '' THEN
          v_lot_agg := jsonb_set(
            v_lot_agg,
            ARRAY[v_lot_id],
            to_jsonb(COALESCE((v_lot_agg ->> v_lot_id)::numeric, 0) + v_alloc_qty)
          );
        END IF;
      END LOOP;
    ELSE
      v_lot_id := v_item ->> 'lotId';
      IF v_lot_id IS NOT NULL AND v_lot_id != '' THEN
        v_lot_agg := jsonb_set(
          v_lot_agg,
          ARRAY[v_lot_id],
          to_jsonb(COALESCE((v_lot_agg ->> v_lot_id)::numeric, 0) + v_quantity)
        );
      END IF;
    END IF;
  END LOOP;

  -- Collect productIds sorted
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[]) INTO v_all_product_ids
  FROM (SELECT jsonb_object_keys(v_prod_agg) AS k) keys;

  -- Return stock to existing products
  FOREACH v_pid IN ARRAY v_all_product_ids
  LOOP
    BEGIN
      v_product_uuid := v_pid::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      CONTINUE;
    END;

    v_quantity := COALESCE((v_prod_agg ->> v_pid)::numeric, 0);
    IF v_quantity <= 0 THEN
      CONTINUE;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.products
      WHERE id = v_product_uuid AND institution_id = v_institution_id
    ) INTO v_product_exists;

    IF v_product_exists THEN
      UPDATE public.products
      SET quantity_in_stock = quantity_in_stock + v_quantity,
          updated_at = now()
      WHERE id = v_product_uuid
        AND institution_id = v_institution_id
      RETURNING id INTO v_updated_count;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
      END IF;

    ELSE
      PERFORM 1 FROM public.products WHERE id = v_product_uuid;
      IF FOUND THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
      END IF;
      NULL;
    END IF;
  END LOOP;

  -- Collect lotIds sorted
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[]) INTO v_all_lot_ids
  FROM (SELECT jsonb_object_keys(v_lot_agg) AS k) keys;

  -- Return stock to existing lots
  FOREACH v_lid IN ARRAY v_all_lot_ids
  LOOP
    BEGIN
      v_lot_uuid := v_lid::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      CONTINUE;
    END;

    v_quantity := COALESCE((v_lot_agg ->> v_lid)::numeric, 0);
    IF v_quantity <= 0 THEN
      CONTINUE;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM public.product_lots WHERE id = v_lot_uuid
    ) INTO v_lot_exists;

    IF v_lot_exists THEN
      SELECT elem ->> 'productId' INTO v_product_id
      FROM jsonb_array_elements(v_old_products) elem
      WHERE elem ->> 'lotId' = v_lid
         OR (elem -> 'lotAllocations' IS NOT NULL AND EXISTS(
           SELECT 1 FROM jsonb_array_elements(elem -> 'lotAllocations') la
           WHERE la ->> 'lotId' = v_lid
         ))
      LIMIT 1;

      BEGIN
        v_product_uuid := v_product_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        CONTINUE;
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

      UPDATE public.product_lots
      SET quantity = quantity + v_quantity,
          updated_at = now()
      WHERE id = v_lot_uuid
        AND product_id = v_product_uuid
      RETURNING id INTO v_updated_count;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH';
      END IF;

    ELSE
      NULL;
    END IF;
  END LOOP;

  DELETE FROM public.operations
  WHERE id = p_operation_id
    AND institution_id = v_institution_id
  RETURNING * INTO v_deleted_operation;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPERATION_DELETE_FAILED';
  END IF;

  RETURN v_deleted_operation;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_operation_with_stock(
  uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.delete_operation_with_stock(
  uuid
) FROM anon;

GRANT EXECUTE ON FUNCTION public.delete_operation_with_stock(
  uuid
) TO authenticated;
