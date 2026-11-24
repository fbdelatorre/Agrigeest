BEGIN;
GRANT USAGE ON SCHEMA licensing TO anon;
CREATE OR REPLACE FUNCTION licensing.workspace_update_member(p_org uuid,p_member uuid,p_role text,p_farms uuid[],p_version uuid,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations; m licensing_private.memberships; farms jsonb; old_farms jsonb;BEGIN
 o:=licensing_private.team_owner(p_org);PERFORM 1 FROM licensing.licenses WHERE id=o.license_id FOR UPDATE;
 IF NOT licensing_private.license_live(o.license_id) THEN RAISE EXCEPTION 'ACTIVE_LICENSE_REQUIRED';END IF;
 IF p_role IS NULL OR p_role NOT IN ('administrator','application_manager','field_monitor') THEN RAISE EXCEPTION 'INVALID_TEAM_ROLE';END IF;
 farms:=licensing_private.validate_team_farms(p_org,p_farms);
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('member_update',p_org,p_member,p_role,farms,p_version)) THEN RETURN;END IF;
 SELECT * INTO m FROM licensing_private.memberships WHERE id=p_member AND organization_id=p_org AND revoked_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_ACTIVE';END IF;IF m.version IS DISTINCT FROM p_version THEN RAISE EXCEPTION 'MEMBER_VERSION_CONFLICT';END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('farm_id',farm_id,'grant_id',grant_id)),'[]') INTO old_farms FROM licensing_private.farm_delegations WHERE membership_id=m.id;
 UPDATE licensing_private.memberships SET role=p_role,version=gen_random_uuid() WHERE id=m.id;
 DELETE FROM licensing_private.farm_delegations WHERE membership_id=m.id;
 INSERT INTO licensing_private.farm_delegations(membership_id,farm_id,grant_id) SELECT m.id,(v->>'farm_id')::uuid,(v->>'grant_id')::uuid FROM jsonb_array_elements(farms) v;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(o.license_id,auth.uid(),'team_member_updated',jsonb_build_object('member_id',m.id,'before_role',m.role,'after_role',p_role,'before_farms',old_farms,'farms',farms));
END $$;
CREATE OR REPLACE FUNCTION licensing.workspace_remove_member(p_org uuid,p_member uuid,p_cancel_extra boolean,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o licensing_private.organizations; m licensing_private.memberships; l licensing.licenses; q jsonb; change_id uuid; billing_error boolean:=false;BEGIN
 o:=licensing_private.team_owner(p_org,false);SELECT * INTO l FROM licensing.licenses WHERE id=o.license_id FOR UPDATE;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('member_remove',p_org,p_member,p_cancel_extra)) THEN RETURN (SELECT details||jsonb_build_object('removed',true,'repeat',true) FROM licensing.events WHERE license_id=o.license_id AND action='team_member_removed' AND details->>'request_id'=p_request::text LIMIT 1);END IF;
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
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(l.id,auth.uid(),'team_member_removed',jsonb_build_object('request_id',p_request,'member_id',m.id,'cancel_extra',p_cancel_extra,'change_id',change_id,'billing_requested',change_id IS NOT NULL,'billing_error',billing_error));
 RETURN jsonb_build_object('removed',true,'billing_requested',change_id IS NOT NULL,'billing_error',billing_error);
END $$;

COMMIT;
