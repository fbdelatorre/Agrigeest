/*
# Protect 7 business data institution_id FKs from CASCADE to RESTRICT

## Purpose

Institution_id foreign keys on business data tables currently use
ON DELETE CASCADE, meaning deleting an institution silently destroys all
associated business records. This is destructive and unacceptable for
permanent business data.

This migration converts 7 FKs from CASCADE to RESTRICT so that an
institution cannot be deleted while it still owns business data in any
of these tables. The delete must fail with a referential integrity error,
forcing explicit data treatment before institutional deletion.

## Tables Changed (7)

  areas.institution_id
  machinery.institution_id
  maintenances.institution_id
  notes.institution_id
  operations.institution_id
  products.institution_id
  seasons.institution_id

## NOT Changed

  invitations.institution_id — remains CASCADE (pending separate decision)
  maintenance_types.institution_id — remains CASCADE (pending separate decision)
  user_profiles.institution_id — remains CASCADE (pending separate decision)
  user_profiles.id — remains CASCADE (identity link)
  operations.user_id — remains SET NULL (ETAPA 3S)
  product_lots.product_id — remains RESTRICT
  operations.area_id — remains RESTRICT
  operations.season_id — remains RESTRICT
  maintenances.machinery_id — remains RESTRICT
  maintenances.maintenance_type_id — remains RESTRICT
  operation_products.operation_id — remains CASCADE
  operation_products.product_id — remains CASCADE

## Data Safety

  - No INSERT, UPDATE, DELETE, TRUNCATE, or backfill
  - No column, nullability, or default changes
  - No RLS policy changes
  - No RPC changes
  - Only constraint definition changes (DROP + ADD FK)

## FK Distribution

  PRE:  13 CASCADE,  5 RESTRICT, 10 SET NULL  (28 total)
  POST:  6 CASCADE, 12 RESTRICT, 10 SET NULL  (28 total)
*/

-- 1. areas
ALTER TABLE public.areas DROP CONSTRAINT areas_institution_id_fkey;
ALTER TABLE public.areas ADD CONSTRAINT areas_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE RESTRICT;

-- 2. machinery
ALTER TABLE public.machinery DROP CONSTRAINT machinery_institution_id_fkey;
ALTER TABLE public.machinery ADD CONSTRAINT machinery_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE RESTRICT;

-- 3. maintenances
ALTER TABLE public.maintenances DROP CONSTRAINT maintenances_institution_id_fkey;
ALTER TABLE public.maintenances ADD CONSTRAINT maintenances_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE RESTRICT;

-- 4. notes
ALTER TABLE public.notes DROP CONSTRAINT notes_institution_id_fkey;
ALTER TABLE public.notes ADD CONSTRAINT notes_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE RESTRICT;

-- 5. operations
ALTER TABLE public.operations DROP CONSTRAINT operations_institution_id_fkey;
ALTER TABLE public.operations ADD CONSTRAINT operations_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE RESTRICT;

-- 6. products
ALTER TABLE public.products DROP CONSTRAINT products_institution_id_fkey;
ALTER TABLE public.products ADD CONSTRAINT products_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE RESTRICT;

-- 7. seasons
ALTER TABLE public.seasons DROP CONSTRAINT seasons_institution_id_fkey;
ALTER TABLE public.seasons ADD CONSTRAINT seasons_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE RESTRICT;
