/*
# Fix 6 institutional user_id CASCADE foreign keys to SET NULL

## Purpose

The ETAPA 3T audit confirmed that 6 user_id → auth.users(id) foreign keys
with ON DELETE CASCADE represent AUTHORSHIP (who created the record), not
ownership. All 6 tables belong to the institution (RLS is institutional,
institution_id is present, no frontend uses user_id). If a user is deleted
from auth.users, these records should survive with user_id = NULL, not be
destroyed.

This mirrors the fix already applied to operations.user_id in ETAPA 3S.

## Changes

For each of these 6 tables:
  - areas
  - machinery
  - maintenance_types
  - maintenances
  - notes
  - seasons

1. ALTER COLUMN user_id DROP NOT NULL — allows NULL when author is removed
2. DROP existing CASCADE foreign key constraint
3. ADD new foreign key constraint with ON DELETE SET NULL

## NOT Changed
  - operations.user_id — already SET NULL (ETAPA 3S)
  - user_profiles.id — remains CASCADE (profile is the user's identity)
  - No RLS policies modified
  - No RPCs modified
  - No institution_id FKs touched

## Data Safety
  - No INSERT, UPDATE, DELETE, TRUNCATE, or backfill
  - No existing row data is modified
  - Only constraint definitions and nullability change

## Post-Migration FK Distribution
  PRE: 19 CASCADE, 5 RESTRICT, 4 SET NULL (28 total)
  POST: 13 CASCADE, 5 RESTRICT, 10 SET NULL (28 total)
*/

-- 1. areas
ALTER TABLE public.areas ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.areas DROP CONSTRAINT areas_user_id_fkey;
ALTER TABLE public.areas ADD CONSTRAINT areas_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. machinery
ALTER TABLE public.machinery ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.machinery DROP CONSTRAINT machinery_user_id_fkey;
ALTER TABLE public.machinery ADD CONSTRAINT machinery_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. maintenance_types
ALTER TABLE public.maintenance_types ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.maintenance_types DROP CONSTRAINT maintenance_types_user_id_fkey;
ALTER TABLE public.maintenance_types ADD CONSTRAINT maintenance_types_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. maintenances
ALTER TABLE public.maintenances ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.maintenances DROP CONSTRAINT maintenances_user_id_fkey;
ALTER TABLE public.maintenances ADD CONSTRAINT maintenances_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 5. notes
ALTER TABLE public.notes ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.notes DROP CONSTRAINT notes_user_id_fkey;
ALTER TABLE public.notes ADD CONSTRAINT notes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 6. seasons
ALTER TABLE public.seasons ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.seasons DROP CONSTRAINT seasons_user_id_fkey;
ALTER TABLE public.seasons ADD CONSTRAINT seasons_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
