/*
# Activate Inventory Ledger — Opening Balances

## Purpose
Activate the ledger for all existing institutions by:
1. Creating institution_ledger_config rows with ledger_started_at
2. Generating OPENING_BALANCE movements for all existing stock
3. Validating that ledger sums match materialized balances

## Opening Balance Logic
For each institution:
- ledger_started_at = now() (same timestamp for all)
- For each product with quantity_in_stock > 0:
  - For each lot with quantity > 0:
    - INSERT movement (PHYSICAL, OPENING_BALANCE, +lot.quantity, lot_id)
  - If untracked = quantity_in_stock - SUM(lots) > 0:
    - INSERT movement (PHYSICAL, OPENING_BALANCE, +untracked, lot_id=NULL)

## Idempotency
- idempotency_key = 'OPENING_BALANCE_' || institution_id || '_' || COALESCE(lot_id::text, 'UNTRACKED') || '_' || product_id::text
- Deterministic and unique per (institution, product, lot)

## Validation
After inserting all movements:
- SUM(movements.quantity) per product = products.quantity_in_stock
- SUM(movements.quantity WHERE lot_id IS NOT NULL) per lot = product_lots.quantity
- If any mismatch: raise exception (rollback entire migration)

## No Changes to Existing Data
- products.quantity_in_stock: NOT modified
- product_lots.quantity: NOT modified
- operations: NOT modified
- All existing data preserved
*/

-- Step 1: Define ledger_started_at
DO $$
DECLARE
  v_ledger_started_at timestamptz := now();
  v_inst_id uuid;
BEGIN
  -- Create config for all institutions
  INSERT INTO public.institution_ledger_config (institution_id, ledger_started_at, opening_balance_complete)
  SELECT id, v_ledger_started_at, false
  FROM public.institutions;

  -- Step 2: Generate OPENING_BALANCE movements for lots with quantity > 0
  INSERT INTO public.inventory_movements (
    institution_id, product_id, lot_id, lot_number_snapshot,
    movement_group_id, movement_kind, movement_type, quantity,
    unit_snapshot, source_type, idempotency_key, created_by,
    created_at, effective_at
  )
  SELECT
    p.institution_id,
    p.id,
    pl.id,
    pl.lot_number,
    gen_random_uuid(),
    'PHYSICAL',
    'OPENING_BALANCE',
    pl.quantity,
    p.unit,
    'opening_balance',
    'OPENING_BALANCE_' || p.institution_id::text || '_' || pl.id::text,
    NULL,
    v_ledger_started_at,
    v_ledger_started_at
  FROM public.product_lots pl
  JOIN public.products p ON p.id = pl.product_id
  WHERE pl.quantity > 0
    AND p.institution_id IS NOT NULL;

  -- Step 3: Generate OPENING_BALANCE movements for untracked stock
  INSERT INTO public.inventory_movements (
    institution_id, product_id, lot_id, lot_number_snapshot,
    movement_group_id, movement_kind, movement_type, quantity,
    unit_snapshot, source_type, idempotency_key, created_by,
    created_at, effective_at
  )
  SELECT
    p.institution_id,
    p.id,
    NULL,
    NULL,
    gen_random_uuid(),
    'PHYSICAL',
    'OPENING_BALANCE',
    p.quantity_in_stock - COALESCE(lot_sum.lot_total, 0),
    p.unit,
    'opening_balance',
    'OPENING_BALANCE_' || p.institution_id::text || '_UNTRACKED_' || p.id::text,
    NULL,
    v_ledger_started_at,
    v_ledger_started_at
  FROM public.products p
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS lot_total
    FROM public.product_lots
    WHERE quantity > 0
    GROUP BY product_id
  ) lot_sum ON lot_sum.product_id = p.id
  WHERE p.quantity_in_stock - COALESCE(lot_sum.lot_total, 0) > 0
    AND p.institution_id IS NOT NULL;

  -- Step 4: Validation — product-level
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        im.product_id,
        SUM(im.quantity) AS ledger_sum,
        p.quantity_in_stock AS materialized
      FROM public.inventory_movements im
      JOIN public.products p ON p.id = im.product_id
      WHERE im.movement_type = 'OPENING_BALANCE'
      GROUP BY im.product_id, p.quantity_in_stock
    ) v
    WHERE v.ledger_sum != v.materialized
  ) THEN
    RAISE EXCEPTION 'OPENING_BALANCE_VALIDATION_FAILED_PRODUCT';
  END IF;

  -- Step 5: Validation — lot-level
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        im.lot_id,
        SUM(im.quantity) AS ledger_sum,
        pl.quantity AS materialized
      FROM public.inventory_movements im
      JOIN public.product_lots pl ON pl.id = im.lot_id
      WHERE im.movement_type = 'OPENING_BALANCE'
      GROUP BY im.lot_id, pl.quantity
    ) v
    WHERE v.ledger_sum != v.materialized
  ) THEN
    RAISE EXCEPTION 'OPENING_BALANCE_VALIDATION_FAILED_LOT';
  END IF;

  -- Step 6: Mark all configs as complete
  UPDATE public.institution_ledger_config
  SET opening_balance_complete = true,
      updated_at = now();

END $$;