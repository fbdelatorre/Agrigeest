-- Servico de controle real: identidade por Supabase Auth, sem contas simuladas.
-- Esta base NAO ativa bloqueios nem modifica tabelas operacionais do AgriGest.
BEGIN;
CREATE SCHEMA licensing;
CREATE SCHEMA licensing_private;
REVOKE ALL ON SCHEMA licensing,licensing_private FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA licensing TO authenticated,service_role;
CREATE TABLE licensing_private.platform_admins(
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),require_mfa boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE licensing.licenses(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES auth.users(id),
 institution_id uuid UNIQUE,label text NOT NULL CHECK(length(btrim(label)) BETWEEN 2 AND 150),
 kind text NOT NULL CHECK(kind IN ('farm','consultancy')),period text NOT NULL CHECK(period IN ('monthly','annual')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','cancelled','reactivation_requested')),
 extras integer NOT NULL DEFAULT 0 CHECK(extras BETWEEN 0 AND 100),amount_minor bigint NOT NULL DEFAULT 0 CHECK(amount_minor BETWEEN 0 AND 1000000000),
 complimentary boolean NOT NULL DEFAULT false,valid_until timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE licensing.payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),license_id uuid NOT NULL REFERENCES licensing.licenses(id),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 1000000000),currency text NOT NULL DEFAULT 'BRL' CHECK(currency='BRL'),
 status text NOT NULL CHECK(status IN ('pending','confirmed','void')),due_on date NOT NULL,paid_on date,
 method text NOT NULL CHECK(method IN ('pix','transfer','cash','card','other')),reference text NOT NULL DEFAULT '',note text NOT NULL DEFAULT '',
 recorded_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),void_reason text,
 CHECK((status='confirmed' AND paid_on IS NOT NULL) OR status<>'confirmed'));
CREATE INDEX payments_license ON licensing.payments(license_id,created_at DESC);
CREATE TABLE licensing.events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),license_id uuid REFERENCES licensing.licenses(id),actor_id uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE licensing_private.requests(id uuid PRIMARY KEY,actor_id uuid NOT NULL,payload jsonb NOT NULL,result uuid);
ALTER TABLE licensing_private.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_private.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing.events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA licensing_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA licensing FROM PUBLIC,anon,authenticated;
GRANT SELECT ON licensing.licenses,licensing.payments,licensing.events TO authenticated;

CREATE FUNCTION licensing.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM licensing_private.platform_admins a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND (NOT a.require_mfa OR auth.jwt()->>'aal'='aal2'))
$$;
CREATE FUNCTION licensing.manager_access() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('authorized',EXISTS(SELECT 1 FROM licensing_private.platform_admins a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=auth.uid() AND u.email_confirmed_at IS NOT NULL),'can_manage',licensing.is_platform_admin())
$$;
CREATE FUNCTION licensing_private.require_admin() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT licensing.is_platform_admin() THEN RAISE EXCEPTION 'PLATFORM_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF; RETURN auth.uid();
END $$;
CREATE FUNCTION licensing_private.request_once(p_id uuid,p_payload jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous licensing_private.requests; BEGIN
 IF p_id IS NULL OR auth.uid() IS NULL THEN RAISE EXCEPTION 'REQUEST_REQUIRED'; END IF;
 INSERT INTO licensing_private.requests(id,actor_id,payload) VALUES(p_id,auth.uid(),p_payload) ON CONFLICT DO NOTHING;
 IF FOUND THEN RETURN true; END IF;
 SELECT * INTO previous FROM licensing_private.requests WHERE id=p_id;
 IF previous.actor_id IS DISTINCT FROM auth.uid() OR previous.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
 RETURN false;
END $$;
CREATE FUNCTION licensing.is_active(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE((SELECT status='active' AND (valid_until IS NULL OR valid_until>now()) FROM licensing.licenses WHERE id=p_id AND (owner_id=auth.uid() OR licensing.is_platform_admin())),false)
$$;
CREATE POLICY license_read ON licensing.licenses FOR SELECT TO authenticated USING(owner_id=auth.uid() OR licensing.is_platform_admin());
CREATE POLICY payment_read ON licensing.payments FOR SELECT TO authenticated USING(licensing.is_platform_admin() OR EXISTS(SELECT 1 FROM licensing.licenses WHERE id=license_id AND owner_id=auth.uid()));
CREATE POLICY event_read ON licensing.events FOR SELECT TO authenticated USING(licensing.is_platform_admin() OR EXISTS(SELECT 1 FROM licensing.licenses WHERE id=license_id AND owner_id=auth.uid()));

CREATE FUNCTION licensing.admin_accounts(p_search text DEFAULT '') RETURNS TABLE(id uuid,email text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_admin();
 RETURN QUERY SELECT u.id,u.email::text FROM auth.users u WHERE u.email_confirmed_at IS NOT NULL AND (p_search='' OR position(lower(p_search) in lower(u.email))>0) ORDER BY u.email LIMIT 50;
END $$;
CREATE FUNCTION licensing.admin_create_license(p_owner uuid,p_label text,p_kind text,p_period text,p_amount bigint,p_extras integer,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; created_id uuid; BEGIN
 actor:=licensing_private.require_admin();
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'VERIFIED_OWNER_REQUIRED'; END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('create',p_owner,p_label,p_kind,p_period,p_amount,p_extras)) THEN SELECT r.result INTO created_id FROM licensing_private.requests r WHERE r.id=p_request;RETURN created_id; END IF;
 INSERT INTO licensing.licenses(owner_id,label,kind,period,amount_minor,extras) VALUES(p_owner,btrim(p_label),p_kind,p_period,p_amount,p_extras) RETURNING id INTO created_id;
 UPDATE licensing_private.requests r SET result=created_id WHERE r.id=p_request;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(created_id,actor,'license_created',jsonb_build_object('owner',p_owner,'kind',p_kind,'status','pending'));
 RETURN created_id;
END $$;
CREATE FUNCTION licensing.admin_set_license(p_id uuid,p_action text,p_until timestamptz,p_reason text,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; before_row licensing.licenses; BEGIN
 actor:=licensing_private.require_admin();
 SELECT * INTO before_row FROM licensing.licenses WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason))<3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('license_action',p_id,p_action,p_until,p_reason)) THEN RETURN; END IF;
 IF p_action='grant_free' THEN
  IF p_until IS NOT NULL AND p_until<=now() THEN RAISE EXCEPTION 'FUTURE_DATE_REQUIRED'; END IF;
  UPDATE licensing.licenses SET complimentary=true,valid_until=p_until,status='active',updated_at=now() WHERE id=p_id;
 ELSIF p_action='revoke_free' THEN
  UPDATE licensing.licenses SET complimentary=false,status='cancelled',updated_at=now() WHERE id=p_id;
 ELSIF p_action='cancel' THEN UPDATE licensing.licenses SET status='cancelled',updated_at=now() WHERE id=p_id;
 ELSIF p_action='activate_manual' THEN
  IF p_until IS NULL OR p_until<=now() THEN RAISE EXCEPTION 'FUTURE_DATE_REQUIRED'; END IF;
  UPDATE licensing.licenses SET complimentary=false,status='active',valid_until=p_until,updated_at=now() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 INSERT INTO licensing.events(license_id,actor_id,action,details) SELECT p_id,actor,p_action,jsonb_build_object('reason',p_reason,'before',to_jsonb(before_row),'after',to_jsonb(l)) FROM licensing.licenses l WHERE id=p_id;
END $$;
CREATE FUNCTION licensing.admin_record_payment(p_license uuid,p_amount bigint,p_due date,p_paid date,p_method text,p_reference text,p_note text,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; created_id uuid; BEGIN
 actor:=licensing_private.require_admin();
 PERFORM 1 FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND'; END IF;
 IF p_paid>CURRENT_DATE THEN RAISE EXCEPTION 'FUTURE_PAYMENT'; END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('payment',p_license,p_amount,p_due,p_paid,p_method,p_reference,p_note)) THEN SELECT r.result INTO created_id FROM licensing_private.requests r WHERE r.id=p_request;RETURN created_id; END IF;
 INSERT INTO licensing.payments(license_id,amount_minor,status,due_on,paid_on,method,reference,note,recorded_by)
 VALUES(p_license,p_amount,CASE WHEN p_paid IS NULL THEN 'pending' ELSE 'confirmed' END,p_due,p_paid,p_method,left(COALESCE(p_reference,''),200),left(COALESCE(p_note,''),2000),actor) RETURNING id INTO created_id;
 UPDATE licensing_private.requests r SET result=created_id WHERE r.id=p_request;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(p_license,actor,'payment_recorded',jsonb_build_object('payment',created_id,'amount_minor',p_amount,'manual',true));
 RETURN created_id;
END $$;
CREATE FUNCTION licensing.admin_void_payment(p_id uuid,p_reason text,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; payment licensing.payments; BEGIN
 actor:=licensing_private.require_admin();
 SELECT * INTO payment FROM licensing.payments WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason))<3 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('void',p_id,p_reason)) THEN RETURN; END IF;
 IF payment.status='void' THEN RAISE EXCEPTION 'PAYMENT_ALREADY_VOID'; END IF;
 UPDATE licensing.payments SET status='void',void_reason=p_reason WHERE id=p_id;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(payment.license_id,actor,'payment_voided',jsonb_build_object('payment',p_id,'reason',p_reason,'previous_status',payment.status));
END $$;
CREATE FUNCTION licensing.owner_license_action(p_id uuid,p_action text,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row licensing.licenses; BEGIN
 SELECT * INTO row FROM licensing.licenses WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR row.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('owner_action',p_id,p_action)) THEN RETURN; END IF;
 IF p_action='cancel' THEN UPDATE licensing.licenses SET status='cancelled',updated_at=now() WHERE id=p_id;
 ELSIF p_action='request_reactivation' THEN UPDATE licensing.licenses SET status='reactivation_requested',updated_at=now() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(p_id,auth.uid(),p_action,'{}');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA licensing,licensing_private FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION licensing.manager_access(),licensing.is_platform_admin(),licensing.is_active(uuid),licensing.admin_accounts(text),licensing.admin_create_license(uuid,text,text,text,bigint,integer,uuid),licensing.admin_set_license(uuid,text,timestamptz,text,uuid),licensing.admin_record_payment(uuid,bigint,date,date,text,text,text,uuid),licensing.admin_void_payment(uuid,text,uuid),licensing.owner_license_action(uuid,text,uuid) TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA licensing,licensing_private TO service_role;
GRANT USAGE ON SCHEMA licensing_private TO service_role;
COMMIT;
