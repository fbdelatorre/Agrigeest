/*
# Protect maintenance history from machinery and maintenance_type CASCADE deletion

## Purpose
Prevent accidental deletion of maintenance records when a machine or
maintenance type is deleted. Changes two foreign keys from
ON DELETE CASCADE to ON DELETE RESTRICT.

## Changes
1. maintenances_machinery_id_fkey: ON DELETE CASCADE -> ON DELETE RESTRICT
2. maintenances_maintenance_type_id_fkey: ON DELETE CASCADE -> ON DELETE RESTRICT

## What this does NOT change
- No data is deleted, updated, or inserted
- No columns are added or removed
- No RLS policies are altered
- No other foreign keys are touched (26 remaining FKs unchanged)
- No triggers, indexes, or functions are created
- ON UPDATE remains unchanged
- Nullability and types remain unchanged
- Offline sync logic is NOT modified
- Stock, operations, products are NOT touched

## Security
No security changes. RLS and policies remain exactly as-is.

## Rollback
To revert, change both FKs back to ON DELETE CASCADE:
  ALTER TABLE maintenances DROP CONSTRAINT maintenances_machinery_id_fkey;
  ALTER TABLE maintenances ADD CONSTRAINT maintenances_machinery_id_fkey
    FOREIGN KEY (machinery_id) REFERENCES machinery(id) ON DELETE CASCADE;
  ALTER TABLE maintenances DROP CONSTRAINT maintenances_maintenance_type_id_fkey;
  ALTER TABLE maintenances ADD CONSTRAINT maintenances_maintenance_type_id_fkey
    FOREIGN KEY (maintenance_type_id) REFERENCES maintenance_types(id) ON DELETE CASCADE;
*/

ALTER TABLE public.maintenances
  DROP CONSTRAINT maintenances_machinery_id_fkey;

ALTER TABLE public.maintenances
  ADD CONSTRAINT maintenances_machinery_id_fkey
    FOREIGN KEY (machinery_id)
    REFERENCES public.machinery(id)
    ON DELETE RESTRICT;

ALTER TABLE public.maintenances
  DROP CONSTRAINT maintenances_maintenance_type_id_fkey;

ALTER TABLE public.maintenances
  ADD CONSTRAINT maintenances_maintenance_type_id_fkey
    FOREIGN KEY (maintenance_type_id)
    REFERENCES public.maintenance_types(id)
    ON DELETE RESTRICT;
