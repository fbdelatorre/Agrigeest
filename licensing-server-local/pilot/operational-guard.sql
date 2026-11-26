-- EXCLUSIVO DA CÓPIA PILOTO LOCAL. Não publicar este arquivo em produção.
BEGIN;
DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_DATABASE_REQUIRED';END IF;END $$;
CREATE TABLE licensing_private.operational_enrollments(
 institution_id uuid PRIMARY KEY REFERENCES public.institutions(id),organization_id uuid NOT NULL UNIQUE REFERENCES licensing_private.organizations(id),
 enforce boolean NOT NULL DEFAULT false,confirmed_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE licensing_private.operational_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing_private.operational_enrollments FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION licensing_private.enrolled(p_institution uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM licensing_private.operational_enrollments WHERE institution_id=p_institution AND enforce) $$;
CREATE FUNCTION licensing_private.active_institution() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE selected text; selected_institution uuid;BEGIN
 selected:=NULLIF(COALESCE(NULLIF(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-agrigest-institution-id','');
 IF selected IS NOT NULL THEN
  IF selected!~'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' THEN RAISE EXCEPTION 'INVALID_FARM_CONTEXT' USING ERRCODE='42501';END IF;
  selected_institution:=selected::uuid;
  IF licensing_private.enrolled(selected_institution) THEN
   IF NOT EXISTS(SELECT 1 FROM licensing_private.operational_enrollments e WHERE e.institution_id=selected_institution AND licensing.workspace_can(e.organization_id,'areas',false)) THEN RAISE EXCEPTION 'FARM_ACCESS_REQUIRED' USING ERRCODE='42501';END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=auth.uid() AND p.institution_id=selected_institution) THEN RAISE EXCEPTION 'FARM_ACCESS_REQUIRED' USING ERRCODE='42501';END IF;
 ELSE SELECT p.institution_id INTO selected_institution FROM public.user_profiles p WHERE p.id=auth.uid();END IF;
 RETURN selected_institution;
END $$;
CREATE FUNCTION licensing_private.active_is_admin() RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid; o licensing_private.organizations;BEGIN
 institution:=licensing_private.active_institution();
 SELECT org.* INTO o FROM licensing_private.organizations org JOIN licensing_private.operational_enrollments e ON e.organization_id=org.id WHERE e.institution_id=institution AND e.enforce;
 IF NOT FOUND THEN RETURN COALESCE((SELECT is_admin FROM public.user_profiles WHERE id=auth.uid()),false);END IF;
 RETURN o.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM licensing_private.memberships WHERE organization_id=o.id AND user_id=auth.uid() AND revoked_at IS NULL AND role IN ('administrator','application_manager'));
END $$;
CREATE FUNCTION licensing.current_institution() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT licensing_private.active_institution() $$;
CREATE FUNCTION licensing.current_institution_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT licensing_private.active_is_admin() $$;
CREATE FUNCTION licensing.operational_can(p_institution uuid,p_module text,p_write boolean DEFAULT false,p_author uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE selected uuid; org uuid;BEGIN
 selected:=licensing_private.active_institution();
 IF licensing_private.enrolled(selected) AND selected IS DISTINCT FROM p_institution THEN RETURN false;END IF;
 SELECT organization_id INTO org FROM licensing_private.operational_enrollments WHERE institution_id=p_institution AND enforce;
 IF NOT FOUND THEN RETURN true;END IF;
 RETURN licensing.workspace_can(org,p_module,p_write,p_author);
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
CREATE FUNCTION licensing_private.require_operational(p_module text,p_write boolean) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid;BEGIN
 institution:=licensing_private.active_institution();
 IF licensing_private.enrolled(institution) AND NOT licensing.operational_can(institution,p_module,p_write) THEN RAISE EXCEPTION 'LICENSE_OR_ROLE_FORBIDS_OPERATION' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION licensing.require_operational(p_module text,p_write boolean) RETURNS void LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT licensing_private.require_operational(p_module,p_write) $$;
CREATE FUNCTION licensing_private.table_module(p_table text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_table IN ('products','product_lots','inventory_movements','institution_ledger_config','seed_crops','seed_product_crops') THEN 'inventory'
 WHEN p_table IN ('operations','operation_products') THEN 'operations'
 WHEN p_table IN ('machinery','maintenances','maintenance_types','notes','invitations') THEN 'maintenance'
 WHEN p_table='field_monitoring_reports' THEN 'monitoring' WHEN p_table='field_rainfall' THEN 'rainfall' WHEN p_table='field_recommendations' THEN 'recommendations'
 WHEN p_table LIKE 'precision_%' THEN 'precision' ELSE 'areas' END
$$;
-- Mapeamento puro exposto ao RPC invoker sem abrir o schema privado.
CREATE FUNCTION licensing.operational_module(p_table text) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$ SELECT licensing_private.table_module(p_table) $$;
REVOKE ALL ON FUNCTION licensing.operational_module(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.operational_module(text) TO authenticated;
CREATE FUNCTION licensing_private.row_institution(p_table text,p_row jsonb) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid;BEGIN
 IF p_table='institutions' THEN RETURN (p_row->>'id')::uuid;END IF;
 IF p_row ? 'institution_id' THEN RETURN (p_row->>'institution_id')::uuid;END IF;
 IF p_table='product_lots' THEN SELECT institution_id INTO institution FROM public.products WHERE id=(p_row->>'product_id')::uuid;
 ELSIF p_table='operation_products' THEN SELECT institution_id INTO institution FROM public.operations WHERE id=(p_row->>'operation_id')::uuid;
 ELSIF p_table='precision_lab_results' THEN SELECT institution_id INTO institution FROM public.precision_samples WHERE id=(p_row->>'sample_id')::uuid;
 END IF;RETURN institution;
END $$;
CREATE FUNCTION licensing.operational_row_can(p_table text,p_row jsonb,p_write boolean DEFAULT false) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE module text; author uuid; data jsonb;BEGIN
 module:=licensing_private.table_module(p_table);data:=p_row;
 IF p_table='record_audit_events' THEN module:=licensing_private.table_module(p_row->>'table_name');data:=COALESCE(NULLIF(p_row->'after_data','null'),p_row->'before_data');
 ELSIF p_table='record_write_receipts' THEN module:=CASE WHEN p_row->'request' ? 'method' THEN 'inventory' WHEN p_row->'request' ? 'table' THEN licensing_private.table_module(p_row->'request'->>'table') ELSE 'operations' END;END IF;
 author:=COALESCE(NULLIF(data->>'created_by',''),NULLIF(data->>'user_id',''))::uuid;
 RETURN licensing.operational_can(licensing_private.row_institution(p_table,p_row),module,p_write,author);
END $$;
CREATE FUNCTION licensing.operational_enrolled_row(p_table text,p_row jsonb) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT licensing_private.enrolled(licensing_private.row_institution(p_table,p_row)) $$;
CREATE FUNCTION licensing_private.guard_operational_row() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE data jsonb; old_data jsonb; institution uuid; old_institution uuid; selected uuid; author uuid; module text; parent jsonb; ref record; target_id text; deleted_parents jsonb; parent_name text; parent_id text;BEGIN
 -- Manutenção SQL explícita do dono local do banco; nunca por JWT service_role.
 IF auth.uid() IS NULL AND session_user IN ('supabase_admin','postgres') AND current_setting('role',true) IN ('none','supabase_admin','postgres') THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 data:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 old_data:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE data END;
 institution:=licensing_private.row_institution(TG_TABLE_NAME,data);old_institution:=licensing_private.row_institution(TG_TABLE_NAME,old_data);selected:=licensing_private.active_institution();
 IF TG_OP='DELETE' AND institution IS NULL AND pg_trigger_depth()>1 THEN
  parent_name:=CASE TG_TABLE_NAME WHEN 'product_lots' THEN 'products' WHEN 'operation_products' THEN 'operations' WHEN 'precision_lab_results' THEN 'precision_samples' END;
  parent_id:=CASE TG_TABLE_NAME WHEN 'product_lots' THEN data->>'product_id' WHEN 'operation_products' THEN data->>'operation_id' WHEN 'precision_lab_results' THEN data->>'sample_id' END;
  deleted_parents:=COALESCE(NULLIF(current_setting('agrigest_pilot.deleted_parents',true),'')::jsonb,'[]');
  SELECT (v->>'institution')::uuid INTO institution FROM jsonb_array_elements(deleted_parents) v WHERE v->>'table'=parent_name AND v->>'id'=parent_id AND v->>'actor'=auth.uid()::text LIMIT 1;
  old_institution:=institution;
 END IF;
 IF NOT licensing_private.enrolled(institution) AND NOT licensing_private.enrolled(old_institution) AND NOT licensing_private.enrolled(selected) THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF institution IS DISTINCT FROM old_institution THEN RAISE EXCEPTION 'IMMUTABLE_FARM_SCOPE' USING ERRCODE='42501';END IF;
 IF institution IS NULL OR institution IS DISTINCT FROM selected THEN RAISE EXCEPTION 'FARM_SCOPE_MISMATCH' USING ERRCODE='42501';END IF;
 -- Serializa gravações com cancelamento, alteração de função e desligamento.
 PERFORM 1 FROM licensing.licenses l WHERE l.id IN (
  SELECT o.license_id FROM licensing_private.organizations o JOIN licensing_private.operational_enrollments e ON e.organization_id=o.id WHERE e.institution_id=institution
  UNION SELECT o.license_id FROM licensing_private.organizations o LEFT JOIN licensing_private.memberships m ON m.organization_id=o.id AND m.user_id=auth.uid() AND m.revoked_at IS NULL WHERE o.owner_id=auth.uid() OR m.id IS NOT NULL
 ) ORDER BY l.id FOR SHARE;
 module:=licensing_private.table_module(TG_TABLE_NAME);author:=COALESCE(NULLIF(data->>'created_by',''),NULLIF(data->>'user_id',''))::uuid;
 IF TG_TABLE_NAME='record_audit_events' THEN
  module:=licensing_private.table_module(data->>'table_name');parent:=COALESCE(NULLIF(data->'after_data','null'),data->'before_data');author:=COALESCE(NULLIF(parent->>'created_by',''),NULLIF(parent->>'user_id',''))::uuid;
 ELSIF TG_TABLE_NAME='record_write_receipts' THEN
  module:=CASE WHEN data->'request' ? 'method' THEN 'inventory' WHEN data->'request' ? 'table' THEN licensing_private.table_module(data->'request'->>'table') ELSE 'operations' END;
  author:=auth.uid();
 END IF;
 IF NOT licensing.operational_can(institution,module,true,author) THEN RAISE EXCEPTION 'LICENSE_OR_ROLE_FORBIDS_OPERATION' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='invitations' THEN RAISE EXCEPTION 'USE_LICENSED_TEAM_MANAGEMENT' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='field_recommendations' AND TG_OP='INSERT' AND (NULLIF(data->>'executed_at','') IS NOT NULL OR NULLIF(data->>'executed_by','') IS NOT NULL OR NULLIF(data->>'operation_id','') IS NOT NULL) THEN RAISE EXCEPTION 'RECOMMENDATION_EXECUTION_REQUIRES_OPERATION' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' AND data ? 'created_by' AND NULLIF(data->>'created_by','') IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'INVALID_RECORD_AUTHOR' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT' AND data ? 'user_id' AND NULLIF(data->>'user_id','') IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'INVALID_RECORD_AUTHOR' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' AND ((data ? 'created_by' AND data->'created_by' IS DISTINCT FROM old_data->'created_by') OR (data ? 'user_id' AND data->'user_id' IS DISTINCT FROM old_data->'user_id')) THEN RAISE EXCEPTION 'IMMUTABLE_RECORD_AUTHOR' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' AND data ? 'id' THEN
  deleted_parents:=COALESCE(NULLIF(current_setting('agrigest_pilot.deleted_parents',true),'')::jsonb,'[]');
  PERFORM set_config('agrigest_pilot.deleted_parents',(deleted_parents||jsonb_build_array(jsonb_build_object('table',TG_TABLE_NAME,'id',data->>'id','institution',institution,'actor',auth.uid())))::text,true);
 END IF;
 IF TG_OP<>'DELETE' THEN
  FOR ref IN SELECT c.confrelid::regclass AS parent_table,pa.attname AS parent_key,ca.attname AS child_key,pc.relname AS parent_name
   FROM pg_constraint c JOIN pg_class pc ON pc.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=pc.relnamespace
   JOIN pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=c.conkey[1] JOIN pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=c.confkey[1]
   WHERE c.contype='f' AND c.conrelid=TG_RELID AND cardinality(c.conkey)=1 AND pn.nspname='public' AND pc.relname<>'user_profiles'
  LOOP
   IF TG_OP='UPDATE' AND data->ref.child_key IS NOT DISTINCT FROM old_data->ref.child_key THEN CONTINUE;END IF;
   target_id:=NULLIF(data->>ref.child_key,'');IF target_id IS NULL THEN CONTINUE;END IF;
   EXECUTE format('SELECT to_jsonb(p) FROM %s p WHERE %I::text=$1',ref.parent_table,ref.parent_key) INTO parent USING target_id;
   IF parent IS NOT NULL AND licensing_private.row_institution(ref.parent_name,parent) IS NOT NULL AND licensing_private.row_institution(ref.parent_name,parent) IS DISTINCT FROM institution THEN RAISE EXCEPTION 'FARM_SCOPE_MISMATCH' USING ERRCODE='42501';END IF;
  END LOOP;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
CREATE FUNCTION licensing_private.guard_legacy_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL AND session_user IN ('supabase_admin','postgres') AND current_setting('role',true) IN ('none','supabase_admin','postgres') THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF TG_OP='DELETE' THEN IF licensing_private.enrolled(OLD.institution_id) THEN RAISE EXCEPTION 'PROFILE_HISTORY_PRESERVED' USING ERRCODE='42501';END IF;RETURN OLD;END IF;
 IF TG_OP='INSERT' THEN IF licensing_private.enrolled(NEW.institution_id) THEN RAISE EXCEPTION 'USE_TEAM_INVITATION' USING ERRCODE='42501';END IF;RETURN NEW;END IF;
 IF (licensing_private.enrolled(NEW.institution_id) OR licensing_private.enrolled(OLD.institution_id)) AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.institution_id IS DISTINCT FROM OLD.institution_id OR NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN RAISE EXCEPTION 'USE_LICENSED_TEAM_MANAGEMENT' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agrigest_licensed_profile_guard BEFORE INSERT OR UPDATE OR DELETE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION licensing_private.guard_legacy_profile();
REVOKE ALL ON FUNCTION licensing_private.enrolled(uuid),licensing_private.active_institution(),licensing_private.active_is_admin(),licensing_private.require_operational(text,boolean),licensing_private.table_module(text),licensing_private.row_institution(text,jsonb),licensing_private.guard_operational_row(),licensing_private.guard_legacy_profile() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION licensing.operational_can(uuid,text,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION licensing.operational_row_can(text,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION licensing.operational_enrolled_row(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION licensing.current_institution(),licensing.current_institution_admin() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION licensing.require_operational(text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.operational_can(uuid,text,boolean,uuid),licensing.operational_row_can(text,jsonb,boolean),licensing.operational_enrolled_row(text,jsonb),licensing.current_institution(),licensing.current_institution_admin(),licensing.require_operational(text,boolean) TO authenticated;
COMMIT;
