/*
# Add financial snapshot to create_operation_with_stock

## Purpose
When a new operation is created, each products_used JSONB item is enriched
with productNameSnapshot, unitSnapshot, and unitPriceSnapshot captured from
the products table at creation time. This freezes the financial identity of
the product so future price/name/unit changes do not retroactively alter
historical operation costs.

## What changes
- CREATE OR REPLACE on public.create_operation_with_stock
- After all validation and stock deduction, before INSERT:
  loops through products_used, SELECTs name/unit/price from products,
  and builds an enriched JSONB array with snapshot fields.
- The enriched array is persisted as products_used in the operations row.
- Function signature, grants, and all stock logic are unchanged.

## What does NOT change
- Existing 309 operations are NOT touched (no backfill).
- Stock deduction logic is unchanged.
- Ledger, RLS, triggers are unchanged.
- No new tables or columns.
*/

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
  v_updated_count int;
  v_operation public.operations;
  v_product_agg jsonb;
  v_lot_agg jsonb;
  v_product_row RECORD;
  v_enriched_products jsonb := '[]'::jsonb;
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

    v_product_agg := jsonb_set(
      v_product_agg,
      ARRAY[v_product_id],
      to_jsonb(COALESCE((v_product_agg ->> v_product_id)::numeric, 0) + v_quantity)
    );

    IF v_lot_uuid IS NOT NULL THEN
      v_lot_agg := jsonb_set(
        v_lot_agg,
        ARRAY[v_lot_id],
        to_jsonb(COALESCE((v_lot_agg ->> v_lot_id)::numeric, 0) + v_quantity)
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

  -- 10. Enrich products_used with financial snapshots from the database
  v_enriched_products := '[]'::jsonb;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_products)
  LOOP
    v_product_id := v_item ->> 'productId';
    v_product_uuid := v_product_id::uuid;

    SELECT name, unit, price INTO v_product_row
    FROM public.products
    WHERE id = v_product_uuid AND institution_id = v_institution_id;

    v_enriched_products := v_enriched_products || jsonb_build_array(
      v_item
        || jsonb_build_object(
          'productNameSnapshot', v_product_row.name,
          'unitSnapshot', v_product_row.unit,
          'unitPriceSnapshot', v_product_row.price
        )
    );
  END LOOP;

  -- 11. Insert operation with enriched products_used
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
    v_enriched_products,
    p_operation_size,
    p_yield_per_hectare,
    p_seeds_per_hectare,
    v_user_id,
    v_institution_id
  )
  RETURNING * INTO v_operation;

  -- 12. Return the created operation
  RETURN v_operation;
END;
$$;

-- 13. Re-apply grants
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
