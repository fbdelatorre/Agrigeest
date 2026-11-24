-- Empresas e equipes autenticadas, somente Sandbox. Não assume titularidade operacional.
BEGIN;
CREATE TABLE licensing_private.organizations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),license_id uuid NOT NULL UNIQUE REFERENCES licensing.licenses(id),
 name text NOT NULL,kind text NOT NULL CHECK(kind IN ('farm','consultancy')),owner_id uuid NOT NULL REFERENCES auth.users(id),
 operational_institution_id uuid UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE licensing_private.memberships(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES licensing_private.organizations(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),role text NOT NULL CHECK(role IN ('administrator','application_manager','field_monitor')),
 version uuid NOT NULL DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz);
CREATE UNIQUE INDEX one_active_membership ON licensing_private.memberships(organization_id,user_id) WHERE revoked_at IS NULL;
CREATE TABLE licensing_private.team_invitations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES licensing_private.organizations(id),
 email text NOT NULL,role text NOT NULL CHECK(role IN ('administrator','application_manager','field_monitor','consultant')),
 token_hash bytea NOT NULL,consultancy_id uuid REFERENCES licensing_private.organizations(id),farms jsonb NOT NULL DEFAULT '[]',
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','accepted','revoked','expired')),
 accepted_by uuid REFERENCES auth.users(id),accepted_at timestamptz,delivery text NOT NULL DEFAULT 'pending' CHECK(delivery IN ('pending','sent','failed')));
CREATE UNIQUE INDEX one_pending_team_invite ON licensing_private.team_invitations(organization_id,email) WHERE state='pending';
CREATE TABLE licensing_private.farm_consultants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),farm_id uuid NOT NULL REFERENCES licensing_private.organizations(id),
 consultancy_id uuid NOT NULL REFERENCES licensing_private.organizations(id),created_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz);
CREATE UNIQUE INDEX one_active_consultancy ON licensing_private.farm_consultants(farm_id,consultancy_id) WHERE revoked_at IS NULL;
CREATE TABLE licensing_private.farm_delegations(
 membership_id uuid NOT NULL REFERENCES licensing_private.memberships(id),farm_id uuid NOT NULL REFERENCES licensing_private.organizations(id),
 grant_id uuid REFERENCES licensing_private.farm_consultants(id),PRIMARY KEY(membership_id,farm_id));
ALTER TABLE licensing_private.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_private.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_private.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_private.farm_consultants ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_private.farm_delegations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing_private.organizations,licensing_private.memberships,licensing_private.team_invitations,licensing_private.farm_consultants,licensing_private.farm_delegations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION licensing_private.team_actor() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id WHERE u.id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now())) THEN RAISE EXCEPTION 'TEAM_SESSION_REQUIRED' USING ERRCODE='42501';END IF;
 RETURN auth.uid();
END $$;
CREATE FUNCTION licensing_private.license_live(p_license uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM licensing.licenses WHERE id=p_license AND test_mode AND status='active' AND (valid_until IS NULL OR valid_until>now())) $$;
CREATE FUNCTION licensing_private.team_owner(p_org uuid,p_write boolean DEFAULT true) RETURNS licensing_private.organizations LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations;BEGIN
 PERFORM licensing_private.team_actor();SELECT * INTO o FROM licensing_private.organizations WHERE id=p_org AND owner_id=auth.uid();
 IF NOT FOUND THEN RAISE EXCEPTION 'TEAM_OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT (SELECT test_mode FROM licensing.licenses WHERE id=o.license_id) THEN RAISE EXCEPTION 'TEAM_SANDBOX_ONLY';END IF;
 IF p_write AND NOT licensing_private.license_live(o.license_id) THEN RAISE EXCEPTION 'ACTIVE_LICENSE_REQUIRED';END IF;
 RETURN o;
END $$;
CREATE FUNCTION licensing_private.team_limit(p_license uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT 3+least(l.extras,COALESCE((SELECT min(target_extras) FROM licensing_private.subscription_changes WHERE license_id=l.id AND action='extras' AND state IN ('pending','processing','failed','review','scheduled')),l.extras)) FROM licensing.licenses l WHERE l.id=p_license
$$;
CREATE FUNCTION licensing_private.team_used(p_org uuid) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT ((SELECT count(*) FROM licensing_private.memberships WHERE organization_id=p_org AND revoked_at IS NULL)+(SELECT count(*) FROM licensing_private.team_invitations WHERE organization_id=p_org AND role<>'consultant' AND state='pending' AND expires_at>now()))::integer
$$;
CREATE FUNCTION licensing.workspace_initialize(p_license uuid,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<initialize_op>>
DECLARE l licensing.licenses; result uuid;BEGIN
 PERFORM licensing_private.team_actor();SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND OR l.owner_id<>auth.uid() THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT l.test_mode THEN RAISE EXCEPTION 'TEAM_SANDBOX_ONLY';END IF;
 IF NOT licensing_private.license_live(l.id) THEN RAISE EXCEPTION 'ACTIVE_LICENSE_REQUIRED';END IF;
 IF l.institution_id IS NOT NULL THEN RAISE EXCEPTION 'EXISTING_INSTITUTION_REQUIRES_REVIEW';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('workspace_initialize',p_license)) THEN SELECT r.result INTO result FROM licensing_private.requests r WHERE id=p_request;RETURN result;END IF;
 INSERT INTO licensing_private.organizations(license_id,name,kind,owner_id) VALUES(l.id,l.label,l.kind,l.owner_id) ON CONFLICT(license_id) DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN SELECT id INTO result FROM licensing_private.organizations WHERE license_id=l.id;
 ELSE INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(l.id,auth.uid(),'workspace_created',jsonb_build_object('organization_id',result));END IF;
 UPDATE licensing_private.requests r SET result=initialize_op.result WHERE r.id=p_request;
 RETURN result;
END $$;

CREATE FUNCTION licensing.workspace_available_farms(p_org uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations; result jsonb;BEGIN
 o:=licensing_private.team_owner(p_org,false);IF o.kind<>'consultancy' THEN RETURN '[]';END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'grant_id',g.id,'active',licensing_private.license_live(f.license_id)) ORDER BY f.name),'[]') INTO result
 FROM licensing_private.organizations f LEFT JOIN licensing_private.farm_consultants g ON g.farm_id=f.id AND g.consultancy_id=o.id AND g.revoked_at IS NULL
 WHERE f.kind='farm' AND (f.owner_id=o.owner_id OR g.id IS NOT NULL);
 RETURN result;
END $$;
CREATE FUNCTION licensing_private.validate_team_farms(p_org uuid,p_farms uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations; result jsonb:='[]'; fid uuid; g uuid; f licensing_private.organizations;BEGIN
 SELECT * INTO o FROM licensing_private.organizations WHERE id=p_org;
 IF p_farms IS NULL OR cardinality(p_farms)>100 THEN RAISE EXCEPTION 'INVALID_FARM_SELECTION';END IF;
 IF o.kind<>'consultancy' AND cardinality(p_farms)>0 THEN RAISE EXCEPTION 'INVALID_FARM_SELECTION';END IF;
 FOR fid IN SELECT DISTINCT unnest(p_farms) LOOP
  SELECT * INTO f FROM licensing_private.organizations WHERE id=fid AND kind='farm';
  IF NOT FOUND OR NOT licensing_private.license_live(f.license_id) THEN RAISE EXCEPTION 'FARM_ACCESS_REQUIRED' USING ERRCODE='42501';END IF;
  g:=NULL;IF f.owner_id<>o.owner_id THEN SELECT id INTO g FROM licensing_private.farm_consultants WHERE farm_id=fid AND consultancy_id=p_org AND revoked_at IS NULL;IF g IS NULL THEN RAISE EXCEPTION 'FARM_ACCESS_REQUIRED' USING ERRCODE='42501';END IF;END IF;
  result:=result||jsonb_build_array(jsonb_build_object('farm_id',fid,'grant_id',g));
 END LOOP;RETURN result;
END $$;
CREATE FUNCTION licensing.workspace_invite(p_org uuid,p_email text,p_role text,p_farms uuid[],p_consultancy uuid,p_token text,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<invite_op>>
DECLARE o licensing_private.organizations; target licensing_private.organizations; recipient uuid; farms jsonb; result uuid; i licensing_private.team_invitations;BEGIN
 o:=licensing_private.team_owner(p_org);PERFORM 1 FROM licensing.licenses WHERE id=o.license_id FOR UPDATE;
 IF NOT licensing_private.license_live(o.license_id) THEN RAISE EXCEPTION 'ACTIVE_LICENSE_REQUIRED';END IF;
 IF p_email IS NULL OR length(p_email)>254 OR lower(btrim(p_email))!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_token IS NULL OR p_token!~'^[a-f0-9]{64}$' OR p_role IS NULL OR p_role NOT IN ('administrator','application_manager','field_monitor','consultant') THEN RAISE EXCEPTION 'INVALID_TEAM_INVITE';END IF;
 p_email:=lower(btrim(p_email));IF EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND lower(email)=p_email) THEN RAISE EXCEPTION 'OWNER_ALREADY_INCLUDED';END IF;
 farms:=licensing_private.validate_team_farms(p_org,p_farms);
 SELECT id INTO recipient FROM auth.users WHERE lower(email)=p_email AND email_confirmed_at IS NOT NULL;
 IF p_role='consultant' THEN
  IF o.kind<>'farm' OR cardinality(p_farms)<>0 THEN RAISE EXCEPTION 'CONSULTANT_INVITE_NOT_ALLOWED';END IF;
  SELECT * INTO target FROM licensing_private.organizations WHERE id=p_consultancy AND kind='consultancy' AND owner_id=recipient;
  IF NOT FOUND OR NOT licensing_private.license_live(target.license_id) THEN RAISE EXCEPTION 'REGISTERED_CONSULTANCY_REQUIRED';END IF;
 ELSIF p_consultancy IS NOT NULL THEN RAISE EXCEPTION 'INVALID_TEAM_INVITE';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('team_invite',p_org,p_email,p_role,farms,p_consultancy,encode(sha256(convert_to(p_token,'UTF8')),'hex'))) THEN SELECT r.result INTO result FROM licensing_private.requests r WHERE id=p_request;
 ELSE
  UPDATE licensing_private.team_invitations SET state='expired' WHERE organization_id=p_org AND state='pending' AND expires_at<=now();
  IF EXISTS(SELECT 1 FROM licensing_private.team_invitations WHERE organization_id=p_org AND email=p_email AND state='pending') THEN RAISE EXCEPTION 'INVITATION_ALREADY_PENDING';END IF;
  IF EXISTS(SELECT 1 FROM licensing_private.memberships WHERE organization_id=p_org AND user_id=recipient AND revoked_at IS NULL) THEN RAISE EXCEPTION 'MEMBER_ALREADY_ACTIVE';END IF;
  IF p_role<>'consultant' AND licensing_private.team_used(p_org)>=licensing_private.team_limit(o.license_id) THEN RAISE EXCEPTION 'TEAM_LIMIT_REACHED';END IF;
  IF p_role='consultant' AND EXISTS(SELECT 1 FROM licensing_private.farm_consultants WHERE farm_id=p_org AND consultancy_id=p_consultancy AND revoked_at IS NULL) THEN RAISE EXCEPTION 'CONSULTANT_ALREADY_ACTIVE';END IF;
  INSERT INTO licensing_private.team_invitations(organization_id,email,role,token_hash,consultancy_id,farms,created_by) VALUES(p_org,p_email,p_role,sha256(convert_to(p_token,'UTF8')),p_consultancy,farms,auth.uid()) RETURNING id INTO result;
  UPDATE licensing_private.requests r SET result=invite_op.result WHERE r.id=p_request;
  INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(o.license_id,auth.uid(),'team_invited',jsonb_build_object('invitation_id',result,'role',p_role));
 END IF;
 SELECT * INTO i FROM licensing_private.team_invitations WHERE id=result;
 RETURN jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'organization',o.name,'registered',recipient IS NOT NULL,'delivery',i.delivery);
END $$;

CREATE FUNCTION licensing.workspace_consultancies(p_org uuid,p_email text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations; result jsonb;BEGIN
 o:=licensing_private.team_owner(p_org);IF o.kind<>'farm' THEN RAISE EXCEPTION 'CONSULTANT_INVITE_NOT_ALLOWED';END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name)),'[]') INTO result FROM licensing_private.organizations c JOIN auth.users u ON u.id=c.owner_id
 WHERE c.kind='consultancy' AND lower(u.email)=lower(btrim(p_email)) AND u.email_confirmed_at IS NOT NULL AND licensing_private.license_live(c.license_id);RETURN result;
END $$;
CREATE FUNCTION licensing.invitation_preview(p_invite uuid,p_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE i licensing_private.team_invitations; o licensing_private.organizations;BEGIN
 IF p_token IS NULL OR p_token!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE';END IF;
 SELECT * INTO i FROM licensing_private.team_invitations WHERE id=p_invite AND token_hash=sha256(convert_to(p_token,'UTF8')) AND state='pending' AND expires_at>now();IF NOT FOUND THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE';END IF;
 SELECT * INTO o FROM licensing_private.organizations WHERE id=i.organization_id;
 RETURN jsonb_build_object('id',i.id,'email',i.email,'organization',o.name,'role',i.role);
END $$;
CREATE FUNCTION licensing.workspace_accept(p_invite uuid,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<accept_op>>
DECLARE i licensing_private.team_invitations; o licensing_private.organizations; target licensing_private.organizations; result uuid; source jsonb;BEGIN
 PERFORM licensing_private.team_actor();SELECT * INTO i FROM licensing_private.team_invitations WHERE id=p_invite;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND lower(email)=i.email AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'INVITATION_RECIPIENT_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM licensing_private.organizations WHERE id=i.organization_id;PERFORM 1 FROM licensing.licenses WHERE id IN (o.license_id,(SELECT license_id FROM licensing_private.organizations WHERE id=i.consultancy_id)) ORDER BY id FOR UPDATE;
 SELECT * INTO i FROM licensing_private.team_invitations WHERE id=p_invite FOR UPDATE;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('team_accept',p_invite)) THEN SELECT r.result INTO result FROM licensing_private.requests r WHERE id=p_request;RETURN result;END IF;
 IF i.state<>'pending' OR i.expires_at<=now() THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE';END IF;
 IF NOT licensing_private.license_live(o.license_id) THEN RAISE EXCEPTION 'ACTIVE_LICENSE_REQUIRED';END IF;
 IF i.role='consultant' THEN
  SELECT * INTO target FROM licensing_private.organizations WHERE id=i.consultancy_id AND owner_id=auth.uid() AND kind='consultancy';
  IF NOT FOUND OR NOT licensing_private.license_live(target.license_id) THEN RAISE EXCEPTION 'REGISTERED_CONSULTANCY_REQUIRED';END IF;
  INSERT INTO licensing_private.farm_consultants(farm_id,consultancy_id) VALUES(o.id,target.id) RETURNING id INTO result;
 ELSE
  IF licensing_private.team_used(o.id)>licensing_private.team_limit(o.license_id) THEN RAISE EXCEPTION 'TEAM_LIMIT_REACHED';END IF;
  -- Revalida as fontes e suas versões. Um novo convite não restaura delegações antigas.
  FOR source IN SELECT * FROM jsonb_array_elements(i.farms) LOOP
   IF source->>'grant_id' IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM licensing_private.farm_consultants WHERE id=(source->>'grant_id')::uuid AND farm_id=(source->>'farm_id')::uuid AND consultancy_id=o.id AND revoked_at IS NULL) THEN RAISE EXCEPTION 'FARM_ACCESS_REQUIRED';END IF;
   ELSE IF NOT EXISTS(SELECT 1 FROM licensing_private.organizations WHERE id=(source->>'farm_id')::uuid AND owner_id=o.owner_id AND kind='farm') THEN RAISE EXCEPTION 'FARM_ACCESS_REQUIRED';END IF;END IF;
  END LOOP;
  INSERT INTO licensing_private.memberships(organization_id,user_id,role) VALUES(o.id,auth.uid(),i.role) RETURNING id INTO result;
  INSERT INTO licensing_private.farm_delegations(membership_id,farm_id,grant_id) SELECT result,(v->>'farm_id')::uuid,(v->>'grant_id')::uuid FROM jsonb_array_elements(i.farms) v;
 END IF;
 UPDATE licensing_private.team_invitations SET state='accepted',accepted_by=auth.uid(),accepted_at=now() WHERE id=i.id;
 UPDATE licensing_private.requests r SET result=accept_op.result WHERE r.id=p_request;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(o.license_id,auth.uid(),'team_invitation_accepted',jsonb_build_object('invitation_id',i.id,'membership_id',result));RETURN result;
END $$;

CREATE FUNCTION licensing.workspace_home() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE companies jsonb; invites jsonb;BEGIN
 PERFORM licensing_private.team_actor();
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'kind',o.kind,'license_id',o.license_id,'owner',o.owner_id=auth.uid(),'role',COALESCE(m.role,'owner'),'active',licensing_private.license_live(o.license_id)) ORDER BY o.name),'[]') INTO companies
 FROM licensing_private.organizations o LEFT JOIN licensing_private.memberships m ON m.organization_id=o.id AND m.user_id=auth.uid() AND m.revoked_at IS NULL WHERE o.owner_id=auth.uid() OR m.id IS NOT NULL;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'organization',o.name,'role',i.role,'expires_at',i.expires_at) ORDER BY i.created_at DESC),'[]') INTO invites FROM licensing_private.team_invitations i JOIN licensing_private.organizations o ON o.id=i.organization_id JOIN auth.users u ON lower(u.email)=i.email AND u.id=auth.uid() WHERE i.state='pending' AND i.expires_at>now();
 RETURN jsonb_build_object('organizations',companies,'invitations',invites);
END $$;
CREATE FUNCTION licensing.workspace_team(p_org uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations; members jsonb; invites jsonb; consultants jsonb;BEGIN
 o:=licensing_private.team_owner(p_org,false);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',m.id,'email',u.email,'role',m.role,'version',m.version,'revoked_at',m.revoked_at,'farms',COALESCE((SELECT jsonb_agg(d.farm_id) FROM licensing_private.farm_delegations d WHERE d.membership_id=m.id AND ((d.grant_id IS NULL AND EXISTS(SELECT 1 FROM licensing_private.organizations f WHERE f.id=d.farm_id AND f.owner_id=o.owner_id)) OR EXISTS(SELECT 1 FROM licensing_private.farm_consultants g WHERE g.id=d.grant_id AND g.farm_id=d.farm_id AND g.consultancy_id=o.id AND g.revoked_at IS NULL))),'[]')) ORDER BY m.created_at),'[]') INTO members FROM licensing_private.memberships m JOIN auth.users u ON u.id=m.user_id WHERE m.organization_id=p_org;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'email',email,'role',role,'state',CASE WHEN state='pending' AND expires_at<=now() THEN 'expired' ELSE state END,'delivery',delivery,'expires_at',expires_at) ORDER BY created_at DESC),'[]') INTO invites FROM licensing_private.team_invitations WHERE organization_id=p_org;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',g.id,'name',c.name,'revoked_at',g.revoked_at)),'[]') INTO consultants FROM licensing_private.farm_consultants g JOIN licensing_private.organizations c ON c.id=g.consultancy_id WHERE g.farm_id=p_org;
 RETURN jsonb_build_object('members',members,'invitations',invites,'consultants',consultants,'used',1+licensing_private.team_used(p_org),'limit',1+licensing_private.team_limit(o.license_id),'active',licensing_private.license_live(o.license_id));
END $$;
CREATE FUNCTION licensing.workspace_revoke_invite(p_org uuid,p_invite uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations;BEGIN
 o:=licensing_private.team_owner(p_org,false);PERFORM 1 FROM licensing.licenses WHERE id=o.license_id FOR UPDATE;
 UPDATE licensing_private.team_invitations SET state='revoked' WHERE id=p_invite AND organization_id=p_org AND state='pending';
 IF FOUND THEN INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(o.license_id,auth.uid(),'team_invitation_revoked',jsonb_build_object('invitation_id',p_invite));END IF;
END $$;
CREATE FUNCTION licensing.workspace_update_member(p_org uuid,p_member uuid,p_role text,p_farms uuid[],p_version uuid,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations; m licensing_private.memberships; farms jsonb;BEGIN
 o:=licensing_private.team_owner(p_org);PERFORM 1 FROM licensing.licenses WHERE id=o.license_id FOR UPDATE;
 IF NOT licensing_private.license_live(o.license_id) THEN RAISE EXCEPTION 'ACTIVE_LICENSE_REQUIRED';END IF;
 IF p_role IS NULL OR p_role NOT IN ('administrator','application_manager','field_monitor') THEN RAISE EXCEPTION 'INVALID_TEAM_ROLE';END IF;
 farms:=licensing_private.validate_team_farms(p_org,p_farms);
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('member_update',p_org,p_member,p_role,farms,p_version)) THEN RETURN;END IF;
 SELECT * INTO m FROM licensing_private.memberships WHERE id=p_member AND organization_id=p_org AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_ACTIVE';END IF;IF m.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'MEMBER_VERSION_CONFLICT';END IF;
 UPDATE licensing_private.memberships SET role=p_role,version=gen_random_uuid() WHERE id=m.id;
 DELETE FROM licensing_private.farm_delegations WHERE membership_id=m.id;
 INSERT INTO licensing_private.farm_delegations(membership_id,farm_id,grant_id) SELECT m.id,(v->>'farm_id')::uuid,(v->>'grant_id')::uuid FROM jsonb_array_elements(farms) v;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(o.license_id,auth.uid(),'team_member_updated',jsonb_build_object('member_id',m.id,'before_role',m.role,'after_role',p_role,'farms',farms));
END $$;
CREATE FUNCTION licensing.workspace_revoke_consultant(p_org uuid,p_grant uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations;BEGIN
 o:=licensing_private.team_owner(p_org,false);PERFORM 1 FROM licensing.licenses WHERE id=o.license_id FOR UPDATE;
 UPDATE licensing_private.farm_consultants SET revoked_at=now() WHERE id=p_grant AND farm_id=p_org AND revoked_at IS NULL;
 IF FOUND THEN INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(o.license_id,auth.uid(),'consultant_revoked',jsonb_build_object('grant_id',p_grant));END IF;
END $$;
CREATE FUNCTION licensing.workspace_mark_delivery(p_invite uuid,p_sent boolean) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ UPDATE licensing_private.team_invitations SET delivery=CASE WHEN p_sent THEN 'sent' ELSE 'failed' END WHERE id=p_invite AND delivery<>'sent' $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA licensing_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION licensing.workspace_initialize(uuid,uuid),licensing.workspace_available_farms(uuid),licensing.workspace_invite(uuid,text,text,uuid[],uuid,text,uuid),licensing.workspace_consultancies(uuid,text),licensing.invitation_preview(uuid,text),licensing.workspace_accept(uuid,uuid),licensing.workspace_home(),licensing.workspace_team(uuid),licensing.workspace_revoke_invite(uuid,uuid),licensing.workspace_update_member(uuid,uuid,text,uuid[],uuid,uuid),licensing.workspace_revoke_consultant(uuid,uuid),licensing.workspace_mark_delivery(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.workspace_initialize(uuid,uuid),licensing.workspace_available_farms(uuid),licensing.workspace_invite(uuid,text,text,uuid[],uuid,text,uuid),licensing.workspace_consultancies(uuid,text),licensing.workspace_accept(uuid,uuid),licensing.workspace_home(),licensing.workspace_team(uuid),licensing.workspace_revoke_invite(uuid,uuid),licensing.workspace_update_member(uuid,uuid,text,uuid[],uuid,uuid),licensing.workspace_revoke_consultant(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION licensing.invitation_preview(uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION licensing.workspace_mark_delivery(uuid,boolean) TO service_role;
COMMIT;
