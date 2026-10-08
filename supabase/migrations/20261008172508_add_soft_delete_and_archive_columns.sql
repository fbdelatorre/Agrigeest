/*
# Add soft-delete to operations + archive columns to product_lots

## Purpose
Prepare existing tables for the ledger cutover:
1. operations: add status/cancelled_at/cancelled_by for soft delete
2. product_lots: add archived_at/archived_by for future lot archiving

## Changes
### operations
- status text NOT NULL DEFAULT 'active' — 'active' or 'cancelled'
- cancelled_at timestamptz NULL — when the operation was cancelled
- cancelled_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL — who cancelled

### product_lots
- archived_at timestamptz NULL — when the lot was archived
- archived_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL — who archived

## No Data Changes
- All existing operations get status='active' by default (NOT NULL DEFAULT)
- All existing lots get archived_at=NULL (active)
- No existing data modified

## No RLS/Grant Changes
- Existing RLS policies on operations and product_lots remain unchanged
- New columns inherit existing table-level RLS
*/

-- ============================================================
-- 1. operations: soft delete columns
-- ============================================================

ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz NULL;

ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS cancelled_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- 2. product_lots: archive columns
-- ============================================================

ALTER TABLE public.product_lots
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

ALTER TABLE public.product_lots
  ADD COLUMN IF NOT EXISTS archived_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;