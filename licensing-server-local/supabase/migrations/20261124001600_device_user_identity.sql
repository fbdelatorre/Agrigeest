-- Retorno aditivo: identifica a conta vinculada à autorização, sem indicar presença online.
BEGIN;
CREATE OR REPLACE FUNCTION licensing.owner_devices(p_license uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; items jsonb; used integer; cap integer;BEGIN
 PERFORM licensing_private.device_owner(p_license);
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license;
 cap:=CASE WHEN l.kind='farm' THEN 6 ELSE 5 END+2*l.extras;
 SELECT count(*) INTO used FROM licensing_private.devices WHERE license_id=p_license AND revoked_at IS NULL;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.id,'label',d.label,'created_at',d.created_at,'last_seen_at',d.last_seen_at,'revoked_at',d.revoked_at,
  'user_email',u.email,'user_name',COALESCE(NULLIF(btrim(concat_ws(' ',to_jsonb(u)->'raw_user_meta_data'->>'first_name',to_jsonb(u)->'raw_user_meta_data'->>'last_name')),''),NULLIF(btrim(to_jsonb(u)->'raw_user_meta_data'->>'full_name'),''),NULLIF(btrim(to_jsonb(u)->'raw_user_meta_data'->>'name'),'')))
  ORDER BY (d.revoked_at IS NULL) DESC,d.created_at DESC),'[]'::jsonb) INTO items
 FROM(SELECT * FROM licensing_private.devices WHERE license_id=p_license ORDER BY (revoked_at IS NULL) DESC,created_at DESC LIMIT 500)d
 LEFT JOIN auth.users u ON u.id=d.user_id;
 RETURN jsonb_build_object('limit',cap,'used',used,'active',licensing.is_active(p_license),'devices',items);
END $$;
CREATE OR REPLACE FUNCTION licensing.my_devices(p_license uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; result jsonb;BEGIN
 PERFORM licensing_private.device_actor(p_license);
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.id,'label',d.label,'created_at',d.created_at,'last_seen_at',d.last_seen_at,'revoked_at',d.revoked_at,
  'user_email',u.email,'user_name',COALESCE(NULLIF(btrim(concat_ws(' ',to_jsonb(u)->'raw_user_meta_data'->>'first_name',to_jsonb(u)->'raw_user_meta_data'->>'last_name')),''),NULLIF(btrim(to_jsonb(u)->'raw_user_meta_data'->>'full_name'),''),NULLIF(btrim(to_jsonb(u)->'raw_user_meta_data'->>'name'),'')))
  ORDER BY d.created_at DESC),'[]'::jsonb) INTO result
 FROM(SELECT * FROM licensing_private.devices WHERE license_id=p_license AND user_id=auth.uid() ORDER BY (revoked_at IS NULL) DESC,created_at DESC LIMIT 500)d
 LEFT JOIN auth.users u ON u.id=d.user_id;
 RETURN jsonb_build_object('limit',(CASE WHEN l.kind='farm' THEN 6 ELSE 5 END)+2*l.extras,'used',(SELECT count(*) FROM licensing_private.devices WHERE license_id=p_license AND revoked_at IS NULL),'active',licensing_private.license_live(p_license),'devices',result);
END $$;
REVOKE ALL ON FUNCTION licensing.owner_devices(uuid),licensing.my_devices(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.owner_devices(uuid),licensing.my_devices(uuid) TO authenticated;
COMMIT;
