/*
# Protect product_lots from product CASCADE deletion

## Purpose
Prevent accidental deletion of product lots when a product is deleted.
Changes one foreign key from ON DELETE CASCADE to ON DELETE RESTRICT.

## Changes
1. product_lots_product_id_fkey: ON DELETE CASCADE -> ON DELETE RESTRICT

## What this does NOT change
- No data is deleted, updated, or inserted
- No columns are added or removed
- No RLS policies are altered
- No other foreign keys are touched (27 remaining FKs unchanged)
- No triggers, indexes, or functions are created
- ON UPDATE remains unchanged
- Nullability and types remain unchanged
- quantity_in_stock is NOT recalculated
- products_used is NOT altered

## Security
No security changes. RLS and policies remain exactly as-is.

## Rollback
To revert, change the FK back to ON DELETE CASCADE:
  ALTER TABLE product_lots DROP CONSTRAINT product_lots_product_id_fkey;
  ALTER TABLE product_lots ADD CONSTRAINT product_lots_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
*/

ALTER TABLE public.product_lots
  DROP CONSTRAINT product_lots_product_id_fkey;

ALTER TABLE public.product_lots
  ADD CONSTRAINT product_lots_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES public.products(id)
    ON DELETE RESTRICT;
