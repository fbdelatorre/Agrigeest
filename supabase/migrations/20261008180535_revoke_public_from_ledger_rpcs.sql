/*
# Revoke EXECUTE from PUBLIC on 4 ledger RPCs

## Purpose
Closes the security gap identified in ETAPA 4H: the 4 stock operation RPCs
were callable by any role (PUBLIC) because they were created without explicit
REVOKE FROM PUBLIC. This migration locks them down to authenticated only.

## What changes
- REVOKE ALL ... FROM PUBLIC and FROM anon on:
  1. add_inventory_stock(uuid, numeric, text, uuid, text, text, numeric, timestamptz)
  2. adjust_inventory_stock(uuid, numeric, text, text, uuid, text)
  3. archive_product_lot(uuid)
  4. check_inventory_reconciliation()
- GRANT EXECUTE ... TO authenticated on all 4.

## What does NOT change
- No function logic is altered.
- No function is recreated.
- No tables, policies, or triggers are touched.
*/

-- 1. add_inventory_stock
REVOKE ALL ON FUNCTION public.add_inventory_stock(
  uuid, numeric, text, uuid, text, text, numeric, timestamptz
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.add_inventory_stock(
  uuid, numeric, text, uuid, text, text, numeric, timestamptz
) FROM anon;

GRANT EXECUTE ON FUNCTION public.add_inventory_stock(
  uuid, numeric, text, uuid, text, text, numeric, timestamptz
) TO authenticated;

-- 2. adjust_inventory_stock
REVOKE ALL ON FUNCTION public.adjust_inventory_stock(
  uuid, numeric, text, text, uuid, text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.adjust_inventory_stock(
  uuid, numeric, text, text, uuid, text
) FROM anon;

GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock(
  uuid, numeric, text, text, uuid, text
) TO authenticated;

-- 3. archive_product_lot
REVOKE ALL ON FUNCTION public.archive_product_lot(
  uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.archive_product_lot(
  uuid
) FROM anon;

GRANT EXECUTE ON FUNCTION public.archive_product_lot(
  uuid
) TO authenticated;

-- 4. check_inventory_reconciliation
REVOKE ALL ON FUNCTION public.check_inventory_reconciliation()
FROM PUBLIC;

REVOKE ALL ON FUNCTION public.check_inventory_reconciliation()
FROM anon;

GRANT EXECUTE ON FUNCTION public.check_inventory_reconciliation()
TO authenticated;
