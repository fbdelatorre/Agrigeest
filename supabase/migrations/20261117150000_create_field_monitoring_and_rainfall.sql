BEGIN;

CREATE TABLE public.field_monitoring_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  season_id uuid NOT NULL,
  area_id uuid NOT NULL,
  observed_on date NOT NULL,
  phenological_stage text NOT NULL CHECK (length(btrim(phenological_stage)) BETWEEN 1 AND 120),
  report text NOT NULL CHECK (length(btrim(report)) BETWEEN 1 AND 12000),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.field_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.field_monitoring_reports(id),
  institution_id uuid NOT NULL,
  season_id uuid NOT NULL,
  area_id uuid NOT NULL,
  operation_type text NOT NULL CHECK (length(btrim(operation_type)) BETWEEN 1 AND 80),
  instructions text NOT NULL DEFAULT '' CHECK (length(instructions) <= 12000),
  products jsonb NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  operation_id uuid UNIQUE,
  executed_by uuid,
  executed_at timestamptz,
  CHECK (
    (operation_id IS NULL AND executed_by IS NULL AND executed_at IS NULL)
    OR (operation_id IS NOT NULL AND executed_by IS NOT NULL AND executed_at IS NOT NULL)
  )
);

CREATE TABLE public.field_rainfall (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  season_id uuid NOT NULL,
  area_id uuid NOT NULL,
  observed_on date NOT NULL,
  millimeters numeric(8,2) NOT NULL CHECK (millimeters BETWEEN 0 AND 3000),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, season_id, area_id, observed_on)
);

CREATE INDEX ON public.field_monitoring_reports (institution_id, season_id, observed_on DESC, id);
CREATE INDEX ON public.field_recommendations (institution_id, season_id, report_id, created_at DESC);
CREATE INDEX ON public.field_rainfall (institution_id, season_id, observed_on, area_id);

ALTER TABLE public.field_monitoring_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_rainfall ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.field_monitoring_reports, public.field_recommendations, public.field_rainfall
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.field_monitoring_reports, public.field_recommendations, public.field_rainfall TO authenticated;
GRANT INSERT (institution_id, season_id, area_id, observed_on, phenological_stage, report)
  ON public.field_monitoring_reports TO authenticated;
GRANT INSERT (report_id, institution_id, season_id, area_id, operation_type, instructions, products)
  ON public.field_recommendations TO authenticated;
GRANT INSERT (institution_id, season_id, area_id, observed_on, millimeters)
  ON public.field_rainfall TO authenticated;

CREATE FUNCTION public.can_record_field_data(p_institution_id uuid, p_season_id uuid, p_area_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND institution_id = p_institution_id
  ) AND EXISTS (
    SELECT 1 FROM public.seasons
    WHERE id = p_season_id AND institution_id = p_institution_id
  ) AND EXISTS (
    SELECT 1 FROM public.areas
    WHERE id = p_area_id AND institution_id = p_institution_id
  );
$$;
REVOKE ALL ON FUNCTION public.can_record_field_data(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_record_field_data(uuid, uuid, uuid) TO authenticated;

CREATE POLICY read_field_monitors ON public.field_monitoring_reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.institution_id = field_monitoring_reports.institution_id));
CREATE POLICY read_field_recommendations ON public.field_recommendations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.institution_id = field_recommendations.institution_id));
CREATE POLICY read_field_rainfall ON public.field_rainfall FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.institution_id = field_rainfall.institution_id));

CREATE POLICY insert_field_monitors ON public.field_monitoring_reports FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid())
    AND public.can_record_field_data(institution_id, season_id, area_id));
CREATE POLICY insert_field_recommendations ON public.field_recommendations FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid())
    AND public.can_record_field_data(institution_id, season_id, area_id)
    AND EXISTS (SELECT 1 FROM public.field_monitoring_reports r
      WHERE r.id = field_recommendations.report_id
        AND r.institution_id = field_recommendations.institution_id
        AND r.season_id = field_recommendations.season_id
        AND r.area_id = field_recommendations.area_id));
CREATE POLICY insert_field_rainfall ON public.field_rainfall FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid())
    AND public.can_record_field_data(institution_id, season_id, area_id));

CREATE FUNCTION public.prepare_field_recommendation_products()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  entry jsonb;
  product record;
  dose numeric;
  snapshots jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(NEW.products) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'INVALID_RECOMMENDATION_PRODUCTS';
  END IF;
  IF jsonb_array_length(NEW.products) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'INVALID_RECOMMENDATION_PRODUCTS';
  END IF;

  FOR entry IN SELECT value FROM jsonb_array_elements(NEW.products)
  LOOP
    IF jsonb_typeof(entry->'dose') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'INVALID_RECOMMENDATION_DOSE';
    END IF;
    dose := (entry->>'dose')::numeric;
    IF dose <= 0 OR dose > 1000000 THEN
      RAISE EXCEPTION 'INVALID_RECOMMENDATION_DOSE';
    END IF;

    SELECT id, name, unit INTO product FROM public.products
    WHERE id = (entry->>'productId')::uuid AND institution_id = NEW.institution_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN';
    END IF;
    IF snapshots @> jsonb_build_array(jsonb_build_object('productId', product.id)) THEN
      RAISE EXCEPTION 'DUPLICATE_RECOMMENDATION_PRODUCT';
    END IF;

    snapshots := snapshots || jsonb_build_array(jsonb_build_object(
      'productId', product.id, 'name', product.name, 'unit', product.unit, 'dose', dose
    ));
  END LOOP;

  NEW.products := snapshots;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_field_recommendation_products() FROM PUBLIC, anon;
CREATE TRIGGER prepare_field_recommendation_products
  BEFORE INSERT ON public.field_recommendations FOR EACH ROW
  EXECUTE FUNCTION public.prepare_field_recommendation_products();

CREATE FUNCTION public.get_field_rainfall_totals(p_season_id uuid, p_from date, p_to date)
RETURNS TABLE (area_id uuid, millimeters numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT r.area_id, sum(r.millimeters)
  FROM public.field_rainfall r
  WHERE r.season_id = p_season_id
    AND (p_from IS NULL OR r.observed_on >= p_from)
    AND r.observed_on <= p_to
  GROUP BY r.area_id;
$$;
REVOKE ALL ON FUNCTION public.get_field_rainfall_totals(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_field_rainfall_totals(uuid, date, date) TO authenticated;

CREATE FUNCTION public.execute_field_recommendation(
  p_recommendation_id uuid,
  p_start_date timestamptz,
  p_description text,
  p_operated_by text,
  p_end_date timestamptz,
  p_next_operation_date timestamptz,
  p_notes text,
  p_products_used jsonb,
  p_operation_size numeric,
  p_yield_per_hectare numeric,
  p_seeds_per_hectare numeric
)
RETURNS public.operations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  recommendation public.field_recommendations%ROWTYPE;
  created_operation public.operations%ROWTYPE;
  user_id uuid := auth.uid();
  institution uuid;
BEGIN
  SELECT p.institution_id INTO institution FROM public.user_profiles p WHERE p.id = user_id;
  IF institution IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NO_INSTITUTION';
  END IF;

  SELECT * INTO recommendation FROM public.field_recommendations r
  WHERE r.id = p_recommendation_id AND r.institution_id = institution
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RECOMMENDATION_NOT_FOUND_OR_FORBIDDEN';
  END IF;
  IF recommendation.operation_id IS NOT NULL THEN
    RAISE EXCEPTION 'RECOMMENDATION_ALREADY_EXECUTED';
  END IF;

  SELECT * INTO created_operation FROM public.create_operation_with_stock(
    recommendation.area_id, recommendation.operation_type, p_start_date, p_description, p_operated_by,
    recommendation.season_id, p_end_date, p_next_operation_date, p_notes, p_products_used,
    p_operation_size, p_yield_per_hectare, p_seeds_per_hectare
  );
  IF created_operation.id IS NULL THEN
    RAISE EXCEPTION 'OPERATION_NOT_CREATED';
  END IF;

  UPDATE public.field_recommendations
  SET operation_id = created_operation.id, executed_by = user_id, executed_at = now()
  WHERE id = recommendation.id;

  RETURN created_operation;
END;
$$;
REVOKE ALL ON FUNCTION public.execute_field_recommendation(
  uuid, timestamptz, text, text, timestamptz, timestamptz, text, jsonb, numeric, numeric, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_field_recommendation(
  uuid, timestamptz, text, text, timestamptz, timestamptz, text, jsonb, numeric, numeric, numeric
) TO authenticated;

COMMIT;
