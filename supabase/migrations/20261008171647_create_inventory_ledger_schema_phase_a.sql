/*
# Create Inventory Ledger Schema — Phase A

## Purpose
Create the empty infrastructure for the append-only inventory ledger.
This migration does NOT create any movements, does NOT alter existing
tables/RPCs, and does NOT change business data. It only adds two new
tables with their constraints, indexes, RLS, and grants.

## New Tables

### institution_ledger_config
- Per-institution ledger configuration.
- `ledger_started_at` NULL means ledger not yet started for that institution.
- Born empty — no rows inserted in this phase.

### inventory_movements
- Append-only ledger of all stock movements (physical and classification).
- `quantity` is signed: positive = inflow, negative = outflow.
- `unit_snapshot` is NOT NULL — preserves the unit at time of movement.
- `lot_id` uses ON DELETE RESTRICT — lots with ledger history cannot be deleted.
- Born empty — 0 rows. No opening balances in this phase.

## Security
- RLS enabled on both tables.
- authenticated: SELECT only (own institution). No INSERT/UPDATE/DELETE.
- anon: no access to either table.
- No public RPCs created — movements will only be inserted by future business RPCs.

## No Changes to Existing Objects
- No existing table altered.
- No existing RPC altered.
- No existing grant/RLS policy modified.
- No business data modified.
*/

-- ============================================================
-- 1. institution_ledger_config
-- ============================================================

CREATE TABLE IF NOT EXISTS public.institution_ledger_config (
  institution_id uuid PRIMARY KEY REFERENCES public.institutions(id) ON DELETE RESTRICT,
  ledger_started_at timestamptz NULL,
  opening_balance_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.institution_ledger_config ENABLE ROW LEVEL SECURITY;

-- authenticated: SELECT only own institution's config
DROP POLICY IF EXISTS "select_own_ledger_config" ON public.institution_ledger_config;
CREATE POLICY "select_own_ledger_config"
  ON public.institution_ledger_config
  FOR SELECT
  TO authenticated
  USING (
    institution_id = (
      SELECT institution_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- Revoke all mutations from authenticated and anon
REVOKE INSERT, UPDATE, DELETE ON public.institution_ledger_config FROM authenticated, anon;

-- ============================================================
-- 2. inventory_movements
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_id uuid NULL REFERENCES public.product_lots(id) ON DELETE RESTRICT,
  lot_number_snapshot text NULL,
  operation_id uuid NULL REFERENCES public.operations(id) ON DELETE SET NULL,
  movement_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  movement_kind text NOT NULL,
  movement_type text NOT NULL,
  quantity numeric NOT NULL,
  unit_snapshot text NOT NULL,
  unit_cost numeric NULL,
  total_cost numeric NULL,
  reason text NULL,
  notes text NULL,
  source_type text NOT NULL DEFAULT 'manual',
  reversal_of uuid NULL REFERENCES public.inventory_movements(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Constraints
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT ck_im_quantity_not_zero CHECK (quantity <> 0);

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT ck_im_movement_kind CHECK (
    movement_kind IN ('PHYSICAL', 'CLASSIFICATION')
  );

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT ck_im_movement_type CHECK (
    movement_type IN (
      'OPENING_BALANCE',
      'STOCK_IN',
      'OPERATION_CONSUMPTION',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'REVERSAL',
      'LOT_CLASSIFICATION'
    )
  );

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT ck_im_source_type CHECK (
    source_type IN ('operation', 'opening_balance', 'manual', 'receipt')
  );

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT ck_im_adjustment_reason CHECK (
    movement_type NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT')
    OR reason IS NOT NULL
  );

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT ck_im_reversal_type CHECK (
    reversal_of IS NULL OR movement_type = 'REVERSAL'
  );

-- ============================================================
-- 4. Idempotency unique constraint
-- ============================================================

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT uq_inventory_movements_idempotency
  UNIQUE (institution_id, idempotency_key);

-- ============================================================
-- 5. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_im_product_effective
  ON public.inventory_movements (product_id, effective_at);

CREATE INDEX IF NOT EXISTS idx_im_lot_effective
  ON public.inventory_movements (lot_id, effective_at)
  WHERE lot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_im_institution_created
  ON public.inventory_movements (institution_id, created_at);

CREATE INDEX IF NOT EXISTS idx_im_operation
  ON public.inventory_movements (operation_id)
  WHERE operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_im_group
  ON public.inventory_movements (movement_group_id);

CREATE INDEX IF NOT EXISTS idx_im_type
  ON public.inventory_movements (movement_type);

CREATE INDEX IF NOT EXISTS idx_im_reversal
  ON public.inventory_movements (reversal_of)
  WHERE reversal_of IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_im_product_lot
  ON public.inventory_movements (product_id, lot_id);

-- ============================================================
-- 6. RLS
-- ============================================================

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- authenticated: SELECT only own institution's movements
DROP POLICY IF EXISTS "select_own_inventory_movements" ON public.inventory_movements;
CREATE POLICY "select_own_inventory_movements"
  ON public.inventory_movements
  FOR SELECT
  TO authenticated
  USING (
    institution_id = (
      SELECT institution_id FROM public.user_profiles WHERE id = auth.uid()
    )
  );

-- ============================================================
-- 7. Grants — revoke mutations from authenticated and anon
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON public.inventory_movements FROM authenticated, anon;