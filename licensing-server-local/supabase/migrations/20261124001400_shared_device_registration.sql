-- Amplia somente o cadastro/consulta do próprio aparelho a membros ativos.
BEGIN;
CREATE OR REPLACE FUNCTION licensing.register_device(p_license uuid,p_installation uuid,p_secret text,p_label text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; sid uuid; l licensing.licenses; d licensing_private.devices; cap integer; used integer; result uuid;BEGIN
 actor:=licensing_private.device_actor(p_license);
 IF p_installation IS NULL OR p_secret IS NULL OR p_secret!~'^[a-f0-9]{64}$' OR p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'INVALID_DEVICE';END IF;
 IF COALESCE(auth.jwt()->>'session_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'DEVICE_SESSION_REQUIRED';END IF;
 sid:=(auth.jwt()->>'session_id')::uuid;
 -- A mesma trava é usada pelas alterações de adicionais e cancelamento.
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT licensing_private.license_live(p_license) THEN RAISE EXCEPTION 'ACTIVE_LICENSE_REQUIRED';END IF;
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

CREATE OR REPLACE FUNCTION licensing.device_access(p_license uuid,p_installation uuid,p_secret text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; cap integer;BEGIN
 PERFORM licensing_private.device_actor(p_license);
 IF p_secret IS NULL OR p_secret!~'^[a-f0-9]{64}$' OR NOT licensing_private.license_live(p_license) THEN RETURN false;END IF;
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license;
 cap:=CASE WHEN l.kind='farm' THEN 6 ELSE 5 END+2*l.extras;
 IF (SELECT count(*) FROM licensing_private.devices WHERE license_id=p_license AND revoked_at IS NULL)>cap THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM licensing_private.devices WHERE license_id=p_license AND user_id=auth.uid() AND installation_id=p_installation AND secret_hash=sha256(convert_to(p_secret,'UTF8')) AND session_id::text=auth.jwt()->>'session_id' AND revoked_at IS NULL);
END $$;

COMMIT;
