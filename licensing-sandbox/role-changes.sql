-- Somente laboratorio ficticio. Nao aplicar no Supabase.
DO $$ BEGIN
 IF current_setting('agrigest.licensing_sandbox',true) IS DISTINCT FROM 'synthetic-only-v1' THEN RAISE EXCEPTION 'SANDBOX_MARKER_REQUIRED'; END IF;
END $$;
CREATE FUNCTION license_lab.change_staff_role(p_scope text,p_target uuid,p_user uuid,p_role text,p_request uuid,p_expected text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_role text; plan_id uuid; BEGIN
 IF p_role IS NULL OR p_role NOT IN ('admin','operator','monitor') THEN RAISE EXCEPTION 'COMPANY_STAFF_ROLES_ONLY'; END IF;
 IF p_scope='farm' THEN
  PERFORM 1 FROM license_lab.farms WHERE id=p_target FOR UPDATE;
  IF license_lab.role_at(p_target) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'OWNER_REQUIRED'; END IF;
  SELECT id INTO plan_id FROM license_lab.subscriptions WHERE farm_id=p_target FOR UPDATE;
  IF NOT license_lab.writable(p_target) THEN RAISE EXCEPTION 'READ_ONLY_LICENSE'; END IF;
 ELSIF p_scope='company' THEN
  SELECT id INTO plan_id FROM license_lab.subscriptions WHERE consultant_id=p_target FOR UPDATE;
  IF p_target IS DISTINCT FROM license_lab.actor() OR license_lab.company_role(p_target) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'COMPANY_OWNER_REQUIRED'; END IF;
  IF NOT license_lab.entitled(plan_id) THEN RAISE EXCEPTION 'READ_ONLY_LICENSE'; END IF;
 ELSE RAISE EXCEPTION 'INVALID_SCOPE'; END IF;
 IF NOT license_lab.request_once(p_request,jsonb_build_array('role_change',p_scope,p_target,p_user,p_role,p_expected)) THEN RETURN; END IF;
 IF p_scope='farm' THEN
  SELECT role INTO old_role FROM license_lab.memberships WHERE farm_id=p_target AND user_id=p_user AND active FOR UPDATE;
 ELSE
  SELECT role INTO old_role FROM license_lab.company_members WHERE company_owner=p_target AND user_id=p_user AND active FOR UPDATE;
 END IF;
 IF old_role IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
 IF old_role='owner' THEN RAISE EXCEPTION 'OWNER_IMMUTABLE'; END IF;
 IF old_role NOT IN ('admin','operator','monitor') THEN RAISE EXCEPTION 'STAFF_ROLE_REQUIRED'; END IF;
 IF p_expected IS DISTINCT FROM old_role THEN RAISE EXCEPTION 'ROLE_CHANGED_RELOAD'; END IF;
 IF p_role=old_role THEN RETURN; END IF;
 IF p_scope='farm' THEN
  UPDATE license_lab.memberships SET role=p_role WHERE farm_id=p_target AND user_id=p_user;
 ELSE
  UPDATE license_lab.company_members SET role=p_role WHERE company_owner=p_target AND user_id=p_user;
 END IF;
 INSERT INTO license_lab.license_events(subscription_id,actor_id,action,details)
 VALUES(plan_id,license_lab.actor(),'staff_role_changed',jsonb_build_object('scope',p_scope,'user',p_user,'previous_role',old_role,'new_role',p_role));
END $$;
REVOKE ALL ON FUNCTION license_lab.change_staff_role(text,uuid,uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION license_lab.change_staff_role(text,uuid,uuid,text,uuid,text) TO license_lab_client;
