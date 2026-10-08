/*
# Protect operations from season/area CASCADE deletion

## Purpose
Prevent accidental deletion of historical operations when a season or area
is deleted. Changes two foreign keys from ON DELETE CASCADE to ON DELETE RESTRICT.

## Changes
1. operations_season_id_fkey: ON DELETE CASCADE -> ON DELETE RESTRICT
2. operations_area_id_fkey: ON DELETE CASCADE -> ON DELETE RESTRICT

## What this does NOT change
- No data is deleted, updated, or inserted
- No columns are added or removed
- No RLS policies are altered
- No other foreign keys are touched (26 remaining FKs unchanged)
- No triggers, indexes, or functions are created
- ON UPDATE remains NO ACTION on both constraints
- Nullability and types remain unchanged

## Security
No security changes. RLS and policies remain exactly as-is.

## Rollback
To revert, change both FKs back to ON DELETE CASCADE:
  ALTER TABLE operations DROP CONSTRAINT operations_season_id_fkey;
  ALTER TABLE operations ADD CONSTRAINT operations_season_id_fkey
    FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
  ALTER TABLE operations DROP CONSTRAINT operations_area_id_fkey;
  ALTER TABLE operations ADD CONSTRAINT operations_area_id_fkey
    FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE;
*/

ALTER TABLE public.operations
  DROP CONSTRAINT operations_season_id_fkey;

ALTER TABLE public.operations
  ADD CONSTRAINT operations_season_id_fkey
    FOREIGN KEY (season_id)
    REFERENCES public.seasons(id)
    ON DELETE RESTRICT;

ALTER TABLE public.operations
  DROP CONSTRAINT operations_area_id_fkey;

ALTER TABLE public.operations
  ADD CONSTRAINT operations_area_id_fkey
    FOREIGN KEY (area_id)
    REFERENCES public.areas(id)
    ON DELETE RESTRICT;
