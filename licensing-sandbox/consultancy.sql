-- Somente laboratorio local, sem relacao com as tabelas de producao.
DO $$ BEGIN IF current_setting('agrigest.licensing_sandbox',true) IS DISTINCT FROM 'synthetic-only-v1' THEN RAISE EXCEPTION 'SANDBOX_MARKER_REQUIRED'; END IF; END $$;
CREATE TABLE license_lab.company_members(company_owner uuid REFERENCES license_lab.companies(user_id),user_id uuid REFERENCES license_lab.people(id),role text NOT NULL CHECK(role IN ('owner','admin','operator','monitor')),active boolean NOT NULL DEFAULT true,PRIMARY KEY(company_owner,user_id));
INSERT INTO license_lab.company_members SELECT user_id,user_id,'owner',true FROM license_lab.companies;
ALTER TABLE license_lab.memberships ADD COLUMN access_version bigint NOT NULL DEFAULT 1;
CREATE FUNCTION license_lab.version_access() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.active IS DISTINCT FROM OLD.active OR NEW.role IS DISTINCT FROM OLD.role THEN NEW.access_version:=OLD.access_version+1; END IF; RETURN NEW;
END $$;
CREATE TRIGGER access_version BEFORE UPDATE ON license_lab.memberships FOR EACH ROW EXECUTE FUNCTION license_lab.version_access();
CREATE TABLE license_lab.company_access(company_owner uuid NOT NULL,user_id uuid NOT NULL,farm_id uuid NOT NULL REFERENCES license_lab.farms(id),source_version bigint NOT NULL,active boolean NOT NULL DEFAULT true,PRIMARY KEY(company_owner,user_id,farm_id),FOREIGN KEY(company_owner,user_id) REFERENCES license_lab.company_members(company_owner,user_id));
CREATE TABLE license_lab.company_invites(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_owner uuid NOT NULL REFERENCES license_lab.companies(user_id),email text NOT NULL,role text NOT NULL CHECK(role IN ('admin','operator','monitor')),status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',token_hash text);
CREATE TABLE license_lab.company_invite_farms(invitation_id uuid REFERENCES license_lab.company_invites(id),farm_id uuid REFERENCES license_lab.farms(id),source_version bigint NOT NULL,PRIMARY KEY(invitation_id,farm_id));
CREATE TABLE license_lab.company_mail(id uuid PRIMARY KEY REFERENCES license_lab.company_invites(id),company_owner uuid NOT NULL,recipient_email text NOT NULL,token text NOT NULL);
CREATE FUNCTION license_lab.sponsor_version(p_owner uuid,p_farm uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT m.access_version FROM license_lab.memberships m WHERE m.farm_id=p_farm AND m.user_id=p_owner AND m.active AND m.role IN ('owner','consultant')
$$;
CREATE OR REPLACE FUNCTION license_lab.role_at(p_farm uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE((SELECT role FROM license_lab.memberships WHERE farm_id=p_farm AND user_id=license_lab.actor() AND active),
 (SELECT CASE WHEN bool_or(m.role IN ('admin','operator')) THEN 'consultant' ELSE 'monitor' END FROM license_lab.company_access a JOIN license_lab.company_members m ON m.company_owner=a.company_owner AND m.user_id=a.user_id AND m.active
 WHERE a.farm_id=p_farm AND a.user_id=license_lab.actor() AND a.active AND a.source_version=license_lab.sponsor_version(a.company_owner,a.farm_id) HAVING count(*)>0))
$$;
CREATE FUNCTION license_lab.company_role(p_owner uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT role FROM license_lab.company_members WHERE company_owner=p_owner AND user_id=license_lab.actor() AND active $$;
CREATE FUNCTION license_lab.company_usage(p_owner uuid,p_exclude uuid DEFAULT NULL) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE((SELECT count(*) FROM license_lab.company_members WHERE company_owner=p_owner AND active),0)::integer+
 (SELECT count(*)::integer FROM license_lab.company_invites WHERE company_owner=p_owner AND status='pending' AND expires_at>now() AND (p_exclude IS NULL OR id<>p_exclude))
$$;
CREATE FUNCTION license_lab.visible_sponsor_version(p_owner uuid,p_farm uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT license_lab.sponsor_version(p_owner,p_farm) WHERE p_owner=license_lab.actor() OR EXISTS(SELECT 1 FROM license_lab.company_access WHERE company_owner=p_owner AND user_id=license_lab.actor() AND farm_id=p_farm)
$$;
CREATE OR REPLACE FUNCTION license_lab.writable(p_farm uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT license_lab.entitled(p_farm) AND license_lab.role_at(p_farm) IS NOT NULL AND (
 EXISTS(SELECT 1 FROM license_lab.memberships WHERE farm_id=p_farm AND user_id=license_lab.actor() AND active AND role<>'consultant') OR
 EXISTS(SELECT 1 FROM license_lab.memberships m JOIN license_lab.subscriptions s ON s.consultant_id=m.user_id WHERE m.farm_id=p_farm AND m.user_id=license_lab.actor() AND m.active AND m.role='consultant' AND license_lab.entitled(s.id)) OR
 EXISTS(SELECT 1 FROM license_lab.company_access a JOIN license_lab.company_members m ON m.company_owner=a.company_owner AND m.user_id=a.user_id AND m.active JOIN license_lab.subscriptions s ON s.consultant_id=a.company_owner WHERE a.user_id=license_lab.actor() AND a.farm_id=p_farm AND a.active AND a.source_version=license_lab.sponsor_version(a.company_owner,p_farm) AND license_lab.entitled(s.id)))
$$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['company_members','company_access','company_invites','company_invite_farms','company_mail'] LOOP EXECUTE format('ALTER TABLE license_lab.%I ENABLE ROW LEVEL SECURITY',t); END LOOP; END $$;
CREATE POLICY company_visible ON license_lab.company_members FOR SELECT USING(company_owner=license_lab.actor() OR user_id=license_lab.actor());
CREATE POLICY access_visible ON license_lab.company_access FOR SELECT USING(company_owner=license_lab.actor() OR user_id=license_lab.actor());
CREATE POLICY company_invite_visible ON license_lab.company_invites FOR SELECT USING(company_owner=license_lab.actor() OR email=(SELECT email FROM license_lab.people WHERE id=license_lab.actor()));
CREATE POLICY invite_farms_visible ON license_lab.company_invite_farms FOR SELECT USING(EXISTS(SELECT 1 FROM license_lab.company_invites WHERE id=invitation_id));
CREATE POLICY company_mail_visible ON license_lab.company_mail FOR SELECT USING(company_owner=license_lab.actor());
DROP POLICY own_company ON license_lab.companies;
CREATE POLICY own_company ON license_lab.companies FOR SELECT USING(license_lab.company_role(user_id) IS NOT NULL);
GRANT SELECT ON license_lab.company_members,license_lab.company_access,license_lab.company_invites,license_lab.company_invite_farms,license_lab.company_mail TO license_lab_client;

CREATE FUNCTION license_lab.validate_company_farms(p_owner uuid,p_farms uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_owner IS DISTINCT FROM license_lab.actor() OR license_lab.company_role(p_owner) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'COMPANY_OWNER_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM license_lab.subscriptions WHERE consultant_id=p_owner AND license_lab.entitled(id)) THEN RAISE EXCEPTION 'READ_ONLY_LICENSE'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(COALESCE(p_farms,'{}'::uuid[])) f WHERE license_lab.sponsor_version(p_owner,f) IS NULL OR NOT license_lab.entitled(f)) THEN RAISE EXCEPTION 'FARM_DELEGATION_FORBIDDEN'; END IF;
END $$;
CREATE FUNCTION license_lab.invite_company(p_owner uuid,p_email text,p_role text,p_farms uuid[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; token text; s license_lab.subscriptions; recipient uuid; BEGIN
 SELECT * INTO s FROM license_lab.subscriptions WHERE consultant_id=p_owner FOR UPDATE;
 PERFORM license_lab.validate_company_farms(p_owner,p_farms);
 IF p_role IS NULL OR p_role NOT IN ('admin','operator','monitor') THEN RAISE EXCEPTION 'COMPANY_STAFF_ROLES_ONLY'; END IF;
 IF p_email IS NULL OR lower(btrim(p_email)) !~ '^[a-z0-9.!#$%&*+/=?^_`{|}~-]+@example[.]test$' THEN RAISE EXCEPTION 'TEST_EMAIL_REQUIRED'; END IF;
 SELECT id INTO recipient FROM license_lab.people WHERE lower(email)=lower(btrim(p_email));
 IF EXISTS(SELECT 1 FROM license_lab.company_members WHERE company_owner=p_owner AND user_id=recipient AND active) THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
 IF EXISTS(SELECT 1 FROM license_lab.company_invites WHERE company_owner=p_owner AND email=lower(btrim(p_email)) AND status='pending' AND expires_at>now()) THEN RAISE EXCEPTION 'INVITATION_PENDING'; END IF;
 IF license_lab.company_usage(p_owner)>=4+s.extras THEN RAISE EXCEPTION 'SEAT_LIMIT'; END IF;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 INSERT INTO license_lab.company_invites(company_owner,email,role,token_hash) VALUES(p_owner,lower(btrim(p_email)),p_role,encode(sha256(convert_to(token,'UTF8')),'hex')) RETURNING id INTO result;
 INSERT INTO license_lab.company_invite_farms SELECT result,f,license_lab.sponsor_version(p_owner,f) FROM (SELECT DISTINCT unnest(COALESCE(p_farms,'{}'::uuid[])) AS f) x;
 INSERT INTO license_lab.company_mail VALUES(result,p_owner,lower(btrim(p_email)),token);
 INSERT INTO license_lab.license_events(subscription_id,actor_id,action,details) VALUES(s.id,license_lab.actor(),'company_invited',jsonb_build_object('email',lower(btrim(p_email)),'role',p_role,'farms',p_farms));
 RETURN result;
END $$;
CREATE FUNCTION license_lab.accept_company(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i license_lab.company_invites; s license_lab.subscriptions; BEGIN
 SELECT * INTO i FROM license_lab.company_invites WHERE id=p_id;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM license_lab.people WHERE id=license_lab.actor() AND lower(email)=i.email) THEN RAISE EXCEPTION 'INVITATION_FORBIDDEN'; END IF;
 SELECT * INTO s FROM license_lab.subscriptions WHERE consultant_id=i.company_owner FOR UPDATE;
 SELECT * INTO i FROM license_lab.company_invites WHERE id=p_id FOR UPDATE;
 IF i.status<>'pending' OR i.expires_at<=now() THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE'; END IF;
 IF NOT license_lab.entitled(s.id) THEN RAISE EXCEPTION 'READ_ONLY_LICENSE'; END IF;
 IF license_lab.company_usage(i.company_owner,i.id)>=4+s.extras THEN RAISE EXCEPTION 'SEAT_LIMIT'; END IF;
 IF EXISTS(SELECT 1 FROM license_lab.company_invite_farms WHERE invitation_id=i.id AND (source_version IS DISTINCT FROM license_lab.sponsor_version(i.company_owner,farm_id) OR NOT license_lab.entitled(farm_id))) THEN RAISE EXCEPTION 'FARM_DELEGATION_FORBIDDEN'; END IF;
 IF EXISTS(SELECT 1 FROM license_lab.company_members WHERE company_owner=i.company_owner AND user_id=license_lab.actor() AND active) THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
 INSERT INTO license_lab.company_members VALUES(i.company_owner,license_lab.actor(),i.role,true) ON CONFLICT(company_owner,user_id) DO UPDATE SET role=EXCLUDED.role,active=true;
 -- A rehire never restores old farm selections.
 UPDATE license_lab.company_access SET active=false WHERE company_owner=i.company_owner AND user_id=license_lab.actor();
 INSERT INTO license_lab.company_access SELECT i.company_owner,license_lab.actor(),farm_id,source_version,true FROM license_lab.company_invite_farms WHERE invitation_id=i.id
 ON CONFLICT(company_owner,user_id,farm_id) DO UPDATE SET source_version=EXCLUDED.source_version,active=true;
 UPDATE license_lab.company_invites SET status='accepted',token_hash=NULL WHERE id=i.id;
 INSERT INTO license_lab.license_events(subscription_id,actor_id,action,details) VALUES(s.id,license_lab.actor(),'company_accepted',jsonb_build_object('invitation',i.id));
END $$;
CREATE FUNCTION license_lab.company_farms(p_owner uuid,p_user uuid,p_farms uuid[],p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s license_lab.subscriptions; BEGIN
 SELECT * INTO s FROM license_lab.subscriptions WHERE consultant_id=p_owner FOR UPDATE;
 PERFORM license_lab.validate_company_farms(p_owner,p_farms);
 IF NOT EXISTS(SELECT 1 FROM license_lab.company_members WHERE company_owner=p_owner AND user_id=p_user AND active AND role<>'owner') THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
 IF NOT license_lab.request_once(p_request,jsonb_build_array('company_farms',p_owner,p_user,p_farms)) THEN RETURN; END IF;
 UPDATE license_lab.company_access SET active=false WHERE company_owner=p_owner AND user_id=p_user;
 INSERT INTO license_lab.company_access SELECT p_owner,p_user,f,license_lab.sponsor_version(p_owner,f),true FROM (SELECT DISTINCT unnest(COALESCE(p_farms,'{}'::uuid[])) AS f) x
 ON CONFLICT(company_owner,user_id,farm_id) DO UPDATE SET source_version=EXCLUDED.source_version,active=true;
 INSERT INTO license_lab.license_events(subscription_id,actor_id,action,details) VALUES(s.id,license_lab.actor(),'company_farms_changed',jsonb_build_object('user',p_user,'farms',p_farms));
END $$;
CREATE FUNCTION license_lab.revoke_company_invite(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i license_lab.company_invites; BEGIN SELECT * INTO i FROM license_lab.company_invites WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR i.company_owner IS DISTINCT FROM license_lab.actor() THEN RAISE EXCEPTION 'COMPANY_OWNER_REQUIRED'; END IF;
 IF i.status<>'pending' THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE'; END IF;
 UPDATE license_lab.company_invites SET status='revoked',token_hash=NULL WHERE id=p_id;
END $$;
CREATE FUNCTION license_lab.dismiss_company(p_owner uuid,p_user uuid,p_cancel boolean,p_devices uuid[],p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s license_lab.subscriptions; BEGIN
 SELECT * INTO s FROM license_lab.subscriptions WHERE consultant_id=p_owner FOR UPDATE;
 IF p_owner IS DISTINCT FROM license_lab.actor() THEN RAISE EXCEPTION 'COMPANY_OWNER_REQUIRED'; END IF;
 IF p_user=p_owner THEN RAISE EXCEPTION 'OWNER_IMMUTABLE'; END IF;
 IF NOT license_lab.request_once(p_request,jsonb_build_array('dismiss_company',p_owner,p_user,p_cancel,p_devices)) THEN RETURN; END IF;
 UPDATE license_lab.company_members SET active=false WHERE company_owner=p_owner AND user_id=p_user AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
 UPDATE license_lab.company_access SET active=false WHERE company_owner=p_owner AND user_id=p_user;
 UPDATE license_lab.devices SET active=false WHERE subscription_id=s.id AND user_id=p_user;
 IF p_cancel THEN PERFORM license_lab.plan_change(s.id,'cancel_extra',p_devices,gen_random_uuid()); END IF;
 INSERT INTO license_lab.license_events(subscription_id,actor_id,action,details) VALUES(s.id,license_lab.actor(),'company_dismissed',jsonb_build_object('user',p_user));
END $$;

-- Keep old APIs for farm invitations, with an additional consultant-to-consultant guard.
ALTER FUNCTION license_lab.invite(uuid,text,text) RENAME TO invite_farm_core;
CREATE FUNCTION license_lab.invite(p_farm uuid,p_email text,p_role text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_role='consultant' AND EXISTS(SELECT 1 FROM license_lab.companies WHERE user_id=license_lab.actor()) THEN RAISE EXCEPTION 'COMPANY_STAFF_ROLES_ONLY'; END IF;
 RETURN license_lab.invite_farm_core(p_farm,p_email,p_role);
END $$;
ALTER FUNCTION license_lab.register_demo(text,text,boolean,text) RENAME TO register_farm_demo;
ALTER FUNCTION license_lab.accept_invitation(uuid) RENAME TO accept_farm_core;
CREATE FUNCTION license_lab.accept_invitation(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM license_lab.invitations i JOIN license_lab.companies c ON c.user_id=i.created_by WHERE i.id=p_id AND i.role='consultant') THEN RAISE EXCEPTION 'COMPANY_STAFF_ROLES_ONLY'; END IF;
 PERFORM license_lab.accept_farm_core(p_id);
END $$;
CREATE FUNCTION license_lab.register_demo(p_name text,p_email text,p_verified boolean,p_token text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE i license_lab.company_invites; result uuid; BEGIN
 SELECT * INTO i FROM license_lab.company_invites WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 IF NOT FOUND THEN RETURN license_lab.register_farm_demo(p_name,p_email,p_verified,p_token); END IF;
 IF i.email<>lower(btrim(p_email)) THEN RAISE EXCEPTION 'INVITATION_FORBIDDEN'; END IF;
 result:=license_lab.register_farm_demo(p_name,p_email,p_verified,NULL);
 PERFORM set_config('license_lab.actor',result::text,true);PERFORM license_lab.accept_company(i.id);RETURN result;
END $$;
ALTER FUNCTION license_lab.claim_demo(text) RENAME TO claim_farm_demo;
CREATE FUNCTION license_lab.claim_demo(p_token text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; BEGIN
 SELECT id INTO result FROM license_lab.company_invites WHERE token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 IF FOUND THEN PERFORM license_lab.accept_company(result); ELSE PERFORM license_lab.claim_farm_demo(p_token); END IF;
END $$;
CREATE FUNCTION license_lab.preview_invite_v3(p_token text) RETURNS TABLE(email text,farm_name text,role text,kind text,farm_names text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p.email,p.farm_name,p.role,'farm',ARRAY[p.farm_name] FROM license_lab.preview_invite(p_token) p
 UNION ALL SELECT i.email,c.name,i.role,'company',ARRAY(SELECT f.name FROM license_lab.company_invite_farms x JOIN license_lab.farms f ON f.id=x.farm_id WHERE x.invitation_id=i.id ORDER BY f.name)
 FROM license_lab.company_invites i JOIN license_lab.companies c ON c.user_id=i.company_owner WHERE i.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') AND i.status='pending' AND i.expires_at>now()
$$;
CREATE FUNCTION license_lab.company_inbox() RETURNS TABLE(id uuid,farm_name text,role text,status text,expires_at timestamptz,farm_names text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT i.id,c.name,i.role,i.status,i.expires_at,ARRAY(SELECT f.name FROM license_lab.company_invite_farms x JOIN license_lab.farms f ON f.id=x.farm_id WHERE x.invitation_id=i.id ORDER BY f.name)
 FROM license_lab.company_invites i JOIN license_lab.companies c ON c.user_id=i.company_owner JOIN license_lab.people p ON p.id=license_lab.actor() WHERE lower(p.email)=i.email
$$;
-- New companies acquire their owner membership automatically.
CREATE FUNCTION license_lab.company_owner_created() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN INSERT INTO license_lab.company_members VALUES(NEW.user_id,NEW.user_id,'owner',true);RETURN NEW;END $$;
CREATE TRIGGER company_owner_created AFTER INSERT ON license_lab.companies FOR EACH ROW EXECUTE FUNCTION license_lab.company_owner_created();
CREATE FUNCTION license_lab.check_company_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NEW.consultant_id IS NOT NULL AND license_lab.company_usage(NEW.consultant_id)>4+NEW.extras THEN RAISE EXCEPTION 'SEAT_LIMIT'; END IF;RETURN NEW;
END $$;
CREATE TRIGGER company_capacity BEFORE UPDATE OF extras ON license_lab.subscriptions FOR EACH ROW EXECUTE FUNCTION license_lab.check_company_capacity();
CREATE OR REPLACE FUNCTION license_lab.device_change(p_id uuid,p_user uuid,p_name text,p_remove uuid,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s license_lab.subscriptions; BEGIN
 SELECT * INTO s FROM license_lab.subscriptions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.owner_id IS DISTINCT FROM license_lab.actor() THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
 IF NOT license_lab.request_once(p_request,jsonb_build_array('device',p_id,p_user,p_name,p_remove)) THEN RETURN; END IF;
 IF p_remove IS NOT NULL THEN
  UPDATE license_lab.devices SET active=false WHERE subscription_id=p_id AND id=p_remove AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVICE_FORBIDDEN'; END IF;
 ELSE
  IF NOT license_lab.entitled(p_id) THEN RAISE EXCEPTION 'READ_ONLY_LICENSE'; END IF;
  IF (s.farm_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM license_lab.memberships WHERE farm_id=s.farm_id AND user_id=p_user AND active AND role<>'consultant')) OR
    (s.consultant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM license_lab.company_members WHERE company_owner=s.consultant_id AND user_id=p_user AND active)) THEN RAISE EXCEPTION 'DEVICE_FORBIDDEN'; END IF;
  IF (SELECT count(*) FROM license_lab.devices WHERE subscription_id=p_id AND active)>=(CASE WHEN s.farm_id IS NULL THEN 5 ELSE 6 END)+2*s.extras THEN RAISE EXCEPTION 'DEVICE_LIMIT'; END IF;
  INSERT INTO license_lab.devices(subscription_id,user_id,name) VALUES(p_id,p_user,p_name);
 END IF;
 INSERT INTO license_lab.license_events(subscription_id,actor_id,action) VALUES(p_id,license_lab.actor(),CASE WHEN p_remove IS NULL THEN 'device_added' ELSE 'device_revoked' END);
END $$;
-- Avoid bypassing wrappers through names retained for backward compatibility.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA license_lab FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION license_lab.invite_farm_core(uuid,text,text),license_lab.accept_farm_core(uuid),license_lab.register_farm_demo(text,text,boolean,text),license_lab.claim_farm_demo(text) FROM license_lab_client;
GRANT EXECUTE ON FUNCTION license_lab.role_at(uuid),license_lab.writable(uuid),license_lab.company_role(uuid),license_lab.visible_sponsor_version(uuid,uuid),license_lab.invite(uuid,text,text),license_lab.accept_invitation(uuid),license_lab.register_demo(text,text,boolean,text),license_lab.claim_demo(text),license_lab.preview_invite_v3(text),license_lab.company_inbox(),license_lab.invite_company(uuid,text,text,uuid[]),license_lab.accept_company(uuid),license_lab.company_farms(uuid,uuid,uuid[],uuid),license_lab.dismiss_company(uuid,uuid,boolean,uuid[],uuid),license_lab.revoke_company_invite(uuid) TO license_lab_client;
