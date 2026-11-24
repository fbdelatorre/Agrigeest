-- Etapa local: cada instalação autorizada ocupa uma vaga. Sem bloqueios operacionais.
BEGIN;
CREATE TABLE licensing_private.devices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),license_id uuid NOT NULL REFERENCES licensing.licenses(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),installation_id uuid NOT NULL,secret_hash bytea NOT NULL,
 session_id uuid NOT NULL,label text NOT NULL CHECK(length(btrim(label)) BETWEEN 2 AND 80),
 created_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),revoked_at timestamptz,
 UNIQUE(license_id,user_id,installation_id));
CREATE UNIQUE INDEX one_device_per_session ON licensing_private.devices(license_id,user_id,session_id) WHERE revoked_at IS NULL;
ALTER TABLE licensing_private.devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing_private.devices FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION licensing_private.device_owner(p_license uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM licensing.licenses l JOIN auth.users u ON u.id=l.owner_id WHERE l.id=p_license AND l.owner_id=auth.uid() AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT (SELECT test_mode FROM licensing.licenses WHERE id=p_license) THEN RAISE EXCEPTION 'DEVICE_STAGE_SANDBOX_ONLY';END IF;
 RETURN auth.uid();
END $$;

CREATE FUNCTION licensing.owner_devices(p_license uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; items jsonb; used integer; cap integer;BEGIN
 PERFORM licensing_private.device_owner(p_license);
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license;
 cap:=CASE WHEN l.kind='farm' THEN 6 ELSE 5 END+2*l.extras;
 SELECT count(*) INTO used FROM licensing_private.devices WHERE license_id=p_license AND revoked_at IS NULL;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'label',label,'created_at',created_at,'last_seen_at',last_seen_at,'revoked_at',revoked_at) ORDER BY (revoked_at IS NULL) DESC,created_at DESC),'[]'::jsonb) INTO items FROM (SELECT * FROM licensing_private.devices WHERE license_id=p_license ORDER BY (revoked_at IS NULL) DESC,created_at DESC LIMIT 500) recent;
 RETURN jsonb_build_object('limit',cap,'used',used,'active',licensing.is_active(p_license),'devices',items);
END $$;

CREATE FUNCTION licensing.register_device(p_license uuid,p_installation uuid,p_secret text,p_label text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; sid uuid; l licensing.licenses; d licensing_private.devices; cap integer; used integer; result uuid;BEGIN
 actor:=licensing_private.device_owner(p_license);
 IF p_installation IS NULL OR p_secret IS NULL OR p_secret!~'^[a-f0-9]{64}$' OR p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'INVALID_DEVICE';END IF;
 IF COALESCE(auth.jwt()->>'session_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'DEVICE_SESSION_REQUIRED';END IF;
 sid:=(auth.jwt()->>'session_id')::uuid;
 -- A mesma trava é usada pelas alterações de adicionais e cancelamento.
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT licensing.is_active(p_license) THEN RAISE EXCEPTION 'ACTIVE_LICENSE_REQUIRED';END IF;
 SELECT * INTO d FROM licensing_private.devices WHERE license_id=p_license AND user_id=actor AND installation_id=p_installation;
 IF FOUND AND d.secret_hash IS DISTINCT FROM sha256(convert_to(p_secret,'UTF8')) THEN RAISE EXCEPTION 'DEVICE_PROOF_REQUIRED' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM licensing_private.devices WHERE license_id=p_license AND user_id=actor AND session_id=sid AND revoked_at IS NULL AND installation_id<>p_installation) THEN RAISE EXCEPTION 'DEVICE_SESSION_ALREADY_REGISTERED';END IF;
 cap:=CASE WHEN l.kind='farm' THEN 6 ELSE 5 END+2*l.extras;
 SELECT count(*) INTO used FROM licensing_private.devices WHERE license_id=p_license AND revoked_at IS NULL;
 IF (d.id IS NULL OR d.revoked_at IS NOT NULL) AND used>=cap THEN RAISE EXCEPTION 'DEVICE_LIMIT_REACHED';END IF;
 IF d.id IS NOT NULL AND d.revoked_at IS NULL THEN
  UPDATE licensing_private.devices SET session_id=sid,label=btrim(p_label),last_seen_at=now() WHERE id=d.id;
  RETURN d.id;
 END IF;
 INSERT INTO licensing_private.devices(license_id,user_id,installation_id,secret_hash,session_id,label)
 VALUES(p_license,actor,p_installation,sha256(convert_to(p_secret,'UTF8')),sid,btrim(p_label))
 ON CONFLICT(license_id,user_id,installation_id) DO UPDATE SET session_id=EXCLUDED.session_id,label=EXCLUDED.label,last_seen_at=now(),revoked_at=NULL RETURNING id INTO result;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(p_license,actor,'device_authorized',jsonb_build_object('device_id',result));
 RETURN result;
END $$;

CREATE FUNCTION licensing.revoke_device(p_license uuid,p_device uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;BEGIN
 actor:=licensing_private.device_owner(p_license);
 PERFORM 1 FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 UPDATE licensing_private.devices SET revoked_at=now() WHERE license_id=p_license AND id=p_device AND revoked_at IS NULL;
 IF FOUND THEN INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(p_license,actor,'device_revoked',jsonb_build_object('device_id',p_device));
 ELSIF NOT EXISTS(SELECT 1 FROM licensing_private.devices WHERE license_id=p_license AND id=p_device) THEN RAISE EXCEPTION 'DEVICE_NOT_FOUND';END IF;
END $$;

CREATE FUNCTION licensing.device_access(p_license uuid,p_installation uuid,p_secret text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; cap integer;BEGIN
 PERFORM licensing_private.device_owner(p_license);
 IF p_secret IS NULL OR p_secret!~'^[a-f0-9]{64}$' OR NOT licensing.is_active(p_license) THEN RETURN false;END IF;
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license;
 cap:=CASE WHEN l.kind='farm' THEN 6 ELSE 5 END+2*l.extras;
 IF (SELECT count(*) FROM licensing_private.devices WHERE license_id=p_license AND revoked_at IS NULL)>cap THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM licensing_private.devices WHERE license_id=p_license AND user_id=auth.uid() AND installation_id=p_installation AND secret_hash=sha256(convert_to(p_secret,'UTF8')) AND session_id::text=auth.jwt()->>'session_id' AND revoked_at IS NULL);
END $$;
REVOKE ALL ON FUNCTION licensing_private.device_owner(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION licensing.owner_devices(uuid),licensing.register_device(uuid,uuid,text,text),licensing.revoke_device(uuid,uuid),licensing.device_access(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.owner_devices(uuid),licensing.register_device(uuid,uuid,text,text),licensing.revoke_device(uuid,uuid),licensing.device_access(uuid,uuid,text) TO authenticated;
COMMIT;
