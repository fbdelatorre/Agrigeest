-- Apenas na cópia piloto local; nenhuma tabela operacional é alterada.
BEGIN;
DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION licensing.operational_offline_authorization(p_license uuid,p_installation uuid,p_secret text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid;farm licensing_private.organizations;source licensing_private.organizations;role_name text;consulting boolean;expires timestamptz;permissions jsonb;BEGIN
 PERFORM licensing_private.require_pilot_billing();institution:=licensing.current_institution();
 SELECT o.* INTO farm FROM licensing_private.organizations o JOIN licensing_private.operational_enrollments e ON e.organization_id=o.id WHERE e.institution_id=institution AND e.enforce;
 IF farm.id IS NULL OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(licensing.operational_device_licenses()) v WHERE v->>'license_id'=p_license::text) THEN RAISE EXCEPTION 'FARM_ACCESS_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT licensing.device_access(p_license,p_installation,p_secret) OR NOT licensing_private.license_live(farm.license_id) THEN RAISE EXCEPTION 'OFFLINE_DEVICE_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO source FROM licensing_private.organizations WHERE license_id=p_license;
 IF source.id IS NULL OR licensing_private.team_used(source.id)>licensing_private.team_limit(p_license) THEN RAISE EXCEPTION 'OFFLINE_CAPACITY_REQUIRED' USING ERRCODE='42501';END IF;
 consulting:=source.id<>farm.id;
 role_name:=CASE WHEN source.owner_id=auth.uid() THEN CASE WHEN consulting THEN 'consultant' ELSE 'owner' END ELSE (SELECT role FROM licensing_private.memberships WHERE organization_id=source.id AND user_id=auth.uid() AND revoked_at IS NULL) END;
 IF role_name IS NULL THEN RAISE EXCEPTION 'TEAM_SESSION_REQUIRED' USING ERRCODE='42501';END IF;
 expires:=least(now()+interval '7 days',(SELECT valid_until FROM licensing.licenses WHERE id=farm.license_id),(SELECT valid_until FROM licensing.licenses WHERE id=p_license));
 SELECT jsonb_object_agg(module,jsonb_build_object('read',CASE WHEN role_name='field_monitor' THEN module IN ('areas','monitoring','rainfall') ELSE module IN ('areas','monitoring','recommendations','rainfall') END,
 'write',CASE WHEN role_name='field_monitor' THEN module IN ('monitoring','rainfall') ELSE module IN ('monitoring','recommendations','rainfall') END)) INTO permissions
 FROM unnest(ARRAY['areas','maps','inventory','operations','maintenance','monitoring','recommendations','rainfall','precision']) module;
 RETURN jsonb_build_object('version',1,'aud','agrigest-local-pilot-offline','sub',auth.uid(),'session_id',auth.jwt()->>'session_id','installation',p_installation,'proof_hash',encode(sha256(convert_to(p_secret,'UTF8')),'hex'),
 'source_license',p_license,'institution_id',institution,'name',farm.name,'license_id',farm.license_id,'role',role_name,'permissions',permissions,'issued_at',extract(epoch FROM now())::bigint,'expires_at',floor(extract(epoch FROM expires))::bigint);
END $$;
REVOKE ALL ON FUNCTION licensing.operational_offline_authorization(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.operational_offline_authorization(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
