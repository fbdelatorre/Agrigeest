/*
# ETAPA 3Z.1 — Protect user_profiles.institution_id with SET NULL

## Purpose
Convert the foreign key on user_profiles.institution_id from
ON DELETE CASCADE to ON DELETE SET NULL, preventing silent
deletion of user profiles when an institution is removed.

After this change:
- DELETE institution → user_profiles.institution_id becomes NULL
  (profile is preserved, user can later join another institution
  via join_institution_with_invitation RPC from ETAPA 3Z).
- DELETE auth.users → user_profiles is still CASCADE-deleted
  (user_profiles.id FK unchanged).

## Changes
- DROP and recreate constraint user_profiles_institution_id_fkey
  with ON DELETE SET NULL (was CASCADE).
- No columns altered, no nullability changed, no data modified.

## Security
- No RLS policies changed.
- No RPCs altered.
- No grants changed.

## Notes
1. Pure DDL — no INSERT/UPDATE/DELETE/TRUNCATE.
2. user_profiles.id → auth.users.id remains CASCADE (unchanged).
3. invitations.institution_id remains CASCADE (intentional).
4. The `institution` text column (denormalized) is NOT touched —
   it may temporarily retain the old institution name when
   institution_id becomes NULL. The source of truth is institution_id.
5. ETAPA 3Z's join_institution_with_invitation RPC overwrites
   `institution` text when the user joins a new institution.
6. Frontend already handles institution_id NULL via JoinInstitution
   component (ETAPA 3Z).
*/

ALTER TABLE public.user_profiles
  DROP CONSTRAINT user_profiles_institution_id_fkey;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_institution_id_fkey
  FOREIGN KEY (institution_id)
  REFERENCES public.institutions(id)
  ON DELETE SET NULL;