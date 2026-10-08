# ETAPA 4F — LEDGER CUTOVER

**Data:** 2026-10-08  
**Status:** COMPLETE  
**Depends on:** ETAPA 4D1 (Ledger Decisions), ETAPA 4E (Phase A Schema)

---

## 1. Objective

Activate the inventory ledger as the authoritative stock accounting system. All 7 stock-mutating RPCs now write append-only `inventory_movements` rows atomically alongside their existing stock/lots mutations. Operations use soft-delete (cancellation) instead of physical DELETE. Lots with ledger history cannot be physically deleted.

---

## 2. Migrations Applied

### Migration 1: `add_soft_delete_and_archive_columns`
- **operations**: added `status text NOT NULL DEFAULT 'active'`, `cancelled_at timestamptz`, `cancelled_by uuid`
- **product_lots**: added `archived_at timestamptz`, `archived_by uuid`
- Index on `operations(status)` for filtered queries

### Migration 2: `activate_ledger_opening_balances`
- Generated 288 OPENING_BALANCE movements (171 lot-level + 117 untracked)
- Grand sum: **4,638,907.93** across 2 institutions with data
- All 6 institutions marked `opening_balance_complete = true`
- Validation: product-level and lot-level sums match materialized balances
- Idempotency keys: `OPENING_BALANCE_<institution>_<lot|UNTRACKED>_<product>`

### Migration 3: `adapt_rpcs_for_ledger_dualwrite`
- Rewrote all 7 SECURITY DEFINER RPCs to write ledger movements within the same transaction

---

## 3. RPC Changes

### 3.1 `create_operation_with_stock`
- After stock decrements + operation INSERT, inserts OPERATION_CONSUMPTION movements
- One movement per lot allocation (with lot_id) and one for untracked (lot_id NULL)
- All share `movement_group_id = gen_random_uuid()`
- Quantity is negative (consumption = outflow)
- `unit_snapshot` populated from `products.unit`
- `lot_number_snapshot` populated from `product_lots.lot_number`
- Only writes if `institution_ledger_config.opening_balance_complete = true`
- Idempotency key: `OP_<operation_id>_<product_id>_<lot_id|NULL>`

### 3.2 `update_operation_with_stock`
- Before applying new state, creates REVERSAL movements for all existing OPERATION_CONSUMPTION movements of this operation
- REVERSAL rows negate the original quantity, set `reversal_of = original.id`
- Then inserts new OPERATION_CONSUMPTION movements for the new state
- Two separate movement groups: one for reversals, one for new consumptions
- Idempotency keys: `REV_UPD_<op_id>_<orig_id>` and `OP_UPD_<op_id>_<prod>_<lot>_<group>`

### 3.3 `delete_operation_with_stock` — NOW CANCELLATION
- Changed from physical DELETE to soft delete: `UPDATE operations SET status='cancelled', cancelled_at=now(), cancelled_by=auth.uid()`
- Returns stock to products and lots (same as before)
- Writes REVERSAL movements for all OPERATION_CONSUMPTION movements
- Raises `OPERATION_ALREADY_CANCELLED` if status is already 'cancelled'
- Returns the cancelled operation row

### 3.4 `create_product_with_lots`
- After product + lots INSERT, writes STOCK_IN movements if ledger active
- One movement for untracked stock (lot_id NULL) + one per lot
- All positive quantity (inflow)
- `source_type = 'manual'`
- Idempotency key: `STOCKIN_NEW_<product_id>_<lot_id|UNTRACKED>`

### 3.5 `create_product_lot`
- After lot INSERT, writes LOT_CLASSIFICATION movement pair (net zero):
  - untracked: `-p_quantity` (outflow from untracked)
  - lot: `+p_quantity` (inflow to new lot)
- `movement_kind = 'CLASSIFICATION'`
- Only writes if `p_quantity > 0` and ledger active
- Idempotency keys: `LOTCLASS_CREATE_NULL_<lot_id>` and `LOTCLASS_CREATE_LOT_<lot_id>`

### 3.6 `update_product_lot`
- When quantity changes (p_quantity != old_quantity), writes LOT_CLASSIFICATION pair for the delta:
  - If delta > 0: untracked `-(delta)`, lot `+(delta)` (reclassification untracked→lot)
  - If delta < 0: lot `(delta)` (negative), untracked `-(delta)` (positive) (reclassification lot→untracked)
- Only writes when `p_quantity IS NOT NULL AND p_quantity != v_old_lot_quantity`
- Idempotency keys include `v_group_id` for uniqueness across updates

### 3.7 `delete_product_lot`
- **NEW BLOCK**: if ledger active and lot has ANY `inventory_movements` rows, raises `LOT_HAS_LEDGER_HISTORY`
- For lots WITHOUT ledger history: writes LOT_CLASSIFICATION pair (lot→untracked) then physical DELETE
- The lot→untracked pair: lot gets `-quantity`, untracked gets `+quantity` (net zero)

---

## 4. Frontend Changes

### 4.1 `src/context/AppContext.tsx` — `loadOperations`
- Added `.neq('status', 'cancelled')` filter to operations query
- Cancelled operations no longer appear in the operations list

### 4.2 `src/context/AppContext.tsx` — `deleteOperation`
- Replaced local array filter with `await loadOperations()` reload
- Since the RPC now soft-deletes (cancels), the operation remains in the database with `status='cancelled'`
- Reloading with the `.neq('status', 'cancelled')` filter naturally removes it from the list

### 4.3 `src/types/index.ts` — `Operation` interface
- Added `status?: string` field
- Added `season_id?: string` field (already used elsewhere, now typed)

---

## 5. POST Validation Results

### 5.1 Ledger Sums = Materialized Balances
- **Product-level**: 0 discrepancies (SUM(movements) = quantity_in_stock for all products)
- **Lot-level**: 0 discrepancies (SUM(movements) = quantity for all lots)
- **Untracked**: 0 discrepancies (quantity_in_stock - SUM(lots) = SUM(movements WHERE lot_id IS NULL))

### 5.2 Movement Statistics
- Total movements: **288** (all OPENING_BALANCE — no business operations have been created/cancelled post-cutover yet)
- Grand sum: **4,638,907.93**
- Institutions with movements: 2 (741ba2ae... and e8741889...)
- CLASSIFICATION net-zero per group: **0 violations**

### 5.3 Operations Status
- 309 operations total, all `status='active'` (none cancelled)
- No NULL status values (default 'active' applied to existing rows)

### 5.4 Negative Stock
- 0 products with negative quantity_in_stock
- 0 product_lots with negative quantity

### 5.5 Security Posture
- `inventory_movements`: RLS enabled, only SELECT granted to anon/authenticated (append-only enforced — all writes go through SECURITY DEFINER RPCs)
- `institution_ledger_config`: RLS enabled, only SELECT granted (no client mutations)
- `operations`: RLS enabled, 4 policies (SELECT/INSERT/UPDATE/DELETE scoped to institution)
- `product_lots`: RLS enabled, 4 policies (SELECT/INSERT/UPDATE/DELETE scoped to institution)

### 5.6 Build
- `npm run build` passes with 0 errors, 0 type errors

---

## 6. Append-Only Guarantees

The `inventory_movements` table enforces append-only at the database level:
- **No INSERT/UPDATE/DELETE grants** to anon or authenticated roles
- All writes occur exclusively within SECURITY DEFINER RPCs (running as the table owner)
- Corrections use the REVERSAL pattern (new rows that negate originals), never UPDATE or DELETE
- `reversal_of` column links reversal rows to their originals

---

## 7. Ledger Activation Logic

All 7 RPCs check `institution_ledger_config.opening_balance_complete` before writing movements:
- If `true`: movements are written atomically with the stock change
- If `false` or config row missing: the RPC still works (stock changes happen) but no ledger movements are written
- This allows gradual rollout — institutions not yet activated continue without ledger

Currently all 6 institutions are marked `opening_balance_complete = true`.

---

## 8. Temporary Files Cleaned Up
- `create_op_ref.sql` — removed
- `update_op_ref.sql` — removed

---

## 9. Architectural Decisions Confirmed

| Decision | Status |
|----------|--------|
| D1: Append-only ledger with signed quantities | Implemented |
| D2: PHYSICAL vs CLASSIFICATION movement kinds | Implemented |
| D3: Opening balance one-time per institution | Done (288 movements) |
| D4: Reversal pattern for corrections | Implemented in update + delete |
| D5: Soft delete for operations | Implemented (status='cancelled') |
| D6: Lot archive (no physical delete with history) | Implemented (LOT_HAS_LEDGER_HISTORY) |
| D7: lot_id ON DELETE RESTRICT | Enforced by FK + RPC check |
| D8: unit_snapshot NOT NULL | Enforced by column constraint |

---

## 10. Next Steps

- **ETAPA 4G**: Ledger audit report viewer (read-only UI for viewing movements)
- **ETAPA 4H**: Reconciliation job (scheduled check that ledger sums = materialized balances)
- Consider adding a "cancelled operations" view in the frontend for audit purposes
