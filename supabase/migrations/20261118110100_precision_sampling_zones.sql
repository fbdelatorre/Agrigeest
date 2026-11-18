BEGIN;

CREATE TABLE public.precision_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
  season_id uuid REFERENCES public.seasons(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  campaign text NOT NULL DEFAULT '' CHECK (length(campaign) <= 120),
  geometry jsonb NOT NULL CHECK (geometry->>'type' = 'Polygon' AND octet_length(geometry::text) <= 40000),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX precision_zones_by_field ON public.precision_zones(institution_id, area_id, season_id);
ALTER TABLE public.precision_zones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.precision_zones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.precision_zones TO authenticated;
GRANT INSERT (institution_id,area_id,season_id,name,campaign,geometry) ON public.precision_zones TO authenticated;
GRANT UPDATE (name,campaign,geometry) ON public.precision_zones TO authenticated;
CREATE POLICY precision_zones_read ON public.precision_zones FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.institution_id = precision_zones.institution_id)
);
CREATE POLICY precision_zones_insert ON public.precision_zones FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.institution_id = precision_zones.institution_id)
);
CREATE POLICY precision_zones_update ON public.precision_zones FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.institution_id = precision_zones.institution_id)
);

ALTER TABLE public.precision_samples ADD COLUMN zone_id uuid REFERENCES public.precision_zones(id) ON DELETE RESTRICT;
CREATE INDEX precision_samples_by_zone ON public.precision_samples(zone_id) WHERE zone_id IS NOT NULL;
GRANT INSERT (zone_id), UPDATE (zone_id) ON public.precision_samples TO authenticated;

CREATE FUNCTION public.validate_precision_zone() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  field_geometry geometry;
  zone_geometry geometry;
BEGIN
  IF NEW.season_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.seasons s WHERE s.id = NEW.season_id AND s.institution_id = NEW.institution_id
  ) THEN RAISE EXCEPTION 'ZONE_SEASON_MISMATCH'; END IF;
  SELECT a.geometry INTO field_geometry FROM public.areas a WHERE a.id = NEW.area_id AND a.institution_id = NEW.institution_id;
  IF field_geometry IS NULL OR NOT ST_IsValid(field_geometry) THEN RAISE EXCEPTION 'ZONE_FIELD_BOUNDARY_REQUIRED'; END IF;
  zone_geometry := ST_SetSRID(ST_GeomFromGeoJSON(NEW.geometry), 4326);
  IF ST_NDims(zone_geometry) <> 2 OR ST_IsEmpty(zone_geometry) OR ST_NPoints(zone_geometry) > 151
    OR NOT ST_IsValid(zone_geometry) OR NOT ST_CoveredBy(zone_geometry, field_geometry)
    THEN RAISE EXCEPTION 'ZONE_OUTSIDE_FIELD_OR_INVALID'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.precision_samples s WHERE s.zone_id = NEW.id
      AND NOT ST_Covers(zone_geometry, ST_SetSRID(ST_MakePoint(s.longitude,s.latitude),4326))
  ) THEN RAISE EXCEPTION 'ZONE_WOULD_EXCLUDE_SAMPLE'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_precision_zone BEFORE INSERT OR UPDATE ON public.precision_zones
FOR EACH ROW EXECUTE FUNCTION public.validate_precision_zone();
REVOKE ALL ON FUNCTION public.validate_precision_zone() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.validate_precision_sample_zone() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp AS $$
DECLARE
  target public.precision_zones;
BEGIN
  IF NEW.zone_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO target FROM public.precision_zones WHERE id = NEW.zone_id AND institution_id = NEW.institution_id FOR SHARE;
  IF NOT FOUND OR target.area_id IS DISTINCT FROM NEW.area_id OR target.season_id IS DISTINCT FROM NEW.season_id
    OR NOT ST_Covers(ST_SetSRID(ST_GeomFromGeoJSON(target.geometry),4326), ST_SetSRID(ST_MakePoint(NEW.longitude,NEW.latitude),4326))
    THEN RAISE EXCEPTION 'SAMPLE_ZONE_MISMATCH'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_precision_sample_zone BEFORE INSERT OR UPDATE OF zone_id ON public.precision_samples
FOR EACH ROW EXECUTE FUNCTION public.validate_precision_sample_zone();
REVOKE ALL ON FUNCTION public.validate_precision_sample_zone() FROM PUBLIC, anon, authenticated;
COMMIT;
