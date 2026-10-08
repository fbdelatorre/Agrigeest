/*
# Create atomic delete operation with stock RPC

## Purpose
Replaces the frontend's multi-step "return stock + delete operation" flow
with a single atomic PostgreSQL function. This eliminates:
  - Partial failure (stock returned but operation not deleted)
  - Lost updates (read-modify-write pattern on quantity_in_stock)
  - Race conditions between concurrent delete and create/update

## New Function
- `public.delete_operation_with_stock(p_operation_id uuid)` — SECURITY DEFINER plpgsql function
  that atomically:
  1. Derives institution_id from auth.uid() via user_profiles (never from frontend)
  2. Locks the operation row with FOR UPDATE (prevents concurrent edits)
  3. Reads OLD products_used from the locked row
  4. Aggregates OLD quantities by productId
  5. For products that still exist and belong to the institution: returns stock atomically
  6. For products historically excluded (absent from products): skips silently
  7. For products belonging to another institution: aborts with PRODUCT_NOT_FOUND_OR_FORBIDDEN
  8. Aggregates OLD lot quantities by lotId
  9. For lots that still exist: returns lot stock atomically
  10. For lots historically absent: skips silently
  11. Deletes the operation row
  12. Returns the deleted operation row
  Any exception rolls back ALL stock returns and the DELETE.

## Security
- SECURITY DEFINER, owned by postgres, search_path = public, pg_temp
- EXECUTE revoked from PUBLIC and anon
- EXECUTE granted to authenticated only
- Institution isolation enforced explicitly inside the function body
- Cross-institution products (exist but belong to another institution) are rejected
  as PRODUCT_NOT_FOUND_OR_FORBIDDEN, NOT treated as historical/excluded
- Any authorized member of the institution can delete (institutional model, not owner-only)

## Important Notes
1. OLD products_used comes exclusively from the locked operation row, never from frontend
2. Historical products (truly absent from products table) are silently skipped — no re-creation
3. Historical lots (truly absent from product_lots table) are silently skipped
4. Products are processed in deterministic order (by UUID) to reduce deadlocks
5. Lots are processed in deterministic order (by UUID) to reduce deadlocks
6. No triggers, no ledger, no offline changes, no RLS changes
7. The CREATE and UPDATE RPCs are NOT modified
8. operation_products has a CASCADE FK on operations.id — DELETE will cascade automatically
*/

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
  v_product_id text;
  v_lot_id text;
  v_quantity numeric;
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
  SELECT products_used INTO v_old_products
  FROM public.operations
  WHERE id = p_operation_id
    AND institution_id = v_institution_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN';
  END IF;

  v_old_products := COALESCE(v_old_products, '[]'::jsonb);

  -- 3. Build OLD aggregates by productId and by lotId
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

    -- Aggregate by productId
    v_prod_agg := jsonb_set(
      v_prod_agg,
      ARRAY[v_product_id],
      to_jsonb(COALESCE((v_prod_agg ->> v_product_id)::numeric, 0) + v_quantity)
    );

    -- Aggregate by lotId when present
    v_lot_id := v_item ->> 'lotId';
    IF v_lot_id IS NOT NULL AND v_lot_id != '' THEN
      v_lot_agg := jsonb_set(
        v_lot_agg,
        ARRAY[v_lot_id],
        to_jsonb(COALESCE((v_lot_agg ->> v_lot_id)::numeric, 0) + v_quantity)
      );
    END IF;
  END LOOP;

  -- 4. Collect all productIds sorted for deterministic processing
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[]) INTO v_all_product_ids
  FROM (
    SELECT jsonb_object_keys(v_prod_agg) AS k
  ) keys;

  -- 5. Return stock to existing products in deterministic order
  FOREACH v_pid IN ARRAY v_all_product_ids
  LOOP
    BEGIN
      v_product_uuid := v_pid::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      -- Skip invalid UUIDs in historical data
      CONTINUE;
    END;

    v_quantity := COALESCE((v_prod_agg ->> v_pid)::numeric, 0);
    IF v_quantity <= 0 THEN
      CONTINUE;
    END IF;

    -- Check if product exists AND belongs to this institution
    SELECT EXISTS(
      SELECT 1 FROM public.products
      WHERE id = v_product_uuid AND institution_id = v_institution_id
    ) INTO v_product_exists;

    IF v_product_exists THEN
      -- Return stock atomically
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
      -- Check if product exists but belongs to another institution
      PERFORM 1 FROM public.products WHERE id = v_product_uuid;
      IF FOUND THEN
        -- Cross-institution: reject, do NOT treat as historical
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
      END IF;

      -- Product is historically excluded (truly absent): skip silently
      -- Do NOT re-create, do NOT return stock, do NOT block DELETE
      NULL;
    END IF;
  END LOOP;

  -- 6. Collect all lotIds sorted for deterministic processing
  SELECT COALESCE(array_agg(DISTINCT k ORDER BY k), ARRAY[]::text[]) INTO v_all_lot_ids
  FROM (
    SELECT jsonb_object_keys(v_lot_agg) AS k
  ) keys;

  -- 7. Return stock to existing lots in deterministic order
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

    -- Check if lot exists
    SELECT EXISTS(
      SELECT 1 FROM public.product_lots WHERE id = v_lot_uuid
    ) INTO v_lot_exists;

    IF v_lot_exists THEN
      -- Find productId for this lot from OLD products
      SELECT elem ->> 'productId' INTO v_product_id
      FROM jsonb_array_elements(v_old_products) elem
      WHERE elem ->> 'lotId' = v_lid
      LIMIT 1;

      BEGIN
        v_product_uuid := v_product_id::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        -- Product UUID invalid in historical data, skip lot return
        CONTINUE;
      END;

      -- Validate lot belongs to the right product and institution
      PERFORM 1
      FROM public.product_lots pl
      JOIN public.products p ON p.id = pl.product_id
      WHERE pl.id = v_lot_uuid
        AND pl.product_id = v_product_uuid
        AND p.institution_id = v_institution_id;
      IF NOT FOUND THEN
        -- Lot exists but mismatched product or cross-institution
        RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH';
      END IF;

      -- Return lot stock atomically
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
      -- Lot is historically absent: skip silently
      -- Do NOT re-create, do NOT return stock, do NOT block DELETE
      NULL;
    END IF;
  END LOOP;

  -- 8. Delete the operation row
  DELETE FROM public.operations
  WHERE id = p_operation_id
    AND institution_id = v_institution_id
  RETURNING * INTO v_deleted_operation;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPERATION_DELETE_FAILED';
  END IF;

  -- 9. Return the deleted operation
  RETURN v_deleted_operation;
END;
$$;

-- 10. Grants: lock down to authenticated only
REVOKE ALL ON FUNCTION public.delete_operation_with_stock(
  uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.delete_operation_with_stock(
  uuid
) FROM anon;

GRANT EXECUTE ON FUNCTION public.delete_operation_with_stock(
  uuid
) TO authenticated;
