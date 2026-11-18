BEGIN;

CREATE TABLE public.precision_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text GENERATED ALWAYS AS ('AG-' || upper(replace(id::text, '-', ''))) STORED UNIQUE,
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 100),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  area_id uuid NOT NULL REFERENCES public.areas(id) ON DELETE RESTRICT,
  season_id uuid REFERENCES public.seasons(id) ON DELETE RESTRICT,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  collected_at timestamptz NOT NULL,
  sample_type text NOT NULL CHECK (sample_type ~ '^[a-z][a-z_]{1,31}$'),
  status text NOT NULL DEFAULT 'collected' CHECK (status IN ('collected','sent','awaiting','received','checked')),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  accuracy_m double precision CHECK (accuracy_m BETWEEN 0 AND 100000),
  point_source text NOT NULL CHECK (point_source IN ('gps','map','manual')),
  sample_mode text NOT NULL CHECK (sample_mode IN ('individual','composite')),
  subsample_count integer NOT NULL CHECK (subsample_count BETWEEN 1 AND 1000),
  depth_from_cm numeric CHECK (depth_from_cm BETWEEN 0 AND 1000),
  depth_to_cm numeric CHECK (depth_to_cm BETWEEN 0 AND 1000),
  responsible text NOT NULL CHECK (length(btrim(responsible)) BETWEEN 1 AND 160),
  laboratory text NOT NULL DEFAULT '' CHECK (length(laboratory) <= 160),
  notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 4000),
  details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 8000),
  photo text CHECK (length(photo) <= 450000 AND photo ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'),
  CHECK ((sample_mode = 'individual' AND subsample_count = 1) OR (sample_mode = 'composite' AND subsample_count > 1)),
  CHECK ((depth_from_cm IS NULL AND depth_to_cm IS NULL)
    OR (depth_from_cm IS NOT NULL AND depth_to_cm IS NOT NULL AND depth_to_cm > depth_from_cm))
);
CREATE INDEX ON public.precision_samples (institution_id, season_id, collected_at DESC);
CREATE INDEX ON public.precision_samples (area_id);
ALTER TABLE public.precision_samples ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.precision_samples FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.precision_samples TO authenticated;
GRANT INSERT (id,label,institution_id,area_id,season_id,collected_at,sample_type,longitude,latitude,accuracy_m,
  point_source,sample_mode,subsample_count,depth_from_cm,depth_to_cm,responsible,laboratory,notes,details,photo)
  ON public.precision_samples TO authenticated;
GRANT UPDATE (label,status) ON public.precision_samples TO authenticated;

CREATE POLICY precision_samples_read ON public.precision_samples FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.institution_id = precision_samples.institution_id)
);
CREATE POLICY precision_samples_insert ON public.precision_samples FOR INSERT TO authenticated WITH CHECK (
  created_by = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.institution_id = precision_samples.institution_id)
  AND EXISTS (SELECT 1 FROM public.areas a WHERE a.id = precision_samples.area_id AND a.institution_id = precision_samples.institution_id)
  AND (season_id IS NULL OR EXISTS (SELECT 1 FROM public.seasons s WHERE s.id = precision_samples.season_id AND s.institution_id = precision_samples.institution_id))
);
CREATE POLICY precision_samples_update ON public.precision_samples FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.institution_id = precision_samples.institution_id)
);
COMMIT;
