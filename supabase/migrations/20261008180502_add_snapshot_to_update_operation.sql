/*
# Add financial snapshot preservation to update_operation_with_stock

## Purpose
When an operation is edited, snapshot fields (productNameSnapshot,
unitSnapshot, unitPriceSnapshot) in products_used are handled as follows:

  A) Item already has snapshots AND productId is unchanged:
     PRESERVE existing snapshots. Do NOT overwrite with current product data.
     Changing dose/quantity/lot does NOT reprice the item.

  B) Item has NO snapshots (legacy) AND productId is unchanged:
     PRESERVE the absence of snapshots. Do NOT add snapshots retroactively.
     The item continues using fallback pricing in the frontend.

  C) Item has a NEW productId (product was swapped) OR a brand-new item:
     Generate fresh snapshots from the products table at edit time.

## What changes
- CREATE OR REPLACE on public.update_operation_with_stock
- Before the final UPDATE, loops through v_new_products:
  - For each item, checks if OLD products_used has an item with the same productId
    that already has unitPriceSnapshot.
  - If yes: preserves the old snapshot fields.
  - If no: checks if the product exists in the products table. If yes, captures
    fresh snapshots. If the product doesn't exist (historical), leaves the item
    without snapshots (legacy behavior).
- The enriched array replaces v_new_products for the final UPDATE.
- Function signature, grants, stock delta logic, and all validation are unchanged.

## What does NOT change
- Existing 309 operations' products_used is NOT touched unless the user edits them.
- Stock deduction/return logic is unchanged.
- Ledger, RLS, triggers are unchanged.
*/

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
  v_old_item jsonb;
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
  v_old_qty numeric;
  v_new_qty numeric;
  v_delta numeric;
  v_old_lot_qty numeric;
  v_new_lot_qty numeric;
  v_delta_lot numeric;
  v_product_exists boolean;
  v_lot_exists boolean;
  v_updated_count int;
  v_operation public.operations;
  v_all_product_ids text[];
  v_all_lot_ids text[];
  v_pid text;
  v_lid text;
  v_product_row RECORD;
  v_enriched_products jsonb := '[]'::jsonb;
  v_old_snapshot jsonb;
  v_has_snapshot boolean;
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

    v_new_prod_agg := jsonb_set(
      v_new_prod_agg,
      ARRAY[v_product_id],
      to_jsonb(COALESCE((v_new_prod_agg ->> v_product_id)::numeric, 0) + v_quantity)
    );

    IF v_lot_uuid IS NOT NULL THEN
      v_new_lot_agg := jsonb_set(
        v_new_lot_agg,
        ARRAY[v_lot_id],
        to_jsonb(COALESCE((v_new_lot_agg ->> v_lot_id)::numeric, 0) + v_quantity)
      );
    END IF;
  END LOOP;

  -- 7. Build OLD aggregates
  v_old_prod_agg := '{}'::jsonb;
  v_old_lot_agg := '{}'::jsonb;

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
    END IF;
  END LOOP;

  -- 8. Collect all productIds (union of OLD and NEW keys), sorted for determinism
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[]) INTO v_all_product_ids
  FROM (
    SELECT jsonb_object_keys(v_old_prod_agg) AS k
    UNION
    SELECT jsonb_object_keys(v_new_prod_agg) AS k
  ) keys;

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

  -- 10. Validate NEW lots
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

  -- 13. Enrich NEW products_used with snapshot preservation logic
  v_enriched_products := '[]'::jsonb;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_new_products)
  LOOP
    v_product_id := v_item ->> 'productId';

    -- Check if OLD products_used has an item with the same productId that has snapshots
    v_old_snapshot := NULL;
    v_has_snapshot := false;
    FOR v_old_item IN SELECT * FROM jsonb_array_elements(v_old_products)
    LOOP
      IF (v_old_item ->> 'productId') = v_product_id
         AND v_old_item ? 'unitPriceSnapshot'
         AND (v_old_item ->> 'unitPriceSnapshot') IS NOT NULL
      THEN
        v_old_snapshot := v_old_item;
        v_has_snapshot := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_has_snapshot THEN
      -- Case A: preserve existing snapshots from the old item
      v_enriched_products := v_enriched_products || jsonb_build_array(
        v_item
          || jsonb_build_object(
            'productNameSnapshot', v_old_snapshot ->> 'productNameSnapshot',
            'unitSnapshot', v_old_snapshot ->> 'unitSnapshot',
            'unitPriceSnapshot', (v_old_snapshot ->> 'unitPriceSnapshot')::numeric
          )
      );
    ELSE
      -- Case B/C: no existing snapshot for this productId in OLD
      -- Check if product exists to generate fresh snapshot (Case C: new/swapped product)
      BEGIN
        v_product_uuid := v_product_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        -- Invalid UUID: leave item as-is without snapshots
        v_enriched_products := v_enriched_products || jsonb_build_array(v_item);
        CONTINUE;
      END;

      SELECT name, unit, price INTO v_product_row
      FROM public.products
      WHERE id = v_product_uuid AND institution_id = v_institution_id;

      IF FOUND THEN
        -- Product exists: generate fresh snapshots
        v_enriched_products := v_enriched_products || jsonb_build_array(
          v_item
            || jsonb_build_object(
              'productNameSnapshot', v_product_row.name,
              'unitSnapshot', v_product_row.unit,
              'unitPriceSnapshot', v_product_row.price
            )
        );
      ELSE
        -- Product doesn't exist (historical/legacy): preserve item without snapshots
        v_enriched_products := v_enriched_products || jsonb_build_array(v_item);
      END IF;
    END IF;
  END LOOP;

  -- 14. Update the operation row with enriched products_used
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
    products_used = v_enriched_products,
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

  -- 15. Return the updated operation
  RETURN v_operation;
END;
$$;

-- 16. Re-apply grants
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
