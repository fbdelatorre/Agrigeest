-- Exclusivo do piloto local. A instalação altera funções, nunca empresas existentes.
BEGIN;
DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;
CREATE TABLE IF NOT EXISTS licensing_private.company_provisioning(
 transaction_id bigint NOT NULL,actor_id uuid NOT NULL,institution_id uuid PRIMARY KEY);
ALTER TABLE licensing_private.company_provisioning ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing_private.company_provisioning FROM PUBLIC,anon,authenticated,service_role;

-- Bloqueia a organização antes de ler sua licença: uma troca não pode usar
-- cotas ou vínculos lidos antes da troca em convites/alterações concorrentes.
CREATE OR REPLACE FUNCTION licensing_private.lock_company(p_org uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM licensing_private.organizations WHERE id=p_org FOR SHARE;
END $$;
CREATE OR REPLACE FUNCTION licensing_private.lock_actor_companies() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM licensing_private.organizations o WHERE o.owner_id=auth.uid()
 OR EXISTS(SELECT 1 FROM licensing_private.memberships m WHERE m.organization_id=o.id AND m.user_id=auth.uid() AND m.revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM licensing_private.operational_enrollments e WHERE e.organization_id=o.id AND e.institution_id::text=COALESCE(
 NULLIF(COALESCE(NULLIF(current_setting('request.headers',true),'')::jsonb,'{}')->>'x-agrigest-institution-id',''),
 (SELECT institution_id::text FROM public.user_profiles WHERE id=auth.uid())))
 ORDER BY o.id FOR SHARE OF o;
END $$;
DO $$ DECLARE fn record; definition text; addition text; patched integer:=0;BEGIN
 FOR fn IN SELECT p.oid,p.proname,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE
 (n.nspname='licensing' AND p.proname IN ('workspace_invite','workspace_update_member','workspace_remove_member','workspace_revoke_invite','workspace_revoke_consultant','workspace_accept'))
 OR (n.nspname='licensing_private' AND p.proname='guard_operational_row') LOOP
  patched:=patched+1;definition:=pg_get_functiondef(fn.oid);
  IF position('company_binding_lock_v1' IN definition)>0 THEN CONTINUE;END IF;
  IF fn.proname='workspace_accept' THEN
   addition:='PERFORM 1 FROM licensing_private.organizations WHERE id IN (SELECT organization_id FROM licensing_private.team_invitations WHERE id=p_invite UNION SELECT consultancy_id FROM licensing_private.team_invitations WHERE id=p_invite) ORDER BY id FOR SHARE;';
  ELSIF fn.proname='guard_operational_row' THEN
   addition:='IF TG_TABLE_NAME=''institutions'' AND TG_OP=''INSERT'' THEN IF EXISTS(SELECT 1 FROM licensing_private.company_provisioning WHERE transaction_id=txid_current() AND actor_id=auth.uid() AND institution_id=NEW.id) THEN RETURN NEW;END IF;END IF; PERFORM licensing_private.lock_actor_companies();';
  ELSE addition:='PERFORM licensing_private.lock_company(p_org);';END IF;
  definition:=regexp_replace(definition,'\mBEGIN\M','BEGIN /* company_binding_lock_v1 */ '||addition,'i');
  EXECUTE definition;
 END LOOP;
 IF patched<>7 THEN RAISE EXCEPTION 'EXPECTED_COMPANY_GUARDS_REQUIRED';END IF;
END $$;

CREATE OR REPLACE FUNCTION licensing_private.paid_company_ready(p_license uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM licensing.licenses l JOIN licensing.provider_payments p ON p.license_id=l.id AND p.environment='sandbox'
 JOIN licensing_private.billing_contracts b ON b.environment=p.environment AND b.subscription_id=p.subscription_id AND b.license_id=l.id AND b.customer_id=p.customer_id
 WHERE l.id=p_license AND l.test_mode AND NOT l.complimentary AND l.amount_minor>0 AND licensing_private.license_live(l.id)
 AND b.request_id=l.billing_checkout_id AND p.eligible AND NOT p.has_refund AND p.paid_on IS NOT NULL
 AND p.status IN ('RECEIVED','CONFIRMED','DUNNING_RECEIVED') AND (p.due_on::timestamp AT TIME ZONE 'America/Sao_Paulo')<=now() AND p.coverage_until>now());
$$;
CREATE OR REPLACE FUNCTION licensing.operational_company_choices() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_pilot_billing();
 RETURN jsonb_build_object('licenses',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'name',l.label,'kind',l.kind,'version',l.updated_at,'ready',licensing_private.paid_company_ready(l.id),'users_limit',4+l.extras) ORDER BY l.label,l.id)
 FROM licensing.licenses l WHERE l.owner_id=auth.uid() AND l.test_mode AND NOT l.complimentary AND NOT EXISTS(SELECT 1 FROM licensing_private.organizations o WHERE o.license_id=l.id)),'[]'),
 'companies',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'kind',o.kind,'license_id',l.id,'version',l.updated_at,'replaceable',l.complimentary AND NOT EXISTS(SELECT 1 FROM licensing_private.billing_contracts b WHERE b.license_id=l.id),'users_used',1+licensing_private.team_used(o.id)) ORDER BY o.name,o.id)
 FROM licensing_private.organizations o JOIN licensing.licenses l ON l.id=o.license_id WHERE o.owner_id=auth.uid() AND l.owner_id=auth.uid() AND l.test_mode),'[]'));
END $$;

CREATE OR REPLACE FUNCTION licensing.operational_bind_license(p_license uuid,p_license_version timestamptz,p_organization uuid,p_previous_license uuid,p_previous_version timestamptz,p_name text,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<bind_op>>
DECLARE l licensing.licenses;old licensing.licenses;o licensing_private.organizations;result uuid;institution uuid;device_cap integer;BEGIN
 PERFORM licensing_private.require_pilot_billing();
 IF p_organization IS NOT NULL THEN
  SELECT * INTO o FROM licensing_private.organizations WHERE id=p_organization FOR UPDATE;
  IF NOT FOUND OR o.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'COMPANY_OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 END IF;
 PERFORM 1 FROM licensing.licenses WHERE id IN (p_license,p_previous_license) ORDER BY id FOR UPDATE;
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license;
 IF NOT FOUND OR l.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('bind_paid_company',p_license,p_license_version,p_organization,p_previous_license,p_previous_version,p_name)) THEN
  SELECT r.result INTO result FROM licensing_private.requests r WHERE r.id=p_request;RETURN result;
 END IF;
 IF l.updated_at IS DISTINCT FROM p_license_version THEN RAISE EXCEPTION 'PLAN_VERSION_CHANGED';END IF;
 IF NOT licensing_private.paid_company_ready(l.id) THEN RAISE EXCEPTION 'VERIFIED_PAYMENT_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM licensing_private.organizations WHERE license_id=l.id) THEN RAISE EXCEPTION 'LICENSE_ALREADY_LINKED';END IF;
 IF p_organization IS NOT NULL THEN
  SELECT * INTO old FROM licensing.licenses WHERE id=o.license_id;
  IF o.license_id IS DISTINCT FROM p_previous_license OR old.updated_at IS DISTINCT FROM p_previous_version THEN RAISE EXCEPTION 'PLAN_VERSION_CHANGED';END IF;
  IF old.owner_id IS DISTINCT FROM auth.uid() OR NOT old.test_mode OR NOT old.complimentary OR EXISTS(SELECT 1 FROM licensing_private.billing_contracts WHERE license_id=old.id) THEN RAISE EXCEPTION 'COMPLIMENTARY_REPLACEMENT_ONLY';END IF;
  IF o.kind IS DISTINCT FROM l.kind THEN RAISE EXCEPTION 'COMPANY_KIND_MISMATCH';END IF;
  IF licensing_private.team_used(o.id)>licensing_private.team_limit(l.id) THEN RAISE EXCEPTION 'TEAM_CAPACITY_IN_USE';END IF;
  device_cap:=(CASE WHEN l.kind='farm' THEN 6 ELSE 5 END)+2*least(l.extras,COALESCE((SELECT min(target_extras) FROM licensing_private.subscription_changes WHERE license_id=l.id AND action='extras' AND state IN ('pending','processing','failed','review','scheduled')),l.extras));
  IF (SELECT count(*) FROM licensing_private.devices WHERE license_id=l.id AND revoked_at IS NULL)>device_cap THEN RAISE EXCEPTION 'DEVICE_CAPACITY_IN_USE';END IF;
  -- Só a referência de licença muda. Identidade, nome, equipe, convites,
  -- delegações, talhões e todos os lançamentos permanecem na mesma empresa.
  UPDATE licensing_private.organizations SET license_id=l.id WHERE id=o.id;
  UPDATE licensing.licenses SET status='cancelled',updated_at=clock_timestamp() WHERE id=old.id;
  UPDATE licensing_private.devices SET revoked_at=clock_timestamp() WHERE license_id=old.id AND revoked_at IS NULL;
  UPDATE licensing_private.device_requests SET state='rejected',reviewed_at=clock_timestamp(),reviewed_by=auth.uid(),version=gen_random_uuid() WHERE license_id=old.id AND state='pending';
  INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(old.id,auth.uid(),'courtesy_replaced',jsonb_build_object('organization_id',o.id,'new_license',l.id,'devices_require_approval',true));
  result:=o.id;
 ELSE
  IF p_previous_license IS NOT NULL OR p_previous_version IS NOT NULL THEN RAISE EXCEPTION 'INVALID_COMPANY_SELECTION';END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'INVALID_COMPANY_NAME';END IF;
  result:=gen_random_uuid();
  IF l.kind='farm' THEN
   institution:=gen_random_uuid();
   INSERT INTO licensing_private.company_provisioning(transaction_id,actor_id,institution_id) VALUES(txid_current(),auth.uid(),institution);
   INSERT INTO public.institutions(id,name,created_by) VALUES(institution,btrim(p_name),auth.uid());
   DELETE FROM licensing_private.company_provisioning WHERE institution_id=bind_op.institution;
  END IF;
  INSERT INTO licensing_private.organizations(id,license_id,name,kind,owner_id,operational_institution_id) VALUES(result,l.id,btrim(p_name),l.kind,auth.uid(),institution);
  IF institution IS NOT NULL THEN INSERT INTO licensing_private.operational_enrollments(institution_id,organization_id,enforce) VALUES(institution,result,true);END IF;
 END IF;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(l.id,auth.uid(),'paid_company_linked',jsonb_build_object('organization_id',result,'previous_license',p_previous_license,'new_company',p_organization IS NULL));
 UPDATE licensing_private.requests r SET result=bind_op.result WHERE r.id=p_request;
 RETURN result;
END $$;

-- O protótipo antigo não pode reservar uma licença paga sem este fluxo validado.
DO $$ BEGIN IF to_regprocedure('licensing_private.workspace_initialize_before_paid_company(uuid,uuid)') IS NULL THEN
 ALTER FUNCTION licensing.workspace_initialize(uuid,uuid) RENAME TO workspace_initialize_before_paid_company;
 ALTER FUNCTION licensing.workspace_initialize_before_paid_company(uuid,uuid) SET SCHEMA licensing_private;
 REVOKE ALL ON FUNCTION licensing_private.workspace_initialize_before_paid_company(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
END IF;END $$;
CREATE OR REPLACE FUNCTION licensing.workspace_initialize(p_license uuid,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_pilot_billing();
 PERFORM 1 FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF EXISTS(SELECT 1 FROM licensing.licenses WHERE id=p_license AND owner_id=auth.uid() AND NOT complimentary) THEN RAISE EXCEPTION 'USE_PAID_COMPANY_SETUP';END IF;
 RETURN licensing_private.workspace_initialize_before_paid_company(p_license,p_request);
END $$;
CREATE OR REPLACE FUNCTION licensing.owner_license_action(p_id uuid,p_action text,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_pilot_billing(p_id);
 PERFORM 1 FROM licensing.licenses WHERE id=p_id FOR UPDATE;
 IF p_action='request_reactivation' AND EXISTS(SELECT 1 FROM licensing.events e JOIN licensing.licenses l ON l.id=e.license_id WHERE l.id=p_id AND l.owner_id=auth.uid() AND e.action='courtesy_replaced') THEN RAISE EXCEPTION 'LICENSE_SUPERSEDED';END IF;
 PERFORM licensing_private.owner_license_action_before_pilot_billing(p_id,p_action,p_request);
END $$;
CREATE OR REPLACE FUNCTION licensing.operational_plans() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 PERFORM licensing_private.team_actor();
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'name',l.label,'kind',l.kind,'period',l.period,'status',l.status,'active',licensing_private.license_live(l.id),'version',l.updated_at,'owner',l.owner_id=auth.uid(),'complimentary',l.complimentary,'valid_until',l.valid_until,'extras',l.extras,
  'superseded',EXISTS(SELECT 1 FROM licensing.events WHERE license_id=l.id AND action='courtesy_replaced'),
  'amount_minor',CASE WHEN l.owner_id=auth.uid() THEN l.amount_minor ELSE NULL END,
  'users_used',CASE WHEN o.id IS NOT NULL THEN 1+licensing_private.team_used(o.id) ELSE 1 END,'users_limit',4+l.extras,
  'devices_used',(SELECT count(*) FROM licensing_private.devices d WHERE d.license_id=l.id AND d.revoked_at IS NULL),'devices_limit',(CASE WHEN l.kind='farm' THEN 6 ELSE 5 END)+2*l.extras,
  'local_action_available',l.owner_id=auth.uid() AND l.test_mode AND l.complimentary AND NOT EXISTS(SELECT 1 FROM licensing.events WHERE license_id=l.id AND action='courtesy_replaced')) ORDER BY l.label,l.id),'[]') INTO result
 FROM licensing.licenses l LEFT JOIN licensing_private.organizations o ON o.license_id=l.id
 WHERE l.test_mode AND (l.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM licensing_private.memberships m WHERE m.organization_id=o.id AND m.user_id=auth.uid() AND m.revoked_at IS NULL));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION licensing_private.lock_company(uuid),licensing_private.lock_actor_companies(),licensing_private.paid_company_ready(uuid),licensing.operational_company_choices(),licensing.operational_bind_license(uuid,timestamptz,uuid,uuid,timestamptz,text,uuid),licensing.workspace_initialize(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.operational_company_choices(),licensing.operational_bind_license(uuid,timestamptz,uuid,uuid,timestamptz,text,uuid),licensing.workspace_initialize(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
