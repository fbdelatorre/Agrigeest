-- Evolucao exclusiva do laboratorio ficticio; nunca aplicar em producao.
DO $$ BEGIN
 IF current_setting('agrigest.licensing_sandbox',true) IS DISTINCT FROM 'synthetic-only-v1' THEN RAISE EXCEPTION 'SANDBOX_MARKER_REQUIRED'; END IF;
END $$;
CREATE TABLE license_lab.companies(user_id uuid PRIMARY KEY REFERENCES license_lab.people(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 150));
CREATE TABLE license_lab.subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),farm_id uuid UNIQUE REFERENCES license_lab.farms(id),consultant_id uuid UNIQUE REFERENCES license_lab.companies(user_id),
 owner_id uuid NOT NULL REFERENCES license_lab.people(id),status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
 period text NOT NULL DEFAULT 'monthly' CHECK(period IN ('monthly','annual')),extras integer NOT NULL DEFAULT 0 CHECK(extras BETWEEN 0 AND 100),
 complimentary boolean NOT NULL DEFAULT false,free_until timestamptz,CHECK((farm_id IS NULL)<>(consultant_id IS NULL)));
CREATE TABLE license_lab.devices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES license_lab.subscriptions(id),user_id uuid NOT NULL REFERENCES license_lab.people(id),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),active boolean NOT NULL DEFAULT true);
CREATE UNIQUE INDEX device_active_name ON license_lab.devices(subscription_id,user_id,lower(btrim(name))) WHERE active;
CREATE TABLE license_lab.requests(id uuid PRIMARY KEY,actor_id uuid NOT NULL,payload jsonb NOT NULL);
CREATE TABLE license_lab.platform_admins(user_id uuid PRIMARY KEY REFERENCES license_lab.people(id));
CREATE TABLE license_lab.license_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),subscription_id uuid NOT NULL REFERENCES license_lab.subscriptions(id),actor_id uuid NOT NULL,action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE license_lab.mailbox(id uuid PRIMARY KEY REFERENCES license_lab.invitations(id),created_by uuid NOT NULL,recipient_email text NOT NULL,token text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE license_lab.invitations ALTER COLUMN recipient_id DROP NOT NULL;
ALTER TABLE license_lab.invitations ADD COLUMN email text;
UPDATE license_lab.invitations i SET email=p.email FROM license_lab.people p WHERE p.id=i.recipient_id;
ALTER TABLE license_lab.invitations ALTER COLUMN email SET NOT NULL;
ALTER TABLE license_lab.invitations ADD COLUMN token_hash text;
CREATE UNIQUE INDEX people_email_normalized ON license_lab.people(lower(btrim(email)));
INSERT INTO license_lab.companies VALUES('00000000-0000-4000-8000-000000000006','Consultoria Cedro ficticia'),('00000000-0000-4000-8000-000000000007','Consultoria Gabriel ficticia');
INSERT INTO license_lab.subscriptions(id,farm_id,owner_id) SELECT id,id,owner_id FROM license_lab.farms;
INSERT INTO license_lab.subscriptions(id,consultant_id,owner_id) SELECT gen_random_uuid(),user_id,user_id FROM license_lab.companies;
INSERT INTO license_lab.people VALUES('00000000-0000-4000-8000-000000000008','Helena · gestora do aplicativo','helena@example.test');
INSERT INTO license_lab.platform_admins VALUES('00000000-0000-4000-8000-000000000008');

CREATE FUNCTION license_lab.platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM license_lab.platform_admins WHERE user_id=license_lab.actor()) $$;
CREATE FUNCTION license_lab.entitled(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE((SELECT status='active' AND (NOT complimentary OR free_until IS NULL OR free_until>now()) FROM license_lab.subscriptions WHERE id=p_id),false)
$$;
CREATE FUNCTION license_lab.writable(p_farm uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT license_lab.entitled(p_farm) AND license_lab.role_at(p_farm) IS NOT NULL AND
 (license_lab.role_at(p_farm)<>'consultant' OR EXISTS(SELECT 1 FROM license_lab.subscriptions WHERE consultant_id=license_lab.actor() AND license_lab.entitled(id)))
$$;
CREATE FUNCTION license_lab.guard_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f uuid; BEGIN
 f:=CASE WHEN TG_OP='DELETE' THEN OLD.farm_id ELSE NEW.farm_id END;
 PERFORM 1 FROM license_lab.subscriptions WHERE id=f FOR UPDATE;
 IF NOT license_lab.writable(f) THEN RAISE EXCEPTION 'READ_ONLY_LICENSE' USING ERRCODE='42501'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['reports','rainfall','recommendations','products','applications'] LOOP
  EXECUTE format('CREATE TRIGGER license_write BEFORE INSERT OR UPDATE OR DELETE ON license_lab.%I FOR EACH ROW EXECUTE FUNCTION license_lab.guard_write()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['reports','rainfall','recommendations'] LOOP
  EXECUTE format('CREATE POLICY license_insert ON license_lab.%I AS RESTRICTIVE FOR INSERT WITH CHECK(license_lab.writable(farm_id))',t);
  EXECUTE format('CREATE POLICY license_update ON license_lab.%I AS RESTRICTIVE FOR UPDATE USING(license_lab.writable(farm_id)) WITH CHECK(license_lab.writable(farm_id))',t);
  EXECUTE format('CREATE POLICY license_delete ON license_lab.%I AS RESTRICTIVE FOR DELETE USING(license_lab.writable(farm_id))',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['companies','subscriptions','devices','requests','platform_admins','license_events','mailbox'] LOOP
  EXECUTE format('ALTER TABLE license_lab.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
CREATE POLICY own_company ON license_lab.companies FOR SELECT USING(user_id=license_lab.actor());
CREATE POLICY own_plan ON license_lab.subscriptions FOR SELECT USING(owner_id=license_lab.actor());
CREATE POLICY own_devices ON license_lab.devices FOR SELECT USING(EXISTS(SELECT 1 FROM license_lab.subscriptions s WHERE s.id=subscription_id AND s.owner_id=license_lab.actor()));
CREATE POLICY own_license_events ON license_lab.license_events FOR SELECT USING(license_lab.platform_admin() OR EXISTS(SELECT 1 FROM license_lab.subscriptions s WHERE s.id=subscription_id AND s.owner_id=license_lab.actor()));
CREATE POLICY own_mailbox ON license_lab.mailbox FOR SELECT USING(created_by=license_lab.actor());
GRANT SELECT ON license_lab.companies,license_lab.subscriptions,license_lab.devices,license_lab.license_events,license_lab.mailbox TO license_lab_client;

CREATE FUNCTION license_lab.seat_usage(p_farm uuid,p_exclude uuid DEFAULT NULL) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT count(*) FROM license_lab.memberships WHERE farm_id=p_farm AND active AND role<>'consultant')::integer+
 (SELECT count(*) FROM license_lab.invitations WHERE farm_id=p_farm AND role<>'consultant' AND status='pending' AND expires_at>now() AND (p_exclude IS NULL OR id<>p_exclude))::integer
$$;
CREATE FUNCTION license_lab.request_once(p_id uuid,p_payload jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous license_lab.requests; BEGIN
 IF p_id IS NULL OR license_lab.actor() IS NULL THEN RAISE EXCEPTION 'INVALID_REQUEST'; END IF;
 INSERT INTO license_lab.requests VALUES(p_id,license_lab.actor(),p_payload) ON CONFLICT DO NOTHING;
 IF FOUND THEN RETURN true; END IF;
 SELECT * INTO previous FROM license_lab.requests WHERE id=p_id;
 IF previous.actor_id IS DISTINCT FROM license_lab.actor() OR previous.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
 RETURN false;
END $$;
CREATE OR REPLACE FUNCTION license_lab.invite(p_farm uuid,p_email text,p_role text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient uuid; result uuid; token text; extra integer; BEGIN
 PERFORM 1 FROM license_lab.farms WHERE id=p_farm FOR UPDATE;
 IF license_lab.role_at(p_farm) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT extras INTO extra FROM license_lab.subscriptions WHERE id=p_farm FOR UPDATE;
 IF NOT license_lab.writable(p_farm) THEN RAISE EXCEPTION 'READ_ONLY_LICENSE'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('admin','operator','monitor','consultant') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
 IF p_email IS NULL OR lower(btrim(p_email)) !~ '^[a-z0-9.!#$%&*+/=?^_`{|}~-]+@example[.]test$' THEN RAISE EXCEPTION 'TEST_EMAIL_REQUIRED'; END IF;
 SELECT id INTO recipient FROM license_lab.people WHERE lower(btrim(email))=lower(btrim(p_email));
 IF p_role='consultant' AND (recipient IS NULL OR NOT EXISTS(SELECT 1 FROM license_lab.companies WHERE user_id=recipient)) THEN RAISE EXCEPTION 'CONSULTANT_COMPANY_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM license_lab.memberships WHERE farm_id=p_farm AND user_id=recipient AND active) THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
 IF EXISTS(SELECT 1 FROM license_lab.invitations WHERE farm_id=p_farm AND email=lower(btrim(p_email)) AND status='pending' AND expires_at>now()) THEN RAISE EXCEPTION 'INVITATION_PENDING'; END IF;
 IF p_role<>'consultant' AND license_lab.seat_usage(p_farm)>=4+extra THEN RAISE EXCEPTION 'SEAT_LIMIT'; END IF;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 INSERT INTO license_lab.invitations(farm_id,recipient_id,email,role,created_by,token_hash)
 VALUES(p_farm,recipient,lower(btrim(p_email)),p_role,license_lab.actor(),encode(sha256(convert_to(token,'UTF8')),'hex')) RETURNING id INTO result;
 INSERT INTO license_lab.mailbox(id,created_by,recipient_email,token) VALUES(result,license_lab.actor(),lower(btrim(p_email)),token);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION license_lab.accept_invitation(p_invitation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation license_lab.invitations; extra integer; BEGIN
 -- Read target, then consistently lock farm -> subscription -> invitation.
 SELECT * INTO invitation FROM license_lab.invitations WHERE id=p_invitation;
 IF NOT FOUND OR license_lab.actor() IS NULL OR NOT EXISTS(SELECT 1 FROM license_lab.people WHERE id=license_lab.actor() AND lower(email)=invitation.email) OR (invitation.recipient_id IS NOT NULL AND invitation.recipient_id IS DISTINCT FROM license_lab.actor()) THEN RAISE EXCEPTION 'INVITATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM license_lab.farms WHERE id=invitation.farm_id FOR UPDATE;
 SELECT extras INTO extra FROM license_lab.subscriptions WHERE id=invitation.farm_id FOR UPDATE;
 SELECT * INTO invitation FROM license_lab.invitations WHERE id=p_invitation FOR UPDATE;
 IF invitation.status<>'pending' OR invitation.expires_at<=now() THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE'; END IF;
 IF NOT license_lab.entitled(invitation.farm_id) THEN RAISE EXCEPTION 'READ_ONLY_LICENSE'; END IF;
 IF invitation.role='consultant' AND NOT EXISTS(SELECT 1 FROM license_lab.subscriptions WHERE consultant_id=license_lab.actor() AND license_lab.entitled(id)) THEN RAISE EXCEPTION 'CONSULTANT_LICENSE_REQUIRED'; END IF;
 IF invitation.role<>'consultant' AND license_lab.seat_usage(invitation.farm_id,invitation.id)>=4+extra THEN RAISE EXCEPTION 'SEAT_LIMIT'; END IF;
 IF license_lab.role_at(invitation.farm_id) IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
 INSERT INTO license_lab.memberships(farm_id,user_id,role,active) VALUES(invitation.farm_id,license_lab.actor(),invitation.role,true)
 ON CONFLICT(farm_id,user_id) DO UPDATE SET role=EXCLUDED.role,active=true;
 UPDATE license_lab.invitations SET status='accepted',recipient_id=license_lab.actor(),token_hash=NULL WHERE id=invitation.id;
END $$;
CREATE FUNCTION license_lab.preview_invite(p_token text) RETURNS TABLE(email text,farm_name text,role text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT i.email,f.name,i.role FROM license_lab.invitations i JOIN license_lab.farms f ON f.id=i.farm_id
 WHERE i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') AND i.status='pending' AND i.expires_at>now()
$$;
CREATE FUNCTION license_lab.register_demo(p_name text,p_email text,p_verified boolean,p_token text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; invitation license_lab.invitations; BEGIN
 IF p_verified IS DISTINCT FROM true THEN RAISE EXCEPTION 'EMAIL_VERIFICATION_REQUIRED'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
 IF p_email IS NULL OR lower(btrim(p_email)) !~ '^[a-z0-9.!#$%&*+/=?^_`{|}~-]+@example[.]test$' THEN RAISE EXCEPTION 'TEST_EMAIL_REQUIRED'; END IF;
 IF p_token IS NOT NULL THEN
  SELECT * INTO invitation FROM license_lab.invitations WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  IF NOT FOUND OR invitation.status<>'pending' OR invitation.expires_at<=now() THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE'; END IF;
  IF invitation.email<>lower(btrim(p_email)) THEN RAISE EXCEPTION 'INVITATION_FORBIDDEN'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM license_lab.people WHERE lower(email)=lower(btrim(p_email))) THEN RAISE EXCEPTION 'ACCOUNT_EXISTS_USE_LOGIN'; END IF;
 INSERT INTO license_lab.people VALUES(gen_random_uuid(),btrim(p_name),lower(btrim(p_email))) RETURNING id INTO result;
 IF p_token IS NOT NULL THEN
  PERFORM set_config('license_lab.actor',result::text,true);
  PERFORM license_lab.accept_invitation(invitation.id);
 END IF;
 RETURN result;
END $$;
-- Linking a separately registered, verified demo account uses stored email, never a supplied role/farm.
CREATE FUNCTION license_lab.claim_demo(p_token text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation license_lab.invitations; target text; BEGIN
 SELECT email INTO target FROM license_lab.people WHERE id=license_lab.actor();
 SELECT * INTO invitation FROM license_lab.invitations WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 IF NOT FOUND OR target IS NULL OR invitation.email<>lower(target) THEN RAISE EXCEPTION 'INVITATION_FORBIDDEN'; END IF;
 PERFORM license_lab.accept_invitation(invitation.id);
END $$;
CREATE FUNCTION license_lab.inbox_v2() RETURNS TABLE(id uuid,farm_name text,role text,status text,expires_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT i.id,f.name,i.role,i.status,i.expires_at FROM license_lab.invitations i JOIN license_lab.farms f ON f.id=i.farm_id
 JOIN license_lab.people p ON p.id=license_lab.actor() WHERE i.recipient_id=p.id OR (i.recipient_id IS NULL AND i.email=lower(p.email))
$$;
CREATE FUNCTION license_lab.plan_change(p_id uuid,p_action text,p_devices uuid[],p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s license_lab.subscriptions; next_extra integer; BEGIN
 SELECT * INTO s FROM license_lab.subscriptions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.owner_id IS DISTINCT FROM license_lab.actor() THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
 IF NOT license_lab.request_once(p_request,jsonb_build_array(p_id,p_action,p_devices)) THEN RETURN; END IF;
 IF p_action IN ('buy_extra','cancel_extra') THEN
  IF NOT license_lab.entitled(p_id) THEN RAISE EXCEPTION 'READ_ONLY_LICENSE'; END IF;
  next_extra:=s.extras+CASE WHEN p_action='buy_extra' THEN 1 ELSE -1 END;
  IF next_extra NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'EXTRA_LIMIT'; END IF;
  IF s.farm_id IS NOT NULL AND license_lab.seat_usage(s.farm_id)>4+next_extra THEN RAISE EXCEPTION 'SEAT_LIMIT'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(COALESCE(p_devices,'{}'::uuid[])) d WHERE NOT EXISTS(SELECT 1 FROM license_lab.devices WHERE id=d AND subscription_id=p_id AND active)) THEN RAISE EXCEPTION 'DEVICE_FORBIDDEN'; END IF;
  UPDATE license_lab.devices SET active=false WHERE subscription_id=p_id AND id=ANY(COALESCE(p_devices,'{}'::uuid[]));
  IF (SELECT count(*) FROM license_lab.devices WHERE subscription_id=p_id AND active)>(CASE WHEN s.farm_id IS NULL THEN 5 ELSE 6 END)+2*next_extra THEN RAISE EXCEPTION 'DEVICE_SELECTION_REQUIRED'; END IF;
  UPDATE license_lab.subscriptions SET extras=next_extra WHERE id=p_id;
 ELSIF p_action='cancel' THEN UPDATE license_lab.subscriptions SET status='cancelled' WHERE id=p_id;
 ELSIF p_action='reactivate' THEN
  IF s.complimentary AND s.free_until<=now() THEN RAISE EXCEPTION 'FREE_EXPIRED'; END IF;
  UPDATE license_lab.subscriptions SET status='active' WHERE id=p_id;
 ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 INSERT INTO license_lab.license_events(subscription_id,actor_id,action,details) VALUES(p_id,license_lab.actor(),p_action,jsonb_build_object('old_extras',s.extras,'new_extras',COALESCE(next_extra,s.extras),'simulation',true,'effective','immediate'));
END $$;
CREATE OR REPLACE FUNCTION license_lab.revoke_member(p_farm uuid,p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM license_lab.farms WHERE id=p_farm FOR UPDATE;
 IF license_lab.role_at(p_farm) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
 PERFORM 1 FROM license_lab.subscriptions WHERE id=p_farm FOR UPDATE;
 IF EXISTS(SELECT 1 FROM license_lab.memberships WHERE farm_id=p_farm AND user_id=p_user AND role='owner') THEN RAISE EXCEPTION 'OWNER_IMMUTABLE'; END IF;
 UPDATE license_lab.memberships SET active=false WHERE farm_id=p_farm AND user_id=p_user AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
 UPDATE license_lab.devices SET active=false WHERE subscription_id=p_farm AND user_id=p_user;
END $$;
CREATE FUNCTION license_lab.dismiss(p_farm uuid,p_user uuid,p_cancel_extra boolean,p_devices uuid[],p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM license_lab.farms WHERE id=p_farm FOR UPDATE;
 IF license_lab.role_at(p_farm) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
 PERFORM 1 FROM license_lab.subscriptions WHERE id=p_farm FOR UPDATE;
 IF NOT license_lab.request_once(p_request,jsonb_build_array('dismiss',p_farm,p_user,p_cancel_extra,p_devices)) THEN RETURN; END IF;
 PERFORM license_lab.revoke_member(p_farm,p_user);
 UPDATE license_lab.devices SET active=false WHERE subscription_id=p_farm AND user_id=p_user;
 IF p_cancel_extra THEN PERFORM license_lab.plan_change(p_farm,'cancel_extra',p_devices,gen_random_uuid()); END IF;
END $$;
CREATE FUNCTION license_lab.device_change(p_id uuid,p_user uuid,p_name text,p_remove uuid,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s license_lab.subscriptions; BEGIN
 SELECT * INTO s FROM license_lab.subscriptions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.owner_id IS DISTINCT FROM license_lab.actor() THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
 IF NOT license_lab.request_once(p_request,jsonb_build_array('device',p_id,p_user,p_name,p_remove)) THEN RETURN; END IF;
 IF p_remove IS NOT NULL THEN
  UPDATE license_lab.devices SET active=false WHERE subscription_id=p_id AND id=p_remove AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVICE_FORBIDDEN'; END IF;
 ELSE
  IF NOT license_lab.entitled(p_id) THEN RAISE EXCEPTION 'READ_ONLY_LICENSE'; END IF;
  IF (s.farm_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM license_lab.memberships WHERE farm_id=s.farm_id AND user_id=p_user AND active AND role<>'consultant')) OR (s.consultant_id IS NOT NULL AND p_user IS DISTINCT FROM s.consultant_id) THEN RAISE EXCEPTION 'DEVICE_FORBIDDEN'; END IF;
  IF (SELECT count(*) FROM license_lab.devices WHERE subscription_id=p_id AND active)>=(CASE WHEN s.farm_id IS NULL THEN 5 ELSE 6 END)+2*s.extras THEN RAISE EXCEPTION 'DEVICE_LIMIT'; END IF;
  INSERT INTO license_lab.devices(subscription_id,user_id,name) VALUES(p_id,p_user,p_name);
 END IF;
 INSERT INTO license_lab.license_events(subscription_id,actor_id,action) VALUES(p_id,license_lab.actor(),CASE WHEN p_remove IS NULL THEN 'device_added' ELSE 'device_revoked' END);
END $$;
CREATE FUNCTION license_lab.create_company(p_name text,p_kind text,p_period text,p_paid boolean,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; BEGIN
 IF NOT EXISTS(SELECT 1 FROM license_lab.people WHERE id=license_lab.actor()) THEN RAISE EXCEPTION 'ACCOUNT_REQUIRED'; END IF;
 IF p_paid IS DISTINCT FROM true THEN RAISE EXCEPTION 'SIMULATED_PAYMENT_REQUIRED'; END IF;
 IF p_kind NOT IN ('farm','consultancy') OR p_kind IS NULL OR p_period NOT IN ('monthly','annual') OR p_period IS NULL OR length(btrim(p_name)) NOT BETWEEN 2 AND 150 THEN RAISE EXCEPTION 'INVALID_COMPANY'; END IF;
 IF NOT license_lab.request_once(p_request,jsonb_build_array('company',p_name,p_kind,p_period,p_paid)) THEN
  RETURN NULL;
 END IF;
 IF p_kind='farm' THEN
  INSERT INTO license_lab.farms VALUES(gen_random_uuid(),btrim(p_name),license_lab.actor()) RETURNING id INTO result;
  INSERT INTO license_lab.memberships VALUES(result,license_lab.actor(),'owner',true);
  INSERT INTO license_lab.subscriptions(id,farm_id,owner_id,period) VALUES(result,result,license_lab.actor(),p_period);
 ELSE
  INSERT INTO license_lab.companies VALUES(license_lab.actor(),btrim(p_name));
  INSERT INTO license_lab.subscriptions(consultant_id,owner_id,period) VALUES(license_lab.actor(),license_lab.actor(),p_period) RETURNING id INTO result;
 END IF;
 INSERT INTO license_lab.license_events(subscription_id,actor_id,action) VALUES(result,license_lab.actor(),'simulated_payment');
 RETURN result;
END $$;
CREATE FUNCTION license_lab.platform_plans() RETURNS TABLE(id uuid,name text,owner_email text,status text,complimentary boolean,free_until timestamptz,extras integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT license_lab.platform_admin() THEN RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED'; END IF;
 RETURN QUERY SELECT s.id,COALESCE(f.name,c.name),p.email,s.status,s.complimentary,s.free_until,s.extras FROM license_lab.subscriptions s JOIN license_lab.people p ON p.id=s.owner_id LEFT JOIN license_lab.farms f ON f.id=s.farm_id LEFT JOIN license_lab.companies c ON c.user_id=s.consultant_id ORDER BY 2;
END $$;
CREATE FUNCTION license_lab.grant_free(p_id uuid,p_enable boolean,p_until timestamptz,p_reason text,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT license_lab.platform_admin() THEN RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED'; END IF;
 IF p_enable IS NULL OR p_reason IS NULL OR length(btrim(p_reason))<3 OR (p_enable AND p_until<=now()) THEN RAISE EXCEPTION 'INVALID_GRANT'; END IF;
 PERFORM 1 FROM license_lab.subscriptions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
 IF NOT license_lab.request_once(p_request,jsonb_build_array('free',p_id,p_enable,p_until,p_reason)) THEN RETURN; END IF;
 -- Removing a courtesy never resumes charging automatically: explicit reactivation is required.
 UPDATE license_lab.subscriptions SET complimentary=p_enable,free_until=CASE WHEN p_enable THEN p_until ELSE NULL END,status=CASE WHEN p_enable THEN 'active' ELSE 'cancelled' END WHERE id=p_id;
 INSERT INTO license_lab.license_events(subscription_id,actor_id,action,details) VALUES(p_id,license_lab.actor(),CASE WHEN p_enable THEN 'free_granted' ELSE 'free_revoked' END,jsonb_build_object('reason',p_reason,'until',p_until));
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA license_lab FROM PUBLIC;
GRANT EXECUTE ON FUNCTION license_lab.platform_admin(),license_lab.entitled(uuid),license_lab.writable(uuid),license_lab.preview_invite(text),license_lab.register_demo(text,text,boolean,text),license_lab.claim_demo(text),license_lab.inbox_v2(),license_lab.plan_change(uuid,text,uuid[],uuid),license_lab.dismiss(uuid,uuid,boolean,uuid[],uuid),license_lab.device_change(uuid,uuid,text,uuid,uuid),license_lab.create_company(text,text,text,boolean,uuid),license_lab.platform_plans(),license_lab.grant_free(uuid,boolean,timestamptz,text,uuid) TO license_lab_client;

