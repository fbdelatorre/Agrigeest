BEGIN;
CREATE FUNCTION licensing_private.device_actor(p_license uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 BEGIN PERFORM licensing_private.team_actor();EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'DEVICE_SESSION_REQUIRED' USING ERRCODE='42501';END;
 IF NOT EXISTS(SELECT 1 FROM licensing.licenses l WHERE l.id=p_license AND (l.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM licensing_private.organizations o JOIN licensing_private.memberships m ON m.organization_id=o.id WHERE o.license_id=l.id AND m.user_id=auth.uid() AND m.revoked_at IS NULL))) THEN RAISE EXCEPTION 'LICENSE_MEMBERSHIP_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT (SELECT test_mode FROM licensing.licenses WHERE id=p_license) THEN RAISE EXCEPTION 'DEVICE_STAGE_SANDBOX_ONLY';END IF;RETURN auth.uid();
END $$;
CREATE FUNCTION licensing.my_devices(p_license uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; result jsonb;BEGIN
 PERFORM licensing_private.device_actor(p_license);SELECT * INTO l FROM licensing.licenses WHERE id=p_license;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'label',label,'created_at',created_at,'last_seen_at',last_seen_at,'revoked_at',revoked_at) ORDER BY created_at DESC),'[]') INTO result FROM (SELECT * FROM licensing_private.devices WHERE license_id=p_license AND user_id=auth.uid() ORDER BY (revoked_at IS NULL) DESC,created_at DESC LIMIT 500) d;
 RETURN jsonb_build_object('limit',(CASE WHEN l.kind='farm' THEN 6 ELSE 5 END)+2*l.extras,'used',(SELECT count(*) FROM licensing_private.devices WHERE license_id=p_license AND revoked_at IS NULL),'active',licensing_private.license_live(p_license),'devices',result);
END $$;
CREATE FUNCTION licensing_private.session_device(p_license uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM licensing_private.devices WHERE license_id=p_license AND user_id=auth.uid() AND revoked_at IS NULL AND session_id::text=auth.jwt()->>'session_id') AND
 (SELECT count(*) FROM licensing_private.devices WHERE license_id=p_license AND revoked_at IS NULL)<=(SELECT (CASE WHEN kind='farm' THEN 6 ELSE 5 END)+2*extras FROM licensing.licenses WHERE id=p_license)
$$;
CREATE FUNCTION licensing.revoke_my_device(p_license uuid,p_device uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM licensing_private.device_actor(p_license);PERFORM 1 FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 UPDATE licensing_private.devices SET revoked_at=now() WHERE id=p_device AND license_id=p_license AND user_id=auth.uid() AND revoked_at IS NULL;
 IF FOUND THEN INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(p_license,auth.uid(),'device_revoked',jsonb_build_object('device_id',p_device));
 ELSIF NOT EXISTS(SELECT 1 FROM licensing_private.devices WHERE id=p_device AND license_id=p_license AND user_id=auth.uid()) THEN RAISE EXCEPTION 'DEVICE_NOT_FOUND';END IF;
END $$;
CREATE FUNCTION licensing.workspace_can(p_farm uuid,p_module text,p_write boolean DEFAULT false,p_author uuid DEFAULT NULL) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE f licensing_private.organizations; path record; allowed boolean; live boolean;BEGIN
 BEGIN BEGIN PERFORM licensing_private.team_actor();EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'DEVICE_SESSION_REQUIRED' USING ERRCODE='42501';END;EXCEPTION WHEN insufficient_privilege THEN RETURN false;END;
 IF p_module IS NULL OR p_module NOT IN ('areas','maps','inventory','operations','maintenance','monitoring','recommendations','rainfall','precision') OR p_write IS NULL THEN RETURN false;END IF;
 SELECT * INTO f FROM licensing_private.organizations WHERE id=p_farm AND kind='farm';IF NOT FOUND THEN RETURN false;END IF;
 FOR path IN
  SELECT f.license_id AS license_id,CASE WHEN f.owner_id=auth.uid() THEN 'owner' ELSE m.role END AS role,false AS consulting
   FROM (SELECT 1) a LEFT JOIN licensing_private.memberships m ON m.organization_id=f.id AND m.user_id=auth.uid() AND m.revoked_at IS NULL WHERE f.owner_id=auth.uid() OR m.id IS NOT NULL
  UNION ALL
  SELECT c.license_id,CASE WHEN c.owner_id=auth.uid() THEN 'consultant' ELSE m.role END,true
   FROM licensing_private.organizations c LEFT JOIN licensing_private.memberships m ON m.organization_id=c.id AND m.user_id=auth.uid() AND m.revoked_at IS NULL
   LEFT JOIN licensing_private.farm_consultants g ON g.farm_id=f.id AND g.consultancy_id=c.id AND g.revoked_at IS NULL
   WHERE c.kind='consultancy' AND (c.owner_id=auth.uid() OR m.id IS NOT NULL) AND (f.owner_id=c.owner_id OR g.id IS NOT NULL)
    AND (c.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM licensing_private.farm_delegations d WHERE d.membership_id=m.id AND d.farm_id=f.id AND (d.grant_id=g.id OR (d.grant_id IS NULL AND f.owner_id=c.owner_id))))
 LOOP
  allowed:=CASE WHEN path.role='field_monitor' THEN p_module IN ('monitoring','rainfall') OR (NOT p_write AND p_module='areas')
    WHEN path.consulting THEN p_module IN ('areas','maps','inventory','operations','monitoring','recommendations','rainfall') AND (NOT p_write OR p_module IN ('monitoring','recommendations','rainfall'))
    ELSE true END;
  IF p_write AND path.role='field_monitor' AND p_author IS NOT NULL AND p_author<>auth.uid() THEN allowed:=false;END IF;
  live:=licensing_private.license_live(f.license_id) AND licensing_private.license_live(path.license_id) AND licensing_private.session_device(path.license_id)
   AND licensing_private.team_used((SELECT id FROM licensing_private.organizations WHERE license_id=path.license_id))<=licensing_private.team_limit(path.license_id);
  IF allowed AND (NOT p_write OR live) THEN RETURN true;END IF;
 END LOOP;RETURN false;
END $$;
CREATE FUNCTION licensing.workspace_farms() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 BEGIN PERFORM licensing_private.team_actor();EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'DEVICE_SESSION_REQUIRED' USING ERRCODE='42501';END;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'read_only',NOT licensing.workspace_can(f.id,'monitoring',true),'operational_linked',f.operational_institution_id IS NOT NULL,
  'permissions',(SELECT jsonb_object_agg(module,jsonb_build_object('read',licensing.workspace_can(f.id,module,false),'write',licensing.workspace_can(f.id,module,true))) FROM unnest(ARRAY['areas','maps','inventory','operations','maintenance','monitoring','recommendations','rainfall','precision']) module)) ORDER BY f.name),'[]') INTO result
 FROM licensing_private.organizations f WHERE f.kind='farm' AND licensing.workspace_can(f.id,'areas',false);
 RETURN result;
END $$;

-- A redução não pode vender/cancelar uma vaga já ocupada ou reservada.
ALTER FUNCTION licensing.request_extra_change(uuid,integer,bigint,uuid) RENAME TO request_extra_change_before_teams;
ALTER FUNCTION licensing.request_extra_change_before_teams(uuid,integer,bigint,uuid) SET SCHEMA licensing_private;
REVOKE ALL ON FUNCTION licensing_private.request_extra_change_before_teams(uuid,integer,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION licensing.request_extra_change(p_license uuid,p_extras integer,p_expected_minor bigint,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations; l licensing.licenses;BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND OR (l.owner_id IS DISTINCT FROM auth.uid() AND NOT licensing.is_platform_admin()) THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM licensing_private.organizations WHERE license_id=p_license;
 IF FOUND AND p_extras IS NOT NULL AND licensing_private.team_used(o.id)>3+p_extras THEN RAISE EXCEPTION 'TEAM_CAPACITY_IN_USE';END IF;
 RETURN licensing_private.request_extra_change_before_teams(p_license,p_extras,p_expected_minor,p_request);
END $$;
CREATE FUNCTION licensing.workspace_remove_member(p_org uuid,p_member uuid,p_cancel_extra boolean,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations; m licensing_private.memberships; l licensing.licenses; q jsonb; change_id uuid; billing_error boolean:=false;BEGIN
 o:=licensing_private.team_owner(p_org,false);SELECT * INTO l FROM licensing.licenses WHERE id=o.license_id FOR UPDATE;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('member_remove',p_org,p_member,p_cancel_extra)) THEN RETURN jsonb_build_object('removed',true,'repeat',true);END IF;
 SELECT * INTO m FROM licensing_private.memberships WHERE id=p_member AND organization_id=p_org AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_ACTIVE';END IF;
 UPDATE licensing_private.memberships SET revoked_at=now(),version=gen_random_uuid() WHERE id=m.id;
 UPDATE licensing_private.devices SET revoked_at=now() WHERE license_id=l.id AND user_id=m.user_id AND revoked_at IS NULL;
 IF p_cancel_extra THEN
  BEGIN
   IF l.extras<=0 OR licensing_private.team_used(o.id)>3+l.extras-1 THEN RAISE EXCEPTION 'EXTRA_STILL_IN_USE';END IF;
   q:=licensing.quote_extras(l.id,l.extras-1);change_id:=licensing.request_extra_change(l.id,l.extras-1,(q->>'amount_minor')::bigint,gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN billing_error:=true;END;
 END IF;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(l.id,auth.uid(),'team_member_removed',jsonb_build_object('member_id',m.id,'cancel_extra',p_cancel_extra,'change_id',change_id,'billing_request_failed',billing_error));
 RETURN jsonb_build_object('removed',true,'billing_requested',change_id IS NOT NULL,'billing_error',billing_error);
END $$;
REVOKE ALL ON FUNCTION licensing_private.device_actor(uuid),licensing_private.session_device(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION licensing.my_devices(uuid),licensing.workspace_can(uuid,text,boolean,uuid),licensing.workspace_farms(),licensing.request_extra_change(uuid,integer,bigint,uuid),licensing.workspace_remove_member(uuid,uuid,boolean,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.my_devices(uuid),licensing.workspace_can(uuid,text,boolean,uuid),licensing.workspace_farms(),licensing.request_extra_change(uuid,integer,bigint,uuid),licensing.workspace_remove_member(uuid,uuid,boolean,uuid) TO authenticated;
REVOKE ALL ON FUNCTION licensing.revoke_my_device(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.revoke_my_device(uuid,uuid) TO authenticated;
COMMIT;
