BEGIN;
CREATE TABLE licensing_private.device_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),license_id uuid NOT NULL REFERENCES licensing.licenses(id),user_id uuid NOT NULL REFERENCES auth.users(id),
 membership_id uuid NOT NULL REFERENCES licensing_private.memberships(id),installation_id uuid NOT NULL,secret_hash bytea NOT NULL,session_id uuid NOT NULL,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 2 AND 80),version uuid NOT NULL DEFAULT gen_random_uuid(),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','approved','rejected')),created_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz,reviewed_by uuid REFERENCES auth.users(id),device_id uuid REFERENCES licensing_private.devices(id));
CREATE UNIQUE INDEX one_pending_device_request ON licensing_private.device_requests(license_id,user_id,installation_id) WHERE state='pending';
ALTER TABLE licensing_private.device_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing_private.device_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION licensing_private.device_was_approved(p_device uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM licensing_private.devices d JOIN licensing.licenses l ON l.id=d.license_id WHERE d.id=p_device AND
 (d.user_id=l.owner_id OR EXISTS(SELECT 1 FROM licensing_private.device_requests r JOIN licensing_private.memberships m ON m.id=r.membership_id
 JOIN licensing_private.organizations o ON o.id=m.organization_id WHERE r.device_id=d.id AND r.state='approved' AND r.reviewed_by=l.owner_id
 AND r.user_id=d.user_id AND m.user_id=d.user_id AND m.revoked_at IS NULL AND o.license_id=l.id)))
$$;
CREATE OR REPLACE FUNCTION licensing_private.session_device(p_license uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM licensing_private.devices d WHERE d.license_id=p_license AND d.user_id=auth.uid() AND d.revoked_at IS NULL
 AND d.session_id::text=auth.jwt()->>'session_id' AND licensing_private.device_was_approved(d.id)) AND
 (SELECT count(*) FROM licensing_private.devices WHERE license_id=p_license AND revoked_at IS NULL)<=(SELECT(CASE WHEN kind='farm' THEN 6 ELSE 5 END)+2*extras FROM licensing.licenses WHERE id=p_license)
$$;

ALTER FUNCTION licensing.register_device(uuid,uuid,text,text) RENAME TO register_device_before_owner_approval;
ALTER FUNCTION licensing.register_device_before_owner_approval(uuid,uuid,text,text) SET SCHEMA licensing_private;
REVOKE ALL ON FUNCTION licensing_private.register_device_before_owner_approval(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION licensing.register_device(p_license uuid,p_installation uuid,p_secret text,p_label text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM licensing_private.device_owner(p_license);RETURN licensing_private.register_device_before_owner_approval(p_license,p_installation,p_secret,p_label);END $$;

CREATE FUNCTION licensing.request_device(p_license uuid,p_installation uuid,p_secret text,p_label text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;sid uuid;member_id uuid;l licensing.licenses;d licensing_private.devices;r licensing_private.device_requests;BEGIN
 actor:=licensing_private.device_actor(p_license);
 IF p_installation IS NULL OR p_secret IS NULL OR p_secret!~'^[a-f0-9]{64}$' OR p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'INVALID_DEVICE';END IF;
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT licensing_private.license_live(p_license) THEN RAISE EXCEPTION 'ACTIVE_LICENSE_REQUIRED';END IF;
 IF actor=l.owner_id THEN RAISE EXCEPTION 'OWNER_USE_DEVICE_AUTHORIZATION';END IF;
 SELECT m.id INTO member_id FROM licensing_private.memberships m JOIN licensing_private.organizations o ON o.id=m.organization_id WHERE o.license_id=p_license AND m.user_id=actor AND m.revoked_at IS NULL;
 IF member_id IS NULL THEN RAISE EXCEPTION 'LICENSE_MEMBERSHIP_REQUIRED' USING ERRCODE='42501';END IF;
 sid:=(auth.jwt()->>'session_id')::uuid;
 SELECT * INTO d FROM licensing_private.devices x WHERE x.license_id=p_license AND x.user_id=actor AND x.installation_id=p_installation FOR UPDATE;
 IF d.id IS NOT NULL AND d.secret_hash IS DISTINCT FROM sha256(convert_to(p_secret,'UTF8')) THEN RAISE EXCEPTION 'DEVICE_PROOF_REQUIRED' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM licensing_private.devices x WHERE x.license_id=p_license AND x.user_id=actor AND x.session_id=sid AND x.revoked_at IS NULL AND x.installation_id<>p_installation) THEN RAISE EXCEPTION 'DEVICE_SESSION_ALREADY_REGISTERED';END IF;
 -- Retomar uma instalação já aprovada não cria autorização ou vaga nova.
 IF d.id IS NOT NULL AND d.revoked_at IS NULL AND licensing_private.device_was_approved(d.id) THEN
  UPDATE licensing_private.devices SET session_id=sid,label=btrim(p_label),last_seen_at=now() WHERE id=d.id;
  RETURN jsonb_build_object('state','authorized','device_id',d.id);
 END IF;
 SELECT * INTO r FROM licensing_private.device_requests x WHERE x.license_id=p_license AND x.user_id=actor AND x.installation_id=p_installation AND x.state='pending' FOR UPDATE;
 IF r.id IS NOT NULL THEN
  IF r.secret_hash IS DISTINCT FROM sha256(convert_to(p_secret,'UTF8')) THEN RAISE EXCEPTION 'DEVICE_PROOF_REQUIRED' USING ERRCODE='42501';END IF;
  IF r.session_id<>sid OR r.label<>btrim(p_label) OR r.membership_id<>member_id THEN UPDATE licensing_private.device_requests SET session_id=sid,label=btrim(p_label),membership_id=member_id,version=gen_random_uuid() WHERE id=r.id RETURNING * INTO r;END IF;
 ELSE
  IF(SELECT count(*) FROM licensing_private.device_requests WHERE license_id=p_license AND state='pending')>=10+2*((CASE WHEN l.kind='farm' THEN 6 ELSE 5 END)+2*l.extras) THEN RAISE EXCEPTION 'DEVICE_REQUEST_LIMIT_REACHED';END IF;
  INSERT INTO licensing_private.device_requests(license_id,user_id,membership_id,installation_id,secret_hash,session_id,label) VALUES(p_license,actor,member_id,p_installation,sha256(convert_to(p_secret,'UTF8')),sid,btrim(p_label)) RETURNING * INTO r;
  INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(p_license,actor,'device_approval_requested',jsonb_build_object('request_id',r.id));
 END IF;
 RETURN jsonb_build_object('state','pending','request_id',r.id,'version',r.version);
END $$;

CREATE FUNCTION licensing.review_device_request(p_request uuid,p_version uuid,p_approve boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r licensing_private.device_requests;d licensing_private.devices;l licensing.licenses;result uuid;cap integer;BEGIN
 SELECT * INTO r FROM licensing_private.device_requests WHERE id=p_request;
 IF r.id IS NULL THEN RAISE EXCEPTION 'DEVICE_REQUEST_UNAVAILABLE';END IF;
 PERFORM licensing_private.device_owner(r.license_id);
 SELECT * INTO l FROM licensing.licenses WHERE id=r.license_id FOR UPDATE;
 SELECT * INTO r FROM licensing_private.device_requests WHERE id=p_request FOR UPDATE;
 IF r.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'DEVICE_REQUEST_CHANGED';END IF;
 IF p_approve IS NULL THEN RAISE EXCEPTION 'INVALID_DEVICE_REQUEST';END IF;
 IF r.state='approved' AND p_approve THEN RETURN r.device_id;END IF;
 IF r.state='rejected' AND NOT p_approve THEN RETURN NULL;END IF;
 IF r.state<>'pending' THEN RAISE EXCEPTION 'DEVICE_REQUEST_UNAVAILABLE';END IF;
 IF NOT p_approve THEN
  UPDATE licensing_private.device_requests SET state='rejected',reviewed_at=now(),reviewed_by=auth.uid() WHERE id=r.id;
  INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(l.id,auth.uid(),'device_request_rejected',jsonb_build_object('request_id',r.id));RETURN NULL;
 END IF;
 IF NOT licensing_private.license_live(l.id) THEN RAISE EXCEPTION 'ACTIVE_LICENSE_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM licensing_private.memberships m JOIN licensing_private.organizations o ON o.id=m.organization_id JOIN auth.users u ON u.id=m.user_id WHERE m.id=r.membership_id AND m.user_id=r.user_id AND m.revoked_at IS NULL AND o.license_id=l.id AND u.email_confirmed_at IS NOT NULL AND(u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'LICENSE_MEMBERSHIP_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.id=r.session_id AND s.user_id=r.user_id AND(s.not_after IS NULL OR s.not_after>now())) THEN RAISE EXCEPTION 'DEVICE_REQUEST_SESSION_EXPIRED';END IF;
 SELECT * INTO d FROM licensing_private.devices x WHERE x.license_id=l.id AND x.user_id=r.user_id AND x.installation_id=r.installation_id FOR UPDATE;
 IF d.id IS NOT NULL AND d.secret_hash IS DISTINCT FROM r.secret_hash THEN RAISE EXCEPTION 'DEVICE_PROOF_REQUIRED' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM licensing_private.devices x WHERE x.license_id=l.id AND x.user_id=r.user_id AND x.session_id=r.session_id AND x.revoked_at IS NULL AND x.installation_id<>r.installation_id) THEN RAISE EXCEPTION 'DEVICE_SESSION_ALREADY_REGISTERED';END IF;
 cap:=(CASE WHEN l.kind='farm' THEN 6 ELSE 5 END)+2*l.extras;
 IF(d.id IS NULL OR d.revoked_at IS NOT NULL) AND(SELECT count(*) FROM licensing_private.devices WHERE license_id=l.id AND revoked_at IS NULL)>=cap THEN RAISE EXCEPTION 'DEVICE_LIMIT_REACHED';END IF;
 INSERT INTO licensing_private.devices(license_id,user_id,installation_id,secret_hash,session_id,label) VALUES(l.id,r.user_id,r.installation_id,r.secret_hash,r.session_id,r.label)
 ON CONFLICT(license_id,user_id,installation_id) DO UPDATE SET session_id=EXCLUDED.session_id,label=EXCLUDED.label,last_seen_at=now(),revoked_at=NULL RETURNING id INTO result;
 UPDATE licensing_private.device_requests SET state='approved',reviewed_at=now(),reviewed_by=auth.uid(),device_id=result WHERE id=r.id;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(l.id,auth.uid(),'device_request_approved',jsonb_build_object('request_id',r.id,'device_id',result,'user_id',r.user_id));RETURN result;
END $$;

CREATE FUNCTION licensing_private.visible_device_requests(p_license uuid,p_own boolean) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',r.id,'label',r.label,'version',r.version,'state',r.state,'created_at',r.created_at,'user_email',u.email,
 'user_name',COALESCE(NULLIF(btrim(concat_ws(' ',to_jsonb(u)->'raw_user_meta_data'->>'first_name',to_jsonb(u)->'raw_user_meta_data'->>'last_name')),''),NULLIF(btrim(to_jsonb(u)->'raw_user_meta_data'->>'full_name'),''))) ORDER BY(r.state='pending') DESC,r.created_at DESC),'[]')
 FROM(SELECT * FROM licensing_private.device_requests WHERE license_id=p_license AND(NOT p_own OR user_id=auth.uid()) ORDER BY(state='pending') DESC,created_at DESC LIMIT 500)r LEFT JOIN auth.users u ON u.id=r.user_id
$$;
ALTER FUNCTION licensing.owner_devices(uuid) RENAME TO owner_devices_before_approval;
ALTER FUNCTION licensing.owner_devices_before_approval(uuid) SET SCHEMA licensing_private;
ALTER FUNCTION licensing.my_devices(uuid) RENAME TO my_devices_before_approval;
ALTER FUNCTION licensing.my_devices_before_approval(uuid) SET SCHEMA licensing_private;
REVOKE ALL ON FUNCTION licensing_private.owner_devices_before_approval(uuid),licensing_private.my_devices_before_approval(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION licensing.owner_devices(p_license uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE result jsonb;devices jsonb;BEGIN result:=licensing_private.owner_devices_before_approval(p_license);SELECT COALESCE(jsonb_agg(x.item||jsonb_build_object('owner_approved',licensing_private.device_was_approved((x.item->>'id')::uuid)) ORDER BY x.ord),'[]') INTO devices FROM jsonb_array_elements(result->'devices') WITH ORDINALITY x(item,ord);RETURN result||jsonb_build_object('devices',devices,'requests',licensing_private.visible_device_requests(p_license,false));END $$;
CREATE FUNCTION licensing.my_devices(p_license uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE result jsonb;devices jsonb;BEGIN result:=licensing_private.my_devices_before_approval(p_license);SELECT COALESCE(jsonb_agg(x.item||jsonb_build_object('owner_approved',licensing_private.device_was_approved((x.item->>'id')::uuid)) ORDER BY x.ord),'[]') INTO devices FROM jsonb_array_elements(result->'devices') WITH ORDINALITY x(item,ord);RETURN result||jsonb_build_object('devices',devices,'requests',licensing_private.visible_device_requests(p_license,true));END $$;
CREATE OR REPLACE FUNCTION licensing.device_access(p_license uuid,p_installation uuid,p_secret text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM licensing_private.device_actor(p_license);IF p_secret IS NULL OR p_secret!~'^[a-f0-9]{64}$' OR NOT licensing_private.license_live(p_license) OR NOT licensing_private.session_device(p_license) THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM licensing_private.devices d WHERE d.license_id=p_license AND d.user_id=auth.uid() AND d.installation_id=p_installation AND d.secret_hash=sha256(convert_to(p_secret,'UTF8')) AND d.session_id::text=auth.jwt()->>'session_id' AND d.revoked_at IS NULL AND licensing_private.device_was_approved(d.id));END $$;
CREATE OR REPLACE FUNCTION licensing.revoke_my_device(p_license uuid,p_device uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN PERFORM licensing_private.device_owner(p_license);PERFORM licensing.revoke_device(p_license,p_device);END $$;
REVOKE ALL ON FUNCTION licensing_private.device_was_approved(uuid),licensing_private.visible_device_requests(uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION licensing.register_device(uuid,uuid,text,text),licensing.request_device(uuid,uuid,text,text),licensing.review_device_request(uuid,uuid,boolean),licensing.owner_devices(uuid),licensing.my_devices(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.register_device(uuid,uuid,text,text),licensing.request_device(uuid,uuid,text,text),licensing.review_device_request(uuid,uuid,boolean),licensing.owner_devices(uuid),licensing.my_devices(uuid) TO authenticated;
COMMIT;
