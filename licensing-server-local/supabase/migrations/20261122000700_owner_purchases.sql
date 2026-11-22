-- Contratação pelo titular, pagamento na adesão e reativação por nova contratação.
BEGIN;
ALTER TABLE licensing_private.checkout_requests ALTER COLUMN created_at SET DEFAULT clock_timestamp();
ALTER TABLE licensing.licenses ADD COLUMN billing_checkout_id uuid;
ALTER TABLE licensing.licenses ADD COLUMN activation_required_after timestamptz;
ALTER TABLE licensing_private.subscription_changes ADD COLUMN checkout_request_id uuid REFERENCES licensing_private.checkout_requests(id);
ALTER TABLE licensing_private.subscription_changes DROP CONSTRAINT subscription_changes_action_check;
ALTER TABLE licensing_private.subscription_changes ADD CONSTRAINT subscription_changes_action_check CHECK(action IN ('suspend','extras','checkout_cancel'));
CREATE TABLE licensing.plan_prices(kind text NOT NULL CHECK(kind IN ('farm','consultancy')),period text NOT NULL CHECK(period IN ('monthly','annual')),amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 1000000000),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(kind,period));
ALTER TABLE licensing.plan_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing.plan_prices FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON licensing.plan_prices TO authenticated,service_role;
CREATE POLICY plan_price_read ON licensing.plan_prices FOR SELECT TO authenticated USING(true);
CREATE FUNCTION licensing.admin_set_plan_price(p_kind text,p_period text,p_amount bigint,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE actor uuid;BEGIN
 actor:=licensing_private.require_admin();IF NOT licensing_private.request_once(p_request,jsonb_build_array('plan_price',p_kind,p_period,p_amount)) THEN RETURN;END IF;
 INSERT INTO licensing.plan_prices(kind,period,amount_minor) VALUES(p_kind,p_period,p_amount) ON CONFLICT(kind,period) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,updated_at=now();
 INSERT INTO licensing.events(actor_id,action,details) VALUES(actor,'plan_price_set',jsonb_build_object('kind',p_kind,'period',p_period,'amount_minor',p_amount));
END $$;
CREATE FUNCTION licensing.quote_plan(p_kind text,p_period text,p_extras integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE base bigint; unit bigint:=0; total bigint;BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_extras IS NULL OR p_extras NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'INVALID_EXTRAS';END IF;
 SELECT amount_minor INTO base FROM licensing.plan_prices WHERE kind=p_kind AND period=p_period;IF base IS NULL THEN RAISE EXCEPTION 'PLAN_PRICE_NOT_CONFIGURED';END IF;
 IF p_extras>0 THEN SELECT unit_minor INTO unit FROM licensing.extra_prices WHERE kind=p_kind AND period=p_period;IF unit IS NULL THEN RAISE EXCEPTION 'EXTRA_PRICE_NOT_CONFIGURED';END IF;END IF;
 total:=base+p_extras::bigint*unit;IF total>1000000000 THEN RAISE EXCEPTION 'INVALID_EXTRA_TOTAL';END IF;
 RETURN jsonb_build_object('amount_minor',total,'base_minor',base,'unit_minor',unit,'users',4+p_extras,'devices',(CASE WHEN p_kind='farm' THEN 6 ELSE 5 END)+2*p_extras);
END $$;
CREATE FUNCTION licensing.start_purchase(p_kind text,p_period text,p_label text,p_extras integer,p_expected_minor bigint,p_environment text,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE q jsonb; created uuid; actor uuid:=auth.uid();BEGIN
 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'VERIFIED_OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'INVALID_ENVIRONMENT';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('purchase',actor,p_kind,p_period,p_label,p_extras,p_expected_minor,p_environment)) THEN SELECT result INTO created FROM licensing_private.requests WHERE id=p_request;RETURN created;END IF;
 q:=licensing.quote_plan(p_kind,p_period,p_extras);IF (q->>'amount_minor')::bigint IS DISTINCT FROM p_expected_minor THEN RAISE EXCEPTION 'EXTRA_QUOTE_CHANGED';END IF;
 INSERT INTO licensing.licenses(owner_id,label,kind,period,amount_minor,extras,extra_unit_minor,test_mode)
 VALUES(actor,btrim(p_label),p_kind,p_period,p_expected_minor,p_extras,CASE WHEN p_extras>0 THEN (q->>'unit_minor')::bigint ELSE NULL END,p_environment='sandbox') RETURNING id INTO created;
 UPDATE licensing_private.requests SET result=created WHERE id=p_request;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(created,actor,'purchase_started',q||jsonb_build_object('environment',p_environment,'first_payment','at_purchase'));RETURN created;
END $$;
CREATE OR REPLACE FUNCTION licensing.owner_license_action(p_id uuid,p_action text,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE l licensing.licenses;BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=p_id FOR UPDATE;IF NOT FOUND OR l.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('owner_action',p_id,p_action)) THEN RETURN;END IF;
 IF p_action='cancel' THEN UPDATE licensing.licenses SET status='cancelled',updated_at=now() WHERE id=p_id;
 ELSIF p_action='request_reactivation' THEN
  IF l.status<>'cancelled' THEN RAISE EXCEPTION 'LICENSE_NOT_CANCELLED';END IF;
  UPDATE licensing.licenses SET status='reactivation_requested',billing_checkout_id=NULL,activation_required_after=clock_timestamp(),updated_at=now() WHERE id=p_id;
 ELSE RAISE EXCEPTION 'INVALID_ACTION';END IF;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(p_id,auth.uid(),p_action,jsonb_build_object('first_payment','at_purchase'));
END $$;
CREATE FUNCTION licensing_private.queue_checkout_revocations(p_license uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE v_lic licensing.licenses;BEGIN
 SELECT * INTO v_lic FROM licensing.licenses WHERE id=p_license;
 -- Uma reserva já vinculada a contrato é uma jornada concluída; a assinatura é suspensa separadamente.
 UPDATE licensing_private.checkout_requests r SET state='cancelled',updated_at=now() WHERE license_id=p_license AND state IN ('reserved','ready','expired') AND (provider_id IS NULL OR EXISTS(SELECT 1 FROM licensing_private.billing_contracts b WHERE b.request_id=r.id)) AND (v_lic.status='cancelled' OR v_lic.complimentary OR (v_lic.billing_checkout_id IS NOT NULL AND v_lic.billing_checkout_id<>r.id) OR (v_lic.activation_required_after IS NOT NULL AND r.created_at<v_lic.activation_required_after));
 INSERT INTO licensing_private.subscription_changes(license_id,environment,subscription_id,action,actor_id,checkout_request_id)
 SELECT r.license_id,r.environment,r.provider_id,'checkout_cancel',COALESCE(auth.uid(),l.owner_id),r.id FROM licensing_private.checkout_requests r JOIN licensing.licenses l ON l.id=r.license_id
 WHERE r.license_id=p_license AND r.provider_id IS NOT NULL AND r.state IN ('ready','uncertain','expired')
 AND (v_lic.status='cancelled' OR v_lic.complimentary OR (v_lic.billing_checkout_id IS NOT NULL AND v_lic.billing_checkout_id<>r.id) OR (v_lic.activation_required_after IS NOT NULL AND r.created_at<v_lic.activation_required_after))
 AND NOT EXISTS(SELECT 1 FROM licensing_private.billing_contracts b WHERE b.request_id=r.id)
 ON CONFLICT(environment,subscription_id) WHERE state IN ('pending','processing','failed','review','scheduled') DO NOTHING;
 UPDATE licensing_private.checkout_requests r SET state='uncertain',updated_at=now() WHERE license_id=p_license AND state='creating' AND (v_lic.status='cancelled' OR v_lic.complimentary OR (v_lic.billing_checkout_id IS NOT NULL AND v_lic.billing_checkout_id<>r.id) OR (v_lic.activation_required_after IS NOT NULL AND r.created_at<v_lic.activation_required_after));
END $$;
CREATE FUNCTION licensing_private.revoke_on_license_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF (NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status) OR (NEW.complimentary AND NOT OLD.complimentary) THEN PERFORM licensing_private.queue_checkout_revocations(NEW.id);END IF;RETURN NEW;
END $$;
CREATE TRIGGER revoke_on_license_change AFTER UPDATE ON licensing.licenses FOR EACH ROW EXECUTE FUNCTION licensing_private.revoke_on_license_change();
CREATE FUNCTION licensing_private.revoke_late_checkout() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE l licensing.licenses;BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=NEW.license_id;
 IF NEW.provider_id IS NOT NULL AND (l.status='cancelled' OR l.complimentary OR (l.billing_checkout_id IS NOT NULL AND l.billing_checkout_id<>NEW.id) OR (l.activation_required_after IS NOT NULL AND NEW.created_at<l.activation_required_after)) THEN PERFORM licensing_private.queue_checkout_revocations(l.id);END IF;RETURN NEW;
END $$;
CREATE TRIGGER revoke_late_checkout AFTER UPDATE OF provider_id ON licensing_private.checkout_requests FOR EACH ROW EXECUTE FUNCTION licensing_private.revoke_late_checkout();
CREATE FUNCTION licensing.checkout_terminal_event(p_environment text,p_checkout text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE job licensing_private.subscription_changes;BEGIN
 SELECT * INTO job FROM licensing_private.subscription_changes WHERE environment=p_environment AND subscription_id=p_checkout AND action='checkout_cancel' AND state IN ('pending','processing','failed','review') FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF;
 UPDATE licensing_private.checkout_requests SET state='cancelled',updated_at=now() WHERE id=job.checkout_request_id;
 UPDATE licensing_private.subscription_changes SET state='done',lease_token=NULL,error_code=NULL,updated_at=now() WHERE id=job.id;
 UPDATE licensing_private.billing_processors SET token=NULL,lease_until=NULL WHERE environment=p_environment AND token=job.lease_token;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(job.license_id,job.actor_id,'checkout_revoked',jsonb_build_object('request_id',job.checkout_request_id,'source','authenticated_terminal_event'));
END $$;
CREATE FUNCTION licensing.owner_checkout_requests() RETURNS TABLE(id uuid,license_id uuid,environment text,state text,url text,created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT r.id,r.license_id,r.environment,r.state,CASE WHEN r.state='ready' AND r.expires_at>clock_timestamp() AND l.status IN ('pending','reactivation_requested') AND NOT l.complimentary AND (l.billing_checkout_id IS NULL OR l.billing_checkout_id=r.id) AND (l.activation_required_after IS NULL OR r.created_at>=l.activation_required_after) THEN licensing_private.checkout_view(r)->>'url' ELSE NULL END,r.created_at
 FROM licensing_private.checkout_requests r JOIN licensing.licenses l ON l.id=r.license_id WHERE l.owner_id=auth.uid() ORDER BY r.created_at DESC LIMIT 100
$$;
REVOKE ALL ON FUNCTION licensing.admin_set_plan_price(text,text,bigint,uuid),licensing.quote_plan(text,text,integer),licensing.start_purchase(text,text,text,integer,bigint,text,uuid),licensing_private.queue_checkout_revocations(uuid),licensing_private.revoke_on_license_change(),licensing_private.revoke_late_checkout(),licensing.checkout_terminal_event(text,text),licensing.owner_checkout_requests() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION licensing.admin_set_plan_price(text,text,bigint,uuid),licensing.quote_plan(text,text,integer),licensing.start_purchase(text,text,text,integer,bigint,text,uuid),licensing.owner_checkout_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION licensing.checkout_terminal_event(text,text) TO service_role;

CREATE OR REPLACE FUNCTION licensing.reserve_checkout(p_license uuid,p_request uuid,p_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lic licensing.licenses; req licensing_private.checkout_requests; BEGIN
 IF p_request IS NULL OR p_environment IS NULL OR p_environment NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'INVALID_CHECKOUT_REQUEST'; END IF;
 SELECT * INTO lic FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND OR lic.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'VERIFIED_OWNER_REQUIRED'; END IF;
 UPDATE licensing_private.checkout_requests SET state='expired',updated_at=now()
 WHERE license_id=p_license AND state IN ('reserved','ready') AND expires_at<now();
 SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=p_request;
 IF FOUND THEN
  IF req.actor_id IS DISTINCT FROM auth.uid() OR req.license_id<>p_license OR req.environment<>p_environment THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
  IF req.state='ready' AND (lic.complimentary OR lic.status NOT IN ('pending','reactivation_requested') OR (lic.billing_checkout_id IS NOT NULL AND lic.billing_checkout_id<>req.id) OR (lic.activation_required_after IS NOT NULL AND req.created_at<lic.activation_required_after)) THEN
   RETURN jsonb_build_object('request_id',req.id,'state','unavailable','url',NULL);
  END IF;
  RETURN licensing_private.checkout_view(req);
 END IF;
 IF (p_environment='sandbox') IS DISTINCT FROM lic.test_mode THEN RAISE EXCEPTION 'BILLING_ENVIRONMENT_MISMATCH';END IF;
 IF lic.complimentary OR lic.status NOT IN ('pending','reactivation_requested') OR lic.amount_minor<=0 THEN RAISE EXCEPTION 'CHECKOUT_NOT_ALLOWED'; END IF;
 -- Reservas não utilizadas expiram; resultados incertos nunca são repetidos automaticamente.
 IF EXISTS(SELECT 1 FROM licensing_private.checkout_requests WHERE license_id=p_license AND state IN ('reserved','creating','ready','uncertain')) THEN RAISE EXCEPTION 'CHECKOUT_ALREADY_PENDING'; END IF;
 IF lic.status='reactivation_requested' AND EXISTS(SELECT 1 FROM licensing_private.subscription_changes WHERE license_id=p_license AND action IN ('suspend','checkout_cancel') AND state NOT IN ('done','superseded')) THEN RAISE EXCEPTION 'PREVIOUS_BILLING_STOP_PENDING';END IF;
 UPDATE licensing.licenses SET billing_checkout_id=p_request,updated_at=now() WHERE id=p_license;
 INSERT INTO licensing_private.checkout_requests(id,actor_id,license_id,environment,label,period,amount_minor)
 VALUES(p_request,auth.uid(),p_license,p_environment,lic.label,lic.period,lic.amount_minor) RETURNING * INTO req;
 RETURN licensing_private.checkout_view(req);
END $$;
CREATE OR REPLACE FUNCTION licensing.finish_checkout(p_actor uuid,p_request uuid,p_provider_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req licensing_private.checkout_requests; lic licensing.licenses; BEGIN
 IF p_provider_id IS NULL OR p_provider_id !~ '^[a-zA-Z0-9_-]{1,200}$' THEN RAISE EXCEPTION 'INVALID_PROVIDER_ID'; END IF;
 SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=p_request;
 IF NOT FOUND OR req.actor_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
 SELECT * INTO lic FROM licensing.licenses WHERE id=req.license_id FOR UPDATE;
 SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=p_request FOR UPDATE;
 IF req.state='ready' AND req.provider_id=p_provider_id THEN RETURN licensing_private.checkout_view(req); END IF;
 IF req.state NOT IN ('creating','uncertain') OR req.provider_id IS NOT NULL THEN RAISE EXCEPTION 'CHECKOUT_STATE_CONFLICT'; END IF;
 UPDATE licensing_private.checkout_requests SET provider_id=p_provider_id,
 state=CASE WHEN lic.owner_id=p_actor AND lic.status IN ('pending','reactivation_requested') AND NOT lic.complimentary AND lic.amount_minor=req.amount_minor AND lic.period=req.period AND (lic.billing_checkout_id IS NULL OR lic.billing_checkout_id=req.id) AND (lic.activation_required_after IS NULL OR req.created_at>=lic.activation_required_after) THEN 'ready' ELSE 'uncertain' END,
 updated_at=now() WHERE id=p_request RETURNING * INTO req;
 RETURN licensing_private.checkout_view(req);
END $$;
CREATE OR REPLACE FUNCTION licensing.apply_canonical_payment(p_environment text,p_event_id text,p_lease uuid,p_request uuid,p_payment jsonb,p_subscription jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
<<canonical>>
DECLARE req licensing_private.checkout_requests; lic licensing.licenses; old licensing.provider_payments;
 contract licensing_private.billing_contracts; control licensing_private.billing_control; price licensing_private.billing_price_versions;
 payment_id text:=p_payment->>'id'; subscription_id text:=p_payment->>'subscription'; customer_id text:=p_payment->>'customer';
 amount_minor bigint:=(p_payment->>'amount_minor')::bigint; due_on date:=(p_payment->>'due_on')::date; paid_on date:=(p_payment->>'paid_on')::date;
 payment_status text:=p_payment->>'status'; eligible boolean; has_refund boolean:=COALESCE((p_payment->>'has_refund')::boolean,false);
 until_at timestamptz; entitlement_until timestamptz; changed boolean; managed boolean; new_status text; active_extras integer; current_price licensing_private.billing_price_versions;
 BEGIN
 PERFORM licensing_private.check_billing_lease(p_environment,p_event_id,p_lease);
 SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=p_request AND environment=p_environment;
 IF NOT FOUND OR req.provider_id IS NULL THEN RAISE EXCEPTION 'UNKNOWN_BILLING_REQUEST';END IF;
 SELECT * INTO lic FROM licensing.licenses WHERE id=req.license_id FOR UPDATE;
 IF (p_environment='sandbox') IS DISTINCT FROM lic.test_mode THEN RAISE EXCEPTION 'BILLING_ENVIRONMENT_MISMATCH';END IF;
 SELECT * INTO price FROM licensing_private.billing_price_versions WHERE environment=p_environment AND billing_price_versions.subscription_id=canonical.subscription_id AND effective_on<=due_on ORDER BY effective_on DESC LIMIT 1;
 IF payment_id IS NULL OR payment_id !~ '^[a-zA-Z0-9_-]{1,200}$' OR subscription_id IS NULL OR subscription_id !~ '^[a-zA-Z0-9_-]{1,200}$' OR customer_id IS NULL OR customer_id !~ '^[a-zA-Z0-9_-]{1,200}$' OR amount_minor IS DISTINCT FROM COALESCE(price.amount_minor,req.amount_minor) OR due_on IS NULL OR payment_status IS NULL OR payment_status !~ '^[A-Z_]{1,80}$' THEN RAISE EXCEPTION 'INVALID_CANONICAL_PAYMENT';END IF;
 SELECT * INTO contract FROM licensing_private.billing_contracts WHERE environment=p_environment AND billing_contracts.subscription_id=canonical.subscription_id;
 IF FOUND AND (contract.request_id<>req.id OR contract.customer_id<>customer_id OR contract.period<>req.period) THEN RAISE EXCEPTION 'BILLING_CONTRACT_CONFLICT';END IF;
 IF p_subscription IS NOT NULL THEN
  IF p_subscription->>'id' IS DISTINCT FROM subscription_id OR p_subscription->>'customer' IS DISTINCT FROM customer_id
  OR (p_subscription->>'amount_minor')::bigint IS DISTINCT FROM COALESCE(contract.amount_minor,req.amount_minor)
  OR p_subscription->>'cycle' IS DISTINCT FROM (CASE WHEN req.period='monthly' THEN 'MONTHLY' ELSE 'YEARLY' END) THEN RAISE EXCEPTION 'INVALID_CANONICAL_SUBSCRIPTION';END IF;
  IF p_subscription->>'checkout_id' IS NOT NULL THEN
   IF p_subscription->>'checkout_id'<>req.provider_id THEN RAISE EXCEPTION 'CHECKOUT_BINDING_MISMATCH';END IF;
  ELSIF p_subscription->>'reference' IS DISTINCT FROM req.license_id::text||':'||req.id::text THEN RAISE EXCEPTION 'REFERENCE_BINDING_MISMATCH';END IF;
 ELSE
  IF contract.subscription_id IS NULL OR payment_status IN ('RECEIVED','CONFIRMED','DUNNING_RECEIVED') THEN RAISE EXCEPTION 'SUBSCRIPTION_VERIFICATION_REQUIRED';END IF;
 END IF;
 IF p_payment->>'checkout_id' IS NOT NULL AND p_payment->>'checkout_id'<>req.provider_id THEN RAISE EXCEPTION 'CHECKOUT_BINDING_MISMATCH';END IF;
 INSERT INTO licensing_private.billing_contracts(environment,subscription_id,license_id,request_id,customer_id,amount_minor,period)
 VALUES(p_environment,subscription_id,lic.id,req.id,customer_id,amount_minor,req.period) ON CONFLICT DO NOTHING;
 SELECT * INTO contract FROM licensing_private.billing_contracts WHERE environment=p_environment AND billing_contracts.subscription_id=canonical.subscription_id;
 IF contract.request_id<>req.id THEN RAISE EXCEPTION 'BILLING_CONTRACT_CONFLICT';END IF;
 SELECT * INTO old FROM licensing.provider_payments WHERE environment=p_environment AND provider_payments.payment_id=canonical.payment_id FOR UPDATE;
 IF FOUND AND (old.license_id<>lic.id OR old.subscription_id<>subscription_id OR old.customer_id<>customer_id) THEN RAISE EXCEPTION 'PAYMENT_BINDING_CONFLICT';END IF;
 eligible:=payment_status IN ('RECEIVED','CONFIRMED','DUNNING_RECEIVED') AND NOT has_refund AND NOT COALESCE((p_payment->>'deleted')::boolean,false);
 IF eligible AND paid_on IS NULL THEN RAISE EXCEPTION 'PAID_DATE_REQUIRED';END IF;
 until_at:=((due_on+CASE WHEN req.period='monthly' THEN interval '1 month' ELSE interval '1 year' END)::timestamp AT TIME ZONE 'America/Sao_Paulo');
 changed:=old.payment_id IS NULL OR (old.status,old.amount_minor,old.due_on,old.paid_on,old.eligible,old.has_refund) IS DISTINCT FROM (payment_status,amount_minor,due_on,paid_on,eligible,has_refund);
 IF changed THEN
  INSERT INTO licensing.provider_payments(environment,payment_id,license_id,subscription_id,customer_id,amount_minor,status,due_on,paid_on,coverage_until,eligible,has_refund,revision)
  VALUES(p_environment,payment_id,lic.id,subscription_id,customer_id,amount_minor,payment_status,due_on,paid_on,until_at,eligible,has_refund,COALESCE(old.revision,0)+1)
  ON CONFLICT(environment,payment_id) DO UPDATE SET status=EXCLUDED.status,amount_minor=EXCLUDED.amount_minor,due_on=EXCLUDED.due_on,paid_on=EXCLUDED.paid_on,coverage_until=EXCLUDED.coverage_until,eligible=EXCLUDED.eligible,has_refund=EXCLUDED.has_refund,revision=EXCLUDED.revision,verified_at=now();
  INSERT INTO licensing.provider_audit(license_id,environment,event_id,action,details) VALUES(lic.id,p_environment,p_event_id,'payment_verified',jsonb_build_object('payment_id',payment_id,'revision',COALESCE(old.revision,0)+1,'before_status',old.status,'status',payment_status,'eligible',eligible,'amount_minor',amount_minor));
 END IF;
 INSERT INTO licensing_private.billing_control(license_id,environment) VALUES(lic.id,p_environment) ON CONFLICT DO NOTHING;
 SELECT * INTO control FROM licensing_private.billing_control WHERE license_id=lic.id FOR UPDATE;
 IF control.environment<>p_environment THEN RAISE EXCEPTION 'BILLING_ENVIRONMENT_MISMATCH';END IF;
 managed:=NOT lic.complimentary AND (lic.status IN ('pending','reactivation_requested') OR (lic.status='active' AND control.last_revision=lic.billing_revision)) AND (lic.billing_checkout_id IS NULL OR lic.billing_checkout_id=req.id) AND (lic.activation_required_after IS NULL OR req.created_at>=lic.activation_required_after);
 IF managed THEN
  SELECT * INTO current_price FROM licensing_private.billing_price_versions WHERE environment=p_environment AND billing_price_versions.subscription_id=canonical.subscription_id ORDER BY effective_on DESC LIMIT 1;
  SELECT LEAST(COALESCE(max(v.extras),0),current_price.extras) INTO active_extras FROM licensing.provider_payments p
  JOIN LATERAL(SELECT v1.extras FROM licensing_private.billing_price_versions v1 WHERE v1.environment=p.environment AND v1.subscription_id=p.subscription_id AND v1.effective_on<=p.due_on ORDER BY v1.effective_on DESC LIMIT 1)v ON true
  WHERE p.license_id=lic.id AND p.environment=p_environment AND (lic.billing_checkout_id IS NULL OR EXISTS(SELECT 1 FROM licensing_private.billing_contracts b WHERE b.environment=p.environment AND b.subscription_id=p.subscription_id AND b.request_id=lic.billing_checkout_id)) AND p.eligible AND (p.due_on::timestamp AT TIME ZONE 'America/Sao_Paulo')<=clock_timestamp() AND p.coverage_until>clock_timestamp();
  IF lic.extras<>active_extras THEN
   UPDATE licensing.licenses SET extras=active_extras,amount_minor=contract.amount_minor,extra_unit_minor=COALESCE(current_price.unit_minor,extra_unit_minor),updated_at=now() WHERE id=lic.id RETURNING * INTO lic;
   UPDATE licensing_private.billing_control SET last_revision=lic.billing_revision WHERE license_id=lic.id;
   INSERT INTO licensing.provider_audit(license_id,environment,event_id,action,details) VALUES(lic.id,p_environment,p_event_id,'extras_reconciled',jsonb_build_object('extras',active_extras,'change_id',current_price.change_id));
  END IF;
  UPDATE licensing_private.subscription_changes SET state='done',updated_at=now() WHERE license_id=lic.id AND action='extras' AND state='scheduled' AND target_extras<=active_extras AND effective_on<=(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
  WITH RECURSIVE coverage(until_at) AS (
   SELECT p.coverage_until FROM licensing.provider_payments p WHERE p.license_id=lic.id AND p.environment=p_environment AND (lic.billing_checkout_id IS NULL OR EXISTS(SELECT 1 FROM licensing_private.billing_contracts b WHERE b.environment=p.environment AND b.subscription_id=p.subscription_id AND b.request_id=lic.billing_checkout_id)) AND p.eligible
   AND (p.due_on::timestamp AT TIME ZONE 'America/Sao_Paulo')<=clock_timestamp() AND p.coverage_until>clock_timestamp()
   UNION
   SELECT p.coverage_until FROM coverage c JOIN licensing.provider_payments p ON p.license_id=lic.id AND p.environment=p_environment AND (lic.billing_checkout_id IS NULL OR EXISTS(SELECT 1 FROM licensing_private.billing_contracts b WHERE b.environment=p.environment AND b.subscription_id=p.subscription_id AND b.request_id=lic.billing_checkout_id)) AND p.eligible
   AND (p.due_on::timestamp AT TIME ZONE 'America/Sao_Paulo')<=c.until_at AND p.coverage_until>c.until_at
  ) SELECT max(c.until_at) INTO entitlement_until FROM coverage c;
  new_status:=CASE WHEN entitlement_until>clock_timestamp() THEN 'active' WHEN lic.status='reactivation_requested' THEN 'reactivation_requested' ELSE 'pending' END;
  IF (lic.status,lic.valid_until) IS DISTINCT FROM (new_status,entitlement_until) THEN
   UPDATE licensing.licenses SET status=new_status,valid_until=entitlement_until,updated_at=now() WHERE id=lic.id RETURNING * INTO lic;
   UPDATE licensing_private.billing_control SET last_revision=lic.billing_revision WHERE license_id=lic.id;
   INSERT INTO licensing.provider_audit(license_id,environment,event_id,action,details) VALUES(lic.id,p_environment,p_event_id,'license_reconciled',jsonb_build_object('status',lic.status,'valid_until',lic.valid_until,'source','Asaas'));
  END IF;
 END IF;
 IF eligible AND (due_on::timestamp AT TIME ZONE 'America/Sao_Paulo')>clock_timestamp() THEN
  INSERT INTO licensing_private.asaas_inbox(environment,event_id,event_type,payload,next_attempt_at)
  VALUES(p_environment,'evt_coverage_'||md5(p_environment||payment_id||due_on::text),'PAYMENT_RECHECK',jsonb_build_object('payment',jsonb_build_object('id',payment_id)),due_on::timestamp AT TIME ZONE 'America/Sao_Paulo') ON CONFLICT DO NOTHING;
 END IF;
 PERFORM licensing.finish_billing_event(p_environment,p_event_id,p_lease,'processed',NULL);
 RETURN jsonb_build_object('payment_id',payment_id,'changed',changed,'license_status',lic.status,'valid_until',lic.valid_until,'managed',managed);
END $$;
CREATE OR REPLACE FUNCTION licensing_private.initialize_contract_prices() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE l licensing.licenses; BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=NEW.license_id;
 INSERT INTO licensing_private.billing_price_versions VALUES(NEW.environment,NEW.subscription_id,'-infinity',NEW.amount_minor,l.extras,l.extra_unit_minor,NULL);
 IF l.status='cancelled' OR l.complimentary THEN PERFORM licensing_private.queue_subscription_stop(l.id);
 ELSIF (l.billing_checkout_id IS NOT NULL AND l.billing_checkout_id<>NEW.request_id) OR (l.activation_required_after IS NOT NULL AND EXISTS(SELECT 1 FROM licensing_private.checkout_requests WHERE id=NEW.request_id AND created_at<l.activation_required_after)) THEN
 INSERT INTO licensing_private.subscription_changes(license_id,environment,subscription_id,action,actor_id) VALUES(l.id,NEW.environment,NEW.subscription_id,'suspend',l.owner_id) ON CONFLICT(environment,subscription_id) WHERE state IN ('pending','processing','failed','review','scheduled') DO NOTHING;
 END IF;RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION licensing.quote_extras(p_license uuid,p_extras integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; unit bigint; total bigint; current_extras integer; current_amount bigint; v licensing_private.billing_price_versions; BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license;
 IF NOT FOUND OR (l.owner_id IS DISTINCT FROM auth.uid() AND NOT licensing.is_platform_admin()) THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_extras IS NULL OR p_extras NOT BETWEEN 0 AND 100 OR l.status<>'active' OR l.complimentary THEN RAISE EXCEPTION 'EXTRAS_NOT_ALLOWED';END IF;
 SELECT v1.* INTO v FROM licensing_private.billing_price_versions v1 JOIN licensing_private.billing_contracts b ON b.environment=v1.environment AND b.subscription_id=v1.subscription_id WHERE b.license_id=l.id AND (l.billing_checkout_id IS NULL OR b.request_id=l.billing_checkout_id) ORDER BY v1.effective_on DESC LIMIT 1;
 unit:=COALESCE(v.unit_minor,l.extra_unit_minor);current_extras:=COALESCE(v.extras,l.extras);current_amount:=COALESCE(v.amount_minor,l.amount_minor);
 IF unit IS NULL AND current_extras>0 THEN RAISE EXCEPTION 'LEGACY_EXTRA_PRICE_REQUIRED';END IF;
 IF unit IS NULL THEN SELECT unit_minor INTO unit FROM licensing.extra_prices WHERE kind=l.kind AND period=l.period;END IF;
 IF unit IS NULL THEN RAISE EXCEPTION 'EXTRA_PRICE_NOT_CONFIGURED';END IF;
 total:=current_amount+(p_extras-current_extras)::bigint*unit;
 IF current_amount-current_extras::bigint*unit<=0 OR total NOT BETWEEN 1 AND 1000000000 THEN RAISE EXCEPTION 'INVALID_EXTRA_TOTAL';END IF;
 RETURN jsonb_build_object('extras',p_extras,'current_extras',current_extras,'unit_minor',unit,'amount_minor',total,'users',4+p_extras,'devices',(CASE WHEN l.kind='farm' THEN 6 ELSE 5 END)+2*p_extras);
END $$;
CREATE OR REPLACE FUNCTION licensing.request_extra_change(p_license uuid,p_extras integer,p_expected_minor bigint,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; b licensing_private.billing_contracts; q jsonb; created uuid; BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND OR (l.owner_id IS DISTINCT FROM auth.uid() AND NOT licensing.is_platform_admin()) THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('extras_change',p_license,p_extras,p_expected_minor)) THEN SELECT result INTO created FROM licensing_private.requests WHERE id=p_request;RETURN created;END IF;
 q:=licensing.quote_extras(p_license,p_extras);
 IF (q->>'amount_minor')::bigint IS DISTINCT FROM p_expected_minor THEN RAISE EXCEPTION 'EXTRA_QUOTE_CHANGED';END IF;
 IF p_extras=(q->>'current_extras')::integer THEN RAISE EXCEPTION 'EXTRAS_UNCHANGED';END IF;
 IF (SELECT count(*) FROM licensing_private.billing_contracts WHERE license_id=p_license AND (l.billing_checkout_id IS NULL OR request_id=l.billing_checkout_id))<>1 THEN RAISE EXCEPTION 'SINGLE_CONTRACT_REQUIRED';END IF;
 SELECT * INTO b FROM licensing_private.billing_contracts WHERE license_id=p_license AND (l.billing_checkout_id IS NULL OR request_id=l.billing_checkout_id);
 IF (b.environment='sandbox') IS DISTINCT FROM l.test_mode THEN RAISE EXCEPTION 'BILLING_ENVIRONMENT_MISMATCH';END IF;
 UPDATE licensing_private.subscription_changes SET state='superseded',updated_at=now() WHERE license_id=l.id AND action='extras' AND state='scheduled';
 INSERT INTO licensing_private.subscription_changes(license_id,environment,subscription_id,action,actor_id,target_extras,target_minor,unit_minor)
 VALUES(l.id,b.environment,b.subscription_id,'extras',auth.uid(),p_extras,(q->>'amount_minor')::bigint,(q->>'unit_minor')::bigint) RETURNING id INTO created;
 UPDATE licensing_private.requests SET result=created WHERE id=p_request;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(l.id,auth.uid(),'extras_change_requested',q||jsonb_build_object('change_id',created));RETURN created;
END $$;
CREATE OR REPLACE FUNCTION licensing.finish_subscription_change(p_id uuid,p_lease uuid,p_result text,p_code text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job licensing_private.subscription_changes; l licensing.licenses; managed boolean; BEGIN
 PERFORM licensing_private.check_subscription_lease(p_id,p_lease);SELECT * INTO job FROM licensing_private.subscription_changes WHERE id=p_id;
 SELECT * INTO l FROM licensing.licenses WHERE id=job.license_id FOR UPDATE;
 IF p_result NOT IN ('done','failed','review') OR p_result IS NULL THEN RAISE EXCEPTION 'INVALID_JOB_RESULT';END IF;
 IF p_result='done' AND job.action='checkout_cancel' THEN UPDATE licensing_private.checkout_requests SET state='cancelled',updated_at=now() WHERE id=job.checkout_request_id;END IF;
 IF p_result='done' AND job.action='extras' THEN
  IF l.status<>'active' OR l.complimentary OR job.effective_on IS NULL THEN RAISE EXCEPTION 'EXTRAS_NOT_ALLOWED';END IF;
  IF EXISTS(SELECT 1 FROM licensing.provider_payments WHERE environment=job.environment AND subscription_id=job.subscription_id AND due_on>=job.effective_on AND amount_minor<>job.target_minor) THEN RAISE EXCEPTION 'PRICE_BOUNDARY_HAS_INVOICE';END IF;
  INSERT INTO licensing_private.billing_price_versions VALUES(job.environment,job.subscription_id,job.effective_on,job.target_minor,job.target_extras,job.unit_minor,job.id)
  ON CONFLICT(environment,subscription_id,effective_on) DO UPDATE SET amount_minor=EXCLUDED.amount_minor,extras=EXCLUDED.extras,unit_minor=EXCLUDED.unit_minor,change_id=EXCLUDED.change_id;
  UPDATE licensing_private.billing_contracts SET amount_minor=job.target_minor WHERE environment=job.environment AND subscription_id=job.subscription_id;
  IF job.target_extras<l.extras THEN
   managed:=EXISTS(SELECT 1 FROM licensing_private.billing_control WHERE license_id=l.id AND last_revision=l.billing_revision);
   UPDATE licensing.licenses SET extras=job.target_extras,amount_minor=job.target_minor,extra_unit_minor=job.unit_minor,updated_at=now() WHERE id=l.id RETURNING * INTO l;
   IF managed THEN UPDATE licensing_private.billing_control SET last_revision=l.billing_revision WHERE license_id=l.id;END IF;
  END IF;
 END IF;
 UPDATE licensing_private.subscription_changes SET state=CASE WHEN p_result='failed' AND attempts>=8 THEN 'review' WHEN p_result='done' AND job.action='extras' AND job.target_extras>l.extras THEN 'scheduled' ELSE p_result END,
 error_code=left(p_code,100),lease_token=NULL,updated_at=now(),next_attempt_at=clock_timestamp()+make_interval(secs=>LEAST(3600,30*power(2,LEAST(attempts-1,7)))::integer) WHERE id=p_id;
 UPDATE licensing_private.billing_processors SET token=NULL,lease_until=NULL WHERE environment=job.environment AND token=p_lease;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(job.license_id,COALESCE(job.actor_id,l.owner_id),'subscription_'||job.action||'_'||p_result,jsonb_build_object('change_id',p_id,'environment',job.environment,'effective_on',job.effective_on,'target_extras',job.target_extras,'target_minor',job.target_minor,'code',left(p_code,100)));
END $$;
CREATE OR REPLACE FUNCTION licensing.request_subscription_stop(p_license uuid,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE l licensing.licenses;BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND OR (l.owner_id IS DISTINCT FROM auth.uid() AND NOT licensing.is_platform_admin()) THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF l.status<>'cancelled' AND NOT l.complimentary THEN RAISE EXCEPTION 'CANCEL_LICENSE_FIRST';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('stop_subscription',p_license)) THEN RETURN;END IF;
 PERFORM licensing_private.queue_subscription_stop(p_license);PERFORM licensing_private.queue_checkout_revocations(p_license);
END $$;
CREATE OR REPLACE FUNCTION licensing.billing_context(p_environment text,p_subscription_id text,p_checkout_id text DEFAULT NULL,p_reference text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE contract licensing_private.billing_contracts; req licensing_private.checkout_requests; lic licensing.licenses; BEGIN
 SELECT * INTO contract FROM licensing_private.billing_contracts WHERE environment=p_environment AND subscription_id=p_subscription_id;
 IF FOUND THEN SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=contract.request_id;
 ELSE
  IF p_checkout_id IS NOT NULL THEN SELECT * INTO req FROM licensing_private.checkout_requests WHERE environment=p_environment AND provider_id=p_checkout_id;
  ELSIF p_reference IS NOT NULL THEN SELECT * INTO req FROM licensing_private.checkout_requests WHERE environment=p_environment AND license_id::text||':'||id::text=p_reference;
  ELSE RETURN NULL;END IF;
 END IF;
 IF req.id IS NULL OR req.provider_id IS NULL OR (contract.subscription_id IS NULL AND req.state NOT IN ('ready','expired','uncertain','cancelled')) THEN RETURN NULL;END IF;
 SELECT * INTO lic FROM licensing.licenses WHERE id=req.license_id;
 RETURN jsonb_build_object('request_id',req.id,'license_id',req.license_id,'checkout_id',req.provider_id,
 'reference',req.license_id::text||':'||req.id::text,'amount_minor',req.amount_minor,'period',req.period,
 'customer_id',contract.customer_id,'bound',contract.subscription_id IS NOT NULL,'test_mode',lic.test_mode);
END $$;


CREATE FUNCTION licensing.owner_subscription_changes() RETURNS TABLE(id uuid,license_id uuid,action text,state text,target_extras integer,target_minor bigint,effective_on date,created_at timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT q.id,q.license_id,q.action,q.state,q.target_extras,q.target_minor,q.effective_on,q.created_at FROM licensing_private.subscription_changes q JOIN licensing.licenses l ON l.id=q.license_id WHERE l.owner_id=auth.uid() ORDER BY q.created_at DESC LIMIT 100
$$;
REVOKE ALL ON FUNCTION licensing.owner_subscription_changes() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION licensing.owner_subscription_changes() TO authenticated;
COMMIT;
