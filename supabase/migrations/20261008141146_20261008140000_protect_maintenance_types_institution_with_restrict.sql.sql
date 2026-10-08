/*
# ETAPA 3X — Protect maintenance_types.institution_id with RESTRICT

## Purpose
Convert the foreign key on maintenance_types.institution_id from
ON DELETE CASCADE to ON DELETE RESTRICT, preventing silent data loss
when an institution is deleted. Maintenance types are institutional
configuration data — their deletion should require explicit treatment,
consistent with the 7 business-data tables protected in ETAPA 3V.

## Changes
- DROP and recreate constraint maintenance_types_institution_id_fkey
  with ON DELETE RESTRICT (was CASCADE).
- No columns altered, no nullability changed, no data modified.

## Security
- No RLS policies changed.
- No RPCs altered.

## Notes
1. This is a pure DDL change — no INSERT/UPDATE/DELETE/TRUNCATE.
2. invitations.institution_id remains CASCADE (intentional — ephemeral data).
3. user_profiles.institution_id remains CASCADE (pending REVIEW decision).
4. No other FK is touched.
*/

ALTER TABLE public.maintenance_types
  DROP CONSTRAINT maintenance_types_institution_id_fkey;

ALTER TABLE public.maintenance_types
  ADD CONSTRAINT maintenance_types_institution_id_fkey
  FOREIGN KEY (institution_id)
  REFERENCES public.institutions(id)
  ON DELETE RESTRICT;