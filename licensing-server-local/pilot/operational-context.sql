-- Somente piloto local. Nunca publicar como migração automática.
BEGIN;
DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION licensing.operational_context() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid; org licensing_private.organizations; role_name text;BEGIN
 institution:=licensing.current_institution();
 SELECT o.* INTO org FROM licensing_private.organizations o JOIN licensing_private.operational_enrollments e ON e.organization_id=o.id WHERE e.institution_id=institution AND e.enforce;
 IF org.id IS NULL OR NOT licensing.workspace_can(org.id,'areas',false) THEN RAISE EXCEPTION 'FARM_ACCESS_REQUIRED' USING ERRCODE='42501';END IF;
 role_name:=CASE WHEN org.owner_id=auth.uid() THEN 'owner' ELSE (SELECT role FROM licensing_private.memberships WHERE organization_id=org.id AND user_id=auth.uid() AND revoked_at IS NULL) END;
 RETURN jsonb_build_object('institution_id',institution,'name',org.name,'license_id',org.license_id,'role',COALESCE(role_name,'consultant'),'permissions',(SELECT jsonb_object_agg(module,jsonb_build_object('read',licensing.workspace_can(org.id,module,false),'write',licensing.workspace_can(org.id,module,true))) FROM unnest(ARRAY['areas','maps','inventory','operations','maintenance','monitoring','recommendations','rainfall','precision']) module));
END $$;
REVOKE ALL ON FUNCTION licensing.operational_context() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.operational_context() TO authenticated;
COMMIT;
