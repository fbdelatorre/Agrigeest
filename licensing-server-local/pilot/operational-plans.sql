-- Plano e licenças exclusivamente no piloto. Cobranças e licenças comerciais
-- não podem ser alteradas por este fluxo local de cortesia.
BEGIN;
DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION licensing.operational_plans() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 PERFORM licensing_private.team_actor();
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'name',l.label,'kind',l.kind,'period',l.period,'status',l.status,'active',licensing_private.license_live(l.id),'version',l.updated_at,'owner',l.owner_id=auth.uid(),'complimentary',l.complimentary,'valid_until',l.valid_until,'extras',l.extras,
  'amount_minor',CASE WHEN l.owner_id=auth.uid() THEN l.amount_minor ELSE NULL END,
  'users_used',CASE WHEN o.id IS NOT NULL THEN 1+licensing_private.team_used(o.id) ELSE 1 END,'users_limit',4+l.extras,
  'devices_used',(SELECT count(*) FROM licensing_private.devices d WHERE d.license_id=l.id AND d.revoked_at IS NULL),'devices_limit',(CASE WHEN l.kind='farm' THEN 6 ELSE 5 END)+2*l.extras,
  'local_action_available',l.owner_id=auth.uid() AND l.test_mode AND l.complimentary) ORDER BY l.label,l.id),'[]') INTO result
 FROM licensing.licenses l LEFT JOIN licensing_private.organizations o ON o.license_id=l.id
 WHERE l.test_mode AND (l.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM licensing_private.memberships m WHERE m.organization_id=o.id AND m.user_id=auth.uid() AND m.revoked_at IS NULL));
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION licensing.operational_plan_action(p_license uuid,p_action text,p_version timestamptz,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses;previous licensing_private.requests;BEGIN
 IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;
 PERFORM licensing_private.team_actor();SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND OR l.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT l.test_mode OR NOT l.complimentary THEN RAISE EXCEPTION 'PILOT_COMPLIMENTARY_ONLY';END IF;
 IF p_action IS NULL OR p_action NOT IN ('cancel','request_reactivation') OR p_request IS NULL THEN RAISE EXCEPTION 'INVALID_PLAN_ACTION';END IF;
 SELECT * INTO previous FROM licensing_private.requests WHERE id=p_request;
 IF FOUND THEN
  IF previous.actor_id IS DISTINCT FROM auth.uid() OR previous.payload IS DISTINCT FROM jsonb_build_array('owner_action',p_license,p_action) THEN RAISE EXCEPTION 'REQUEST_CONFLICT';END IF;
  RETURN;
 END IF;
 IF p_version IS DISTINCT FROM l.updated_at THEN RAISE EXCEPTION 'PLAN_VERSION_CHANGED';END IF;
 IF (p_action='cancel' AND l.status NOT IN ('active','reactivation_requested')) OR (p_action='request_reactivation' AND l.status<>'cancelled') THEN RAISE EXCEPTION 'PLAN_ACTION_UNAVAILABLE';END IF;
 PERFORM licensing.owner_license_action(p_license,p_action,p_request);
END $$;
REVOKE ALL ON FUNCTION licensing.operational_plans(),licensing.operational_plan_action(uuid,text,timestamptz,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.operational_plans(),licensing.operational_plan_action(uuid,text,timestamptz,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
