BEGIN;
DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;
-- Mantém a conta privada e MFA, acrescentando validação de sessão viva a todas
-- as políticas e RPCs administrativas já existentes neste piloto.
CREATE OR REPLACE FUNCTION licensing.is_platform_admin() RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 BEGIN PERFORM licensing_private.team_actor();EXCEPTION WHEN insufficient_privilege THEN RETURN false;END;
 RETURN EXISTS(SELECT 1 FROM licensing_private.platform_admins a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND (NOT a.require_mfa OR (auth.jwt()->>'aal'='aal2' AND EXISTS(SELECT 1 FROM auth.mfa_factors f WHERE f.user_id=u.id AND f.status='verified'))));
END $$;
CREATE OR REPLACE FUNCTION licensing.manager_access() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 BEGIN PERFORM licensing_private.team_actor();EXCEPTION WHEN insufficient_privilege THEN RETURN jsonb_build_object('authorized',false,'can_manage',false);END;
 RETURN jsonb_build_object('authorized',EXISTS(SELECT 1 FROM licensing_private.platform_admins a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=auth.uid() AND u.deleted_at IS NULL),'can_manage',licensing.is_platform_admin());
END $$;
CREATE OR REPLACE FUNCTION licensing.admin_pending_reactivations() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 PERFORM licensing_private.require_admin();
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'name',l.label,'owner_email',u.email,'kind',l.kind,'version',l.updated_at,'valid_until',l.valid_until,'complimentary',l.complimentary) ORDER BY l.updated_at,l.id),'[]') INTO result
 FROM licensing.licenses l JOIN auth.users u ON u.id=l.owner_id WHERE l.test_mode AND l.status='reactivation_requested';RETURN result;
END $$;
CREATE OR REPLACE FUNCTION licensing.admin_approve_reactivation(p_license uuid,p_version timestamptz,p_reason text,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses;actor uuid;BEGIN
 IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;
 actor:=licensing_private.require_admin();SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND';END IF;
 IF NOT l.test_mode OR NOT l.complimentary THEN RAISE EXCEPTION 'COMPLIMENTARY_REACTIVATION_REQUIRED';END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'REASON_REQUIRED';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('approve_local_reactivation',p_license,p_version,btrim(p_reason))) THEN RETURN;END IF;
 IF l.status<>'reactivation_requested' OR l.updated_at IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'REACTIVATION_CHANGED';END IF;
 IF l.valid_until IS NOT NULL AND l.valid_until<=now() THEN RAISE EXCEPTION 'REACTIVATION_VALIDITY_EXPIRED';END IF;
 UPDATE licensing.licenses SET status='active',updated_at=now() WHERE id=l.id;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(l.id,actor,'reactivation_approved',jsonb_build_object('reason',btrim(p_reason),'previous_status',l.status,'previous_version',l.updated_at,'complimentary',true,'local_only',true));
END $$;
REVOKE ALL ON FUNCTION licensing.admin_pending_reactivations(),licensing.admin_approve_reactivation(uuid,timestamptz,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.admin_pending_reactivations(),licensing.admin_approve_reactivation(uuid,timestamptz,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
