BEGIN;

CREATE TABLE public.write_schema_restore_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  definition jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.write_schema_restore_points ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.write_schema_restore_points FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.write_schema_restore_points TO authenticated;
CREATE POLICY institution_admin_reads_restore_metadata ON public.write_schema_restore_points FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND is_admin));
INSERT INTO public.write_schema_restore_points(label,definition)
SELECT 'antes-auditoria-de-lancamentos',jsonb_build_object(
  'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'sql',pg_get_functiondef(p.oid),'acl',p.proacl::text))
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
    ('create_operation_with_stock','update_operation_with_stock','delete_operation_with_stock','execute_field_recommendation')),
  'triggers',(SELECT jsonb_agg(pg_get_triggerdef(t.oid)) FROM pg_trigger t
    WHERE t.tgname='prepare_field_recommendation_products' AND t.tgrelid='public.field_recommendations'::regclass));

-- Append-only evidence. No existing business row is rewritten by this migration.
CREATE TABLE public.record_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL,
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  before_data jsonb,
  after_data jsonb,
  actor_id uuid DEFAULT auth.uid(),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ON public.record_audit_events(institution_id, occurred_at DESC);
CREATE INDEX ON public.record_audit_events(table_name, record_id, occurred_at DESC);
ALTER TABLE public.record_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.record_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.record_audit_events TO authenticated;
CREATE POLICY institution_admin_reads_audit ON public.record_audit_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=auth.uid()
    AND p.institution_id=record_audit_events.institution_id AND p.is_admin));

CREATE TABLE public.record_write_receipts (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  institution_id uuid NOT NULL,
  request jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.record_write_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.record_write_receipts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.audit_business_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous jsonb; current_row jsonb; institution uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN current_row := to_jsonb(NEW); END IF;
  institution := COALESCE((current_row->>'institution_id')::uuid,(previous->>'institution_id')::uuid);
  IF institution IS NULL AND TG_TABLE_NAME='product_lots' THEN
    SELECT p.institution_id INTO institution FROM public.products p
      WHERE p.id=COALESCE((current_row->>'product_id')::uuid,(previous->>'product_id')::uuid);
  END IF;
  IF institution IS NULL AND TG_TABLE_NAME='precision_lab_results' THEN
    SELECT s.institution_id INTO institution FROM public.precision_samples s
      WHERE s.id=COALESCE((current_row->>'sample_id')::uuid,(previous->>'sample_id')::uuid);
  END IF;
  IF institution IS NOT NULL AND previous IS DISTINCT FROM current_row THEN
    INSERT INTO public.record_audit_events(institution_id,table_name,record_id,action,before_data,after_data)
    VALUES(institution,TG_TABLE_NAME,COALESCE((current_row->>'id')::uuid,(previous->>'id')::uuid),TG_OP,
      previous - 'file_base64' - 'photo',current_row - 'file_base64' - 'photo');
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.audit_business_record() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['areas','seasons','operations','products','product_lots','machinery',
    'maintenances','maintenance_types','notes','field_monitoring_reports','field_recommendations',
    'field_rainfall','precision_samples','precision_zones','precision_lab_results','precision_lab_imports'] LOOP
    EXECUTE format('CREATE TRIGGER audit_business_record AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_business_record()', target);
  END LOOP;
END $$;

-- Protect dependencies absent from the original field tables' foreign keys.
CREATE FUNCTION public.guard_field_dependencies() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='areas' AND (EXISTS(SELECT 1 FROM public.field_monitoring_reports WHERE area_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.field_recommendations WHERE area_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.field_rainfall WHERE area_id=OLD.id)) THEN
    RAISE EXCEPTION 'RECORD_HAS_DEPENDENCIES' USING ERRCODE='23503';
  ELSIF TG_TABLE_NAME='seasons' AND (EXISTS(SELECT 1 FROM public.field_monitoring_reports WHERE season_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.field_recommendations WHERE season_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.field_rainfall WHERE season_id=OLD.id)) THEN
    RAISE EXCEPTION 'RECORD_HAS_DEPENDENCIES' USING ERRCODE='23503';
  ELSIF TG_TABLE_NAME='products' AND (to_jsonb(OLD)->>'quantity_in_stock')::numeric<>0 THEN
    RAISE EXCEPTION 'PRODUCT_HAS_STOCK';
  ELSIF TG_TABLE_NAME='products' AND EXISTS(SELECT 1 FROM public.field_recommendations r,
    LATERAL jsonb_array_elements(r.products) item WHERE item->>'productId'=OLD.id::text) THEN
    RAISE EXCEPTION 'RECORD_HAS_DEPENDENCIES' USING ERRCODE='23503';
  ELSIF TG_TABLE_NAME='products' AND EXISTS(SELECT 1 FROM public.operations o,
    LATERAL jsonb_array_elements(COALESCE(o.products_used,'[]')) item WHERE item->>'productId'=OLD.id::text) THEN
    RAISE EXCEPTION 'RECORD_HAS_DEPENDENCIES' USING ERRCODE='23503';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.guard_field_dependencies() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_field_dependencies BEFORE DELETE ON public.areas FOR EACH ROW EXECUTE FUNCTION public.guard_field_dependencies();
CREATE TRIGGER guard_field_dependencies BEFORE DELETE ON public.seasons FOR EACH ROW EXECUTE FUNCTION public.guard_field_dependencies();
CREATE TRIGGER guard_field_dependencies BEFORE DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.guard_field_dependencies();

-- Row locks make dependency checks safe against simultaneous creation/deletion.
CREATE FUNCTION public.validate_field_scope_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='UPDATE' AND (NEW.institution_id IS DISTINCT FROM OLD.institution_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.season_id IS DISTINCT FROM OLD.season_id) THEN RAISE EXCEPTION 'IMMUTABLE_RECORD_SCOPE'; END IF;
  PERFORM 1 FROM public.areas WHERE id=NEW.area_id AND institution_id=NEW.institution_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AREA_NOT_FOUND_OR_FORBIDDEN'; END IF;
  PERFORM 1 FROM public.seasons WHERE id=NEW.season_id AND institution_id=NEW.institution_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF TG_TABLE_NAME='field_recommendations' THEN
    PERFORM 1 FROM public.field_monitoring_reports r WHERE r.id=NEW.report_id
      AND r.area_id=NEW.area_id AND r.season_id=NEW.season_id AND r.institution_id=NEW.institution_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'REPORT_SCOPE_MISMATCH'; END IF;
  ELSIF NEW.observed_on > CURRENT_DATE THEN RAISE EXCEPTION 'FUTURE_OBSERVATION_DATE'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_field_scope_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_field_scope_write BEFORE INSERT OR UPDATE ON public.field_monitoring_reports FOR EACH ROW EXECUTE FUNCTION public.validate_field_scope_write();
CREATE TRIGGER validate_field_scope_write BEFORE INSERT OR UPDATE ON public.field_recommendations FOR EACH ROW EXECUTE FUNCTION public.validate_field_scope_write();
CREATE TRIGGER validate_field_scope_write BEFORE INSERT OR UPDATE ON public.field_rainfall FOR EACH ROW EXECUTE FUNCTION public.validate_field_scope_write();
DROP TRIGGER prepare_field_recommendation_products ON public.field_recommendations;
CREATE TRIGGER prepare_field_recommendation_products BEFORE INSERT OR UPDATE OF products ON public.field_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.prepare_field_recommendation_products();

CREATE FUNCTION public.mutate_business_record(p_table text,p_id uuid,p_action text,p_expected jsonb,p_changes jsonb,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid; original jsonb; changed jsonb; allowed text[]; assignments text;
  key text; value jsonb; request jsonb; receipt public.record_write_receipts; sample_institution uuid;
BEGIN
  SELECT institution_id INTO institution FROM public.user_profiles WHERE id=auth.uid();
  IF institution IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_action NOT IN ('update','delete') OR p_id IS NULL THEN RAISE EXCEPTION 'INVALID_MUTATION'; END IF;
  allowed := CASE p_table
    WHEN 'field_rainfall' THEN ARRAY['observed_on','millimeters','area_id']
    WHEN 'field_monitoring_reports' THEN ARRAY['observed_on','phenological_stage','report']
    WHEN 'field_recommendations' THEN ARRAY['operation_type','instructions','products']
    WHEN 'precision_samples' THEN ARRAY['label','lab_code','status','zone_id','responsible','laboratory','notes','collected_at','sample_type','sample_mode','subsample_count','depth_from_cm','depth_to_cm']
    WHEN 'precision_zones' THEN ARRAY['name','campaign','geometry']
    WHEN 'precision_lab_results' THEN ARRAY['parameter','value','original_value','unit','method','material']
    WHEN 'areas' THEN ARRAY['name','size','unit','location','description']
    WHEN 'machinery' THEN ARRAY['name','model','year','description']
    WHEN 'maintenances' THEN ARRAY['machinery_id','maintenance_type_id','description','material_used','date','machine_hours','cost','notes']
    WHEN 'maintenance_types' THEN ARRAY['name','description']
    WHEN 'notes' THEN ARRAY['title','content','note_date','is_completed','completed_date']
    WHEN 'seasons' THEN ARRAY['name','start_date','end_date','description']
    WHEN 'products' THEN ARRAY[]::text[]
    ELSE NULL END;
  IF allowed IS NULL OR (p_table='products' AND p_action<>'delete') THEN RAISE EXCEPTION 'INVALID_MUTATION_TABLE'; END IF;
  IF jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'object'
    OR p_expected='{}'::jsonb OR octet_length(p_changes::text)>65536 OR octet_length(p_expected::text)>65536
    THEN RAISE EXCEPTION 'EXPECTED_RECORD_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'IMMUTABLE_RECORD_SCOPE'; END IF;
  request := jsonb_build_object('table',p_table,'id',p_id,'action',p_action,'expected',p_expected,'changes',p_changes);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  SELECT * INTO receipt FROM public.record_write_receipts WHERE request_id=p_request_id;
  IF FOUND THEN
    IF receipt.actor_id<>auth.uid() OR receipt.request<>request THEN RAISE EXCEPTION 'REQUEST_KEY_REUSED'; END IF;
    RETURN receipt.result;
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',p_table) INTO original USING p_id;
  IF original IS NULL THEN RAISE EXCEPTION 'RECORD_NOT_FOUND_OR_FORBIDDEN' USING ERRCODE='42501'; END IF;
  sample_institution := (original->>'institution_id')::uuid;
  IF p_table='precision_lab_results' THEN
    SELECT institution_id INTO sample_institution FROM public.precision_samples WHERE id=(original->>'sample_id')::uuid;
  END IF;
  IF sample_institution IS DISTINCT FROM institution THEN RAISE EXCEPTION 'RECORD_NOT_FOUND_OR_FORBIDDEN' USING ERRCODE='42501'; END IF;
  FOR key,value IN SELECT * FROM jsonb_each(p_expected) LOOP
    IF key='updated_at' THEN
      IF date_trunc('milliseconds',(original->>key)::timestamptz) IS DISTINCT FROM date_trunc('milliseconds',(value#>>'{}')::timestamptz)
        THEN RAISE EXCEPTION 'RECORD_CONFLICT' USING ERRCODE='40001'; END IF;
    ELSIF original->key IS DISTINCT FROM value THEN RAISE EXCEPTION 'RECORD_CONFLICT' USING ERRCODE='40001'; END IF;
  END LOOP;
  IF p_table='field_recommendations' AND original->>'executed_at' IS NOT NULL THEN RAISE EXCEPTION 'RECOMMENDATION_ALREADY_EXECUTED'; END IF;
  IF p_table='precision_lab_results' AND p_changes->>'value' IS NOT NULL AND
    (p_changes->>'value')::numeric::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_NUMERIC_VALUE'; END IF;
  IF p_table='products' AND (original->>'quantity_in_stock')::numeric<>0 THEN RAISE EXCEPTION 'PRODUCT_HAS_STOCK'; END IF;
  IF p_table='field_monitoring_reports' AND p_action='delete' AND EXISTS(SELECT 1 FROM public.field_recommendations WHERE report_id=p_id)
    THEN RAISE EXCEPTION 'RECORD_HAS_DEPENDENCIES' USING ERRCODE='23503'; END IF;
  IF p_table='precision_zones' AND p_action='delete' AND EXISTS(SELECT 1 FROM public.precision_samples WHERE zone_id=p_id)
    THEN RAISE EXCEPTION 'RECORD_HAS_DEPENDENCIES' USING ERRCODE='23503'; END IF;
  IF p_action='delete' THEN
    EXECUTE format('DELETE FROM public.%I WHERE id=$1',p_table) USING p_id;
    changed := jsonb_build_object('id',p_id,'deleted',true);
  ELSE
    IF p_changes='{}'::jsonb THEN RAISE EXCEPTION 'EMPTY_MUTATION'; END IF;
    SELECT string_agg(format('%I=r.%I',k,k),',') INTO assignments FROM jsonb_object_keys(p_changes) k;
    EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$2) r WHERE t.id=$1 RETURNING to_jsonb(t)',p_table,assignments,p_table)
      INTO changed USING p_id,p_changes;
  END IF;
  INSERT INTO public.record_write_receipts(request_id,actor_id,institution_id,request,result)
    VALUES(p_request_id,auth.uid(),institution,request,changed);
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.mutate_business_record(text,uuid,text,jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mutate_business_record(text,uuid,text,jsonb,jsonb,uuid) TO authenticated;

CREATE FUNCTION public.validate_business_values() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current_row jsonb:=to_jsonb(NEW); previous jsonb; key text; number numeric;
BEGIN
  IF TG_OP='UPDATE' THEN
    previous:=to_jsonb(OLD);
    IF current_row->'institution_id' IS DISTINCT FROM previous->'institution_id'
      OR (auth.uid() IS NOT NULL AND current_row->'user_id' IS DISTINCT FROM previous->'user_id') THEN RAISE EXCEPTION 'IMMUTABLE_RECORD_SCOPE'; END IF;
  END IF;
  FOREACH key IN ARRAY ARRAY['size','cost','machine_hours','quantity_in_stock','quantity','price','min_stock_level'] LOOP
    IF current_row ? key AND current_row->>key IS NOT NULL AND (TG_OP='INSERT' OR current_row->key IS DISTINCT FROM previous->key) THEN
      number:=(current_row->>key)::numeric;
      IF number::text IN ('NaN','Infinity','-Infinity') OR number<0 OR (key='size' AND number=0) THEN RAISE EXCEPTION 'INVALID_NUMERIC_VALUE'; END IF;
    END IF;
  END LOOP;
  IF TG_TABLE_NAME='maintenances' THEN
    PERFORM 1 FROM public.machinery WHERE id=NEW.machinery_id AND institution_id=NEW.institution_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MACHINERY_NOT_FOUND_OR_FORBIDDEN'; END IF;
    PERFORM 1 FROM public.maintenance_types WHERE id=NEW.maintenance_type_id AND institution_id=NEW.institution_id FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MAINTENANCE_TYPE_NOT_FOUND_OR_FORBIDDEN'; END IF;
  ELSIF TG_TABLE_NAME='seasons' AND (current_row->>'end_date')::date<(current_row->>'start_date')::date THEN RAISE EXCEPTION 'DATES_OUT_OF_ORDER';
  ELSIF TG_TABLE_NAME='products' AND TG_OP='UPDATE' AND current_row->'unit' IS DISTINCT FROM previous->'unit'
    AND ((previous->>'quantity_in_stock')::numeric<>0 OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE product_id=OLD.id)
      OR EXISTS(SELECT 1 FROM public.operations o,LATERAL jsonb_array_elements(COALESCE(o.products_used,'[]')) x WHERE x->>'productId'=OLD.id::text))
    THEN RAISE EXCEPTION 'PRODUCT_UNIT_HAS_HISTORY';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_business_values() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['areas','seasons','products','product_lots','maintenances','machinery','maintenance_types','notes'] LOOP
    EXECUTE format('CREATE TRIGGER validate_business_values BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validate_business_values()',target);
  END LOOP;
END $$;

COMMIT;
