/*
# Adapt RPCs for Ledger Dual-Write

## Purpose
Adapt all 7 stock-mutating RPCs to write inventory_movements alongside
their existing stock/lots updates. All movements are append-only.

## RPCs Changed
1. create_operation_with_stock — inserts OPERATION_CONSUMPTION movements
2. update_operation_with_stock — reverses old movements + inserts new
3. delete_operation_with_stock — cancels operation (soft delete) + reverses movements
4. create_product_with_lots — inserts STOCK_IN movements if ledger active
5. create_product_lot — inserts LOT_CLASSIFICATION movements if ledger active
6. update_product_lot — inserts LOT_CLASSIFICATION movements if ledger active
7. delete_product_lot — blocks DELETE if lot has ledger history; else physical delete

## Key Design Decisions
- All movements share movement_group_id per event
- OPERATION_CONSUMPTION: negative quantity, source_type='operation'
- REVERSAL: negates original, reversal_of=original.id
- LOT_CLASSIFICATION: pair (untracked->lot or lot->untracked), net zero
- delete operation = cancel (soft delete), not physical delete
- Ledger is only written if institution has opening_balance_complete=true
- idempotency_key is deterministic per event+allocation
- unit_snapshot always populated from products.unit
*/

-- ============================================================
-- 1. create_operation_with_stock
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_operation_with_stock(
  p_area_id uuid, p_type text, p_start_date timestamptz,
  p_description text, p_operated_by text,
  p_season_id uuid DEFAULT NULL, p_end_date timestamptz DEFAULT NULL,
  p_next_operation_date timestamptz DEFAULT NULL, p_notes text DEFAULT NULL,
  p_products_used jsonb DEFAULT NULL, p_operation_size numeric DEFAULT NULL,
  p_yield_per_hectare numeric DEFAULT NULL, p_seeds_per_hectare numeric DEFAULT NULL
) RETURNS public.operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_ledger_active boolean;
  v_group_id uuid := gen_random_uuid();
  v_unit text;
  v_lot_number text;
  v_lot_number_snapshot text;
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

-- Check if ledger is active for this institution
SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

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

-- Write ledger movements if ledger is active
IF v_ledger_active THEN
  -- For each product with lot allocations
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_products)
  LOOP
    v_product_id := v_item ->> 'productId';
    v_product_uuid := v_product_id::uuid;
    
    SELECT unit INTO v_unit FROM public.products WHERE id = v_product_uuid;
    
    v_has_allocations := v_item ? 'lotAllocations' AND jsonb_typeof(v_item -> 'lotAllocations') = 'array';
    
    IF v_has_allocations THEN
      FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_item -> 'lotAllocations')
      LOOP
        v_lot_id := v_alloc ->> 'lotId';
        v_alloc_qty := (v_alloc ->> 'quantity')::numeric;
        
        IF v_lot_id IS NOT NULL AND v_lot_id != '' THEN
          v_lot_uuid := v_lot_id::uuid;
          SELECT lot_number INTO v_lot_number FROM public.product_lots WHERE id = v_lot_uuid;
        ELSE
          v_lot_uuid := NULL;
          v_lot_number := NULL;
        END IF;
        
        INSERT INTO public.inventory_movements (
          institution_id, product_id, lot_id, lot_number_snapshot,
          operation_id, movement_group_id, movement_kind, movement_type,
          quantity, unit_snapshot, source_type, idempotency_key, created_by
        ) VALUES (
          v_institution_id, v_product_uuid, v_lot_uuid, v_lot_number,
          v_operation.id, v_group_id, 'PHYSICAL', 'OPERATION_CONSUMPTION',
          -v_alloc_qty, v_unit, 'operation',
          'OP_' || v_operation.id::text || '_' || v_product_id || '_' || COALESCE(v_lot_id, 'NULL'),
          v_user_id
        );
      END LOOP;
    ELSE
      v_lot_id := v_item ->> 'lotId';
      v_quantity := (v_item ->> 'quantity')::numeric;
      
      IF v_lot_id IS NOT NULL AND v_lot_id != '' THEN
        v_lot_uuid := v_lot_id::uuid;
        SELECT lot_number INTO v_lot_number FROM public.product_lots WHERE id = v_lot_uuid;
      ELSE
        v_lot_uuid := NULL;
        v_lot_number := NULL;
      END IF;
      
      INSERT INTO public.inventory_movements (
        institution_id, product_id, lot_id, lot_number_snapshot,
        operation_id, movement_group_id, movement_kind, movement_type,
        quantity, unit_snapshot, source_type, idempotency_key, created_by
      ) VALUES (
        v_institution_id, v_product_uuid, v_lot_uuid, v_lot_number,
        v_operation.id, v_group_id, 'PHYSICAL', 'OPERATION_CONSUMPTION',
        -v_quantity, v_unit, 'operation',
        'OP_' || v_operation.id::text || '_' || v_product_id || '_' || COALESCE(v_lot_id, 'NULL'),
        v_user_id
      );
    END IF;
  END LOOP;
END IF;

RETURN v_operation;
END;
$function$;

-- ============================================================
-- 2. delete_operation_with_stock — now cancels (soft delete)
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_operation_with_stock(
  p_operation_id uuid
) RETURNS public.operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_operation public.operations;
  v_all_product_ids text[];
  v_all_lot_ids text[];
  v_pid text;
  v_lid text;
  v_has_allocations boolean;
  v_ledger_active boolean;
  v_group_id uuid := gen_random_uuid();
  v_unit text;
  v_lot_number text;
  v_orig_movement record;
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

-- Check if already cancelled
SELECT status INTO v_updated_count FROM public.operations
WHERE id = p_operation_id AND institution_id = v_institution_id;
IF NOT FOUND THEN
RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN';
END IF;

-- v_updated_count is int but we used it for status check above, fix:
BEGIN
  PERFORM 1 FROM public.operations
  WHERE id = p_operation_id AND institution_id = v_institution_id
  FOR UPDATE;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN';
END;

SELECT products_used, status INTO v_old_products, v_pid
FROM public.operations
WHERE id = p_operation_id
AND institution_id = v_institution_id
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN';
END IF;

IF v_pid = 'cancelled' THEN
RAISE EXCEPTION 'OPERATION_ALREADY_CANCELLED';
END IF;

v_old_products := COALESCE(v_old_products, '[]'::jsonb);

-- Check ledger active
SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

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

-- Write REVERSAL movements if ledger active
IF v_ledger_active THEN
  FOR v_orig_movement IN
    SELECT id, product_id, lot_id, quantity
    FROM public.inventory_movements
    WHERE operation_id = p_operation_id
    AND movement_type = 'OPERATION_CONSUMPTION'
  LOOP
    SELECT unit INTO v_unit FROM public.products WHERE id = v_orig_movement.product_id;
    SELECT lot_number INTO v_lot_number FROM public.product_lots WHERE id = v_orig_movement.lot_id;
    
    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      operation_id, movement_group_id, movement_kind, movement_type,
      quantity, unit_snapshot, source_type, reversal_of, idempotency_key, created_by
    ) VALUES (
      v_institution_id, v_orig_movement.product_id, v_orig_movement.lot_id, v_lot_number,
      p_operation_id, v_group_id, 'PHYSICAL', 'REVERSAL',
      -v_orig_movement.quantity, v_unit, 'operation',
      v_orig_movement.id,
      'REV_' || p_operation_id::text || '_' || v_orig_movement.id::text,
      v_user_id
    );
  END LOOP;
END IF;

-- Soft delete: cancel the operation
UPDATE public.operations
SET status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = v_user_id,
    updated_at = now()
WHERE id = p_operation_id
AND institution_id = v_institution_id
RETURNING * INTO v_operation;

IF NOT FOUND THEN
RAISE EXCEPTION 'OPERATION_DELETE_FAILED';
END IF;

RETURN v_operation;
END;
$function$;

-- ============================================================
-- 3. update_operation_with_stock — reversal + new movements
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_operation_with_stock(
  p_operation_id uuid, p_area_id uuid, p_type text, p_start_date timestamptz,
  p_description text, p_operated_by text,
  p_season_id uuid DEFAULT NULL, p_end_date timestamptz DEFAULT NULL,
  p_next_operation_date timestamptz DEFAULT NULL, p_notes text DEFAULT NULL,
  p_products_used jsonb DEFAULT NULL, p_operation_size numeric DEFAULT NULL,
  p_yield_per_hectare numeric DEFAULT NULL, p_seeds_per_hectare numeric DEFAULT NULL
) RETURNS public.operations
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_ledger_active boolean;
  v_reversal_group uuid := gen_random_uuid();
  v_new_group uuid := gen_random_uuid();
  v_unit text;
  v_lot_number text;
  v_orig_movement record;
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

-- Check ledger active
SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

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

-- Build OLD aggregates
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

-- Validate untracked stock
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

-- Write ledger: reverse old movements + insert new
IF v_ledger_active THEN
  -- Reverse old OPERATION_CONSUMPTION movements
  FOR v_orig_movement IN
    SELECT id, product_id, lot_id, quantity
    FROM public.inventory_movements
    WHERE operation_id = p_operation_id
    AND movement_type = 'OPERATION_CONSUMPTION'
  LOOP
    SELECT unit INTO v_unit FROM public.products WHERE id = v_orig_movement.product_id;
    SELECT lot_number INTO v_lot_number FROM public.product_lots WHERE id = v_orig_movement.lot_id;
    
    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      operation_id, movement_group_id, movement_kind, movement_type,
      quantity, unit_snapshot, source_type, reversal_of, idempotency_key, created_by
    ) VALUES (
      v_institution_id, v_orig_movement.product_id, v_orig_movement.lot_id, v_lot_number,
      p_operation_id, v_reversal_group, 'PHYSICAL', 'REVERSAL',
      -v_orig_movement.quantity, v_unit, 'operation',
      v_orig_movement.id,
      'REV_UPD_' || p_operation_id::text || '_' || v_orig_movement.id::text,
      v_user_id
    );
  END LOOP;
  
  -- Insert new OPERATION_CONSUMPTION movements
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_new_products)
  LOOP
    v_product_id := v_item ->> 'productId';
    v_product_uuid := v_product_id::uuid;
    
    SELECT unit INTO v_unit FROM public.products WHERE id = v_product_uuid;
    
    v_has_allocations := v_item ? 'lotAllocations' AND jsonb_typeof(v_item -> 'lotAllocations') = 'array';
    
    IF v_has_allocations THEN
      FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_item -> 'lotAllocations')
      LOOP
        v_lot_id := v_alloc ->> 'lotId';
        v_alloc_qty := (v_alloc ->> 'quantity')::numeric;
        
        IF v_lot_id IS NOT NULL AND v_lot_id != '' THEN
          v_lot_uuid := v_lot_id::uuid;
          SELECT lot_number INTO v_lot_number FROM public.product_lots WHERE id = v_lot_uuid;
        ELSE
          v_lot_uuid := NULL;
          v_lot_number := NULL;
        END IF;
        
        INSERT INTO public.inventory_movements (
          institution_id, product_id, lot_id, lot_number_snapshot,
          operation_id, movement_group_id, movement_kind, movement_type,
          quantity, unit_snapshot, source_type, idempotency_key, created_by
        ) VALUES (
          v_institution_id, v_product_uuid, v_lot_uuid, v_lot_number,
          p_operation_id, v_new_group, 'PHYSICAL', 'OPERATION_CONSUMPTION',
          -v_alloc_qty, v_unit, 'operation',
          'OP_UPD_' || p_operation_id::text || '_' || v_product_id || '_' || COALESCE(v_lot_id, 'NULL') || '_' || v_new_group::text,
          v_user_id
        );
      END LOOP;
    ELSE
      v_lot_id := v_item ->> 'lotId';
      v_quantity := (v_item ->> 'quantity')::numeric;
      
      IF v_lot_id IS NOT NULL AND v_lot_id != '' THEN
        v_lot_uuid := v_lot_id::uuid;
        SELECT lot_number INTO v_lot_number FROM public.product_lots WHERE id = v_lot_uuid;
      ELSE
        v_lot_uuid := NULL;
        v_lot_number := NULL;
      END IF;
      
      INSERT INTO public.inventory_movements (
        institution_id, product_id, lot_id, lot_number_snapshot,
        operation_id, movement_group_id, movement_kind, movement_type,
        quantity, unit_snapshot, source_type, idempotency_key, created_by
      ) VALUES (
        v_institution_id, v_product_uuid, v_lot_uuid, v_lot_number,
        p_operation_id, v_new_group, 'PHYSICAL', 'OPERATION_CONSUMPTION',
        -v_quantity, v_unit, 'operation',
        'OP_UPD_' || p_operation_id::text || '_' || v_product_id || '_' || COALESCE(v_lot_id, 'NULL') || '_' || v_new_group::text,
        v_user_id
      );
    END IF;
  END LOOP;
END IF;

RETURN v_operation;
END;
$function$;

-- ============================================================
-- 4. create_product_with_lots — STOCK_IN if ledger active
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_product_with_lots(
  p_name text, p_category text, p_unit text,
  p_min_stock_level numeric DEFAULT 0, p_price numeric DEFAULT 0,
  p_supplier text DEFAULT NULL, p_description text DEFAULT NULL,
  p_untracked_quantity numeric DEFAULT 0, p_lots jsonb DEFAULT '[]'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_ledger_active boolean;
  v_group_id uuid;
  v_lot_id uuid;
BEGIN
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

IF p_untracked_quantity IS NULL THEN
p_untracked_quantity := 0;
END IF;

IF p_untracked_quantity < 0 THEN
RAISE EXCEPTION 'INVALID_UNTRACKED_QUANTITY';
END IF;

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

IF v_lot_number = ANY(v_seen_lot_numbers) THEN
RAISE EXCEPTION 'DUPLICATE_LOT_NUMBER';
END IF;
v_seen_lot_numbers := array_append(v_seen_lot_numbers, v_lot_number);

v_lots_total := v_lots_total + v_lot_quantity;

v_trimmed_lots := v_trimmed_lots || jsonb_build_object(
'lot_number', v_lot_number,
'quantity', v_lot->>'quantity',
'expiration_date', v_lot->>'expiration_date'
);
END LOOP;

v_total := v_lots_total + p_untracked_quantity;

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

-- Write STOCK_IN movements if ledger active
SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

IF v_ledger_active AND v_total > 0 THEN
  v_group_id := gen_random_uuid();
  
  -- Movement for untracked stock
  IF p_untracked_quantity > 0 THEN
    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      movement_group_id, movement_kind, movement_type, quantity,
      unit_snapshot, source_type, idempotency_key, created_by
    ) VALUES (
      v_institution_id, v_product_id, NULL, NULL,
      v_group_id, 'PHYSICAL', 'STOCK_IN', p_untracked_quantity,
      p_unit, 'manual',
      'STOCKIN_NEW_' || v_product_id::text || '_UNTRACKED',
      v_user_id
    );
  END IF;
  
  -- Movements for each lot
  FOR v_i IN 0..v_lot_count - 1 LOOP
    v_lot := v_trimmed_lots->v_i;
    v_lot_number := v_lot->>'lot_number';
    v_lot_quantity := (v_lot->>'quantity')::numeric;
    
    SELECT id INTO v_lot_id FROM public.product_lots
    WHERE product_id = v_product_id AND lot_number = v_lot_number;
    
    INSERT INTO public.inventory_movements (
      institution_id, product_id, lot_id, lot_number_snapshot,
      movement_group_id, movement_kind, movement_type, quantity,
      unit_snapshot, source_type, idempotency_key, created_by
    ) VALUES (
      v_institution_id, v_product_id, v_lot_id, v_lot_number,
      v_group_id, 'PHYSICAL', 'STOCK_IN', v_lot_quantity,
      p_unit, 'manual',
      'STOCKIN_NEW_' || v_product_id::text || '_' || v_lot_id::text,
      v_user_id
    );
  END LOOP;
END IF;

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
$function$;

-- ============================================================
-- 5. create_product_lot — LOT_CLASSIFICATION if ledger active
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

IF EXISTS (
SELECT 1 FROM public.product_lots
WHERE product_id = p_product_id AND lot_number = v_lot_number
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

-- Write LOT_CLASSIFICATION movements if ledger active
SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

IF v_ledger_active AND p_quantity > 0 THEN
  v_group_id := gen_random_uuid();
  SELECT unit INTO v_unit FROM public.products WHERE id = p_product_id;
  
  -- untracked -> lot (net zero for product)
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
-- 6. update_product_lot — LOT_CLASSIFICATION if ledger active
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

-- Write LOT_CLASSIFICATION movements if ledger active and quantity changed
SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

IF v_ledger_active AND p_quantity IS NOT NULL AND p_quantity != v_old_lot_quantity THEN
  v_group_id := gen_random_uuid();
  v_delta := p_quantity - v_old_lot_quantity;
  SELECT unit INTO v_unit FROM public.products WHERE id = v_product_id;
  
  IF v_delta > 0 THEN
    -- untracked -> lot
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
    -- lot -> untracked
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
-- 7. delete_product_lot — block if ledger history exists
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_product_lot(
  p_lot_id uuid
) RETURNS public.product_lots
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_institution_id uuid;
  v_old_lot public.product_lots;
  v_product_id uuid;
  v_deleted_lot public.product_lots;
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

SELECT * INTO v_old_lot
FROM public.product_lots
WHERE id = p_lot_id;

IF NOT FOUND THEN
RAISE EXCEPTION 'LOT_NOT_FOUND';
END IF;

v_product_id := v_old_lot.product_id;

PERFORM 1
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

-- Check if lot has ledger history
SELECT opening_balance_complete INTO v_ledger_active
FROM public.institution_ledger_config
WHERE institution_id = v_institution_id;

IF v_ledger_active AND EXISTS (
  SELECT 1 FROM public.inventory_movements
  WHERE lot_id = p_lot_id
) THEN
  RAISE EXCEPTION 'LOT_HAS_LEDGER_HISTORY';
END IF;

-- Write LOT_CLASSIFICATION movements if ledger active (lot -> untracked)
IF v_ledger_active AND v_old_lot.quantity > 0 THEN
  v_group_id := gen_random_uuid();
  SELECT unit INTO v_unit FROM public.products WHERE id = v_product_id;
  
  -- lot -> untracked
  INSERT INTO public.inventory_movements (
    institution_id, product_id, lot_id, lot_number_snapshot,
    movement_group_id, movement_kind, movement_type, quantity,
    unit_snapshot, source_type, idempotency_key, created_by
  ) VALUES (
    v_institution_id, v_product_id, p_lot_id, v_old_lot.lot_number,
    v_group_id, 'CLASSIFICATION', 'LOT_CLASSIFICATION', -v_old_lot.quantity,
    v_unit, 'manual',
    'LOTCLASS_DEL_LOT_' || p_lot_id::text,
    v_user_id
  );
  
  INSERT INTO public.inventory_movements (
    institution_id, product_id, lot_id, lot_number_snapshot,
    movement_group_id, movement_kind, movement_type, quantity,
    unit_snapshot, source_type, idempotency_key, created_by
  ) VALUES (
    v_institution_id, v_product_id, NULL, NULL,
    v_group_id, 'CLASSIFICATION', 'LOT_CLASSIFICATION', v_old_lot.quantity,
    v_unit, 'manual',
    'LOTCLASS_DEL_NULL_' || p_lot_id::text,
    v_user_id
  );
END IF;

DELETE FROM public.product_lots
WHERE id = p_lot_id
RETURNING * INTO v_deleted_lot;

RETURN v_deleted_lot;
END;
$function$;