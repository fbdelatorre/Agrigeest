-- Conciliação financeira: altera somente os schemas de licenciamento preparados.
BEGIN;
ALTER TABLE licensing.licenses ADD COLUMN test_mode boolean NOT NULL DEFAULT false;
ALTER TABLE licensing.licenses ADD COLUMN billing_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE licensing.licenses ADD CONSTRAINT test_license_has_no_farm CHECK(NOT test_mode OR institution_id IS NULL);
CREATE FUNCTION licensing_private.bump_billing_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN NEW.billing_revision:=OLD.billing_revision+1;RETURN NEW;END $$;
CREATE TRIGGER license_billing_revision BEFORE UPDATE ON licensing.licenses FOR EACH ROW EXECUTE FUNCTION licensing_private.bump_billing_revision();
ALTER TABLE licensing_private.asaas_inbox DROP CONSTRAINT asaas_inbox_status_check;
ALTER TABLE licensing_private.asaas_inbox ADD CONSTRAINT asaas_inbox_status_check CHECK(status IN ('pending','processing','processed','failed','review'));
ALTER TABLE licensing_private.asaas_inbox ADD COLUMN attempts integer NOT NULL DEFAULT 0;
ALTER TABLE licensing_private.asaas_inbox ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE licensing_private.asaas_inbox ADD COLUMN lease_token uuid;
ALTER TABLE licensing_private.asaas_inbox ADD COLUMN error_code text;
CREATE TABLE licensing_private.billing_processors(environment text PRIMARY KEY CHECK(environment IN ('sandbox','production')),token uuid,lease_until timestamptz);
CREATE TABLE licensing_private.billing_contracts(
 environment text NOT NULL,subscription_id text NOT NULL,license_id uuid NOT NULL REFERENCES licensing.licenses(id),
 request_id uuid NOT NULL REFERENCES licensing_private.checkout_requests(id),customer_id text NOT NULL,
 amount_minor bigint NOT NULL,period text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(environment,subscription_id));
CREATE TABLE licensing_private.billing_control(license_id uuid PRIMARY KEY REFERENCES licensing.licenses(id),environment text NOT NULL,last_revision bigint);
CREATE TABLE licensing.provider_payments(
 environment text NOT NULL CHECK(environment IN ('sandbox','production')),payment_id text NOT NULL,
 license_id uuid NOT NULL REFERENCES licensing.licenses(id),subscription_id text NOT NULL,customer_id text NOT NULL,
 amount_minor bigint NOT NULL,status text NOT NULL,due_on date NOT NULL,paid_on date,
 coverage_until timestamptz NOT NULL,eligible boolean NOT NULL,has_refund boolean NOT NULL,revision integer NOT NULL DEFAULT 1,
 verified_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(environment,payment_id));
CREATE TABLE licensing.provider_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),license_id uuid NOT NULL REFERENCES licensing.licenses(id),
 environment text NOT NULL,event_id text NOT NULL,action text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX provider_coverage_lookup ON licensing.provider_payments(environment,license_id,due_on,coverage_until) WHERE eligible;
CREATE FUNCTION licensing_private.immutable_provider_audit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'PROVIDER_AUDIT_IMMUTABLE';END $$;
CREATE TRIGGER immutable_provider_audit BEFORE UPDATE OR DELETE ON licensing.provider_audit FOR EACH ROW EXECUTE FUNCTION licensing_private.immutable_provider_audit();
ALTER TABLE licensing_private.billing_processors ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_private.billing_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_private.billing_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing.provider_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing.provider_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing_private.billing_processors,licensing_private.billing_contracts,licensing_private.billing_control,licensing.provider_payments,licensing.provider_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON licensing_private.billing_processors,licensing_private.billing_contracts,licensing_private.billing_control,licensing.provider_payments,licensing.provider_audit TO service_role;
GRANT SELECT ON licensing.provider_payments,licensing.provider_audit TO authenticated;
CREATE POLICY provider_payment_read ON licensing.provider_payments FOR SELECT TO authenticated USING(licensing.is_platform_admin() OR EXISTS(SELECT 1 FROM licensing.licenses l WHERE l.id=license_id AND l.owner_id=auth.uid()));
CREATE POLICY provider_audit_read ON licensing.provider_audit FOR SELECT TO authenticated USING(licensing.is_platform_admin() OR EXISTS(SELECT 1 FROM licensing.licenses l WHERE l.id=license_id AND l.owner_id=auth.uid()));

CREATE FUNCTION licensing.claim_billing_event(p_environment text,p_event_id text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE processor licensing_private.billing_processors; job licensing_private.asaas_inbox; v_token uuid:=gen_random_uuid(); BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'INVALID_ENVIRONMENT';END IF;
 INSERT INTO licensing_private.billing_processors(environment) VALUES(p_environment) ON CONFLICT DO NOTHING;
 SELECT * INTO processor FROM licensing_private.billing_processors WHERE environment=p_environment FOR UPDATE;
 IF processor.token IS NOT NULL AND processor.lease_until>clock_timestamp() THEN RETURN NULL;END IF;
 SELECT * INTO job FROM licensing_private.asaas_inbox q WHERE q.environment=p_environment
 AND (p_event_id IS NULL OR q.event_id=p_event_id)
 AND ((q.status IN ('pending','failed') AND q.next_attempt_at<=clock_timestamp() AND q.attempts<8)
 OR (q.status='processing' AND (processor.lease_until IS NULL OR processor.lease_until<=clock_timestamp())))
 ORDER BY q.received_at,q.event_id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN UPDATE licensing_private.billing_processors SET token=NULL,lease_until=NULL WHERE environment=p_environment;RETURN NULL;END IF;
 UPDATE licensing_private.billing_processors SET token=v_token,lease_until=clock_timestamp()+interval '90 seconds' WHERE environment=p_environment;
 UPDATE licensing_private.asaas_inbox SET status='processing',attempts=attempts+1,lease_token=v_token,error_code=NULL WHERE environment=p_environment AND event_id=job.event_id;
 RETURN jsonb_build_object('event_id',job.event_id,'event_type',job.event_type,'payload',job.payload,'lease',v_token,'attempt',job.attempts+1);
END $$;
CREATE FUNCTION licensing_private.check_billing_lease(p_environment text,p_event_id text,p_lease uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM licensing_private.billing_processors WHERE environment=p_environment AND token=p_lease AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM licensing_private.asaas_inbox WHERE environment=p_environment AND event_id=p_event_id AND status='processing' AND lease_token=p_lease) THEN RAISE EXCEPTION 'STALE_BILLING_LEASE';END IF;
END $$;
CREATE FUNCTION licensing.finish_billing_event(p_environment text,p_event_id text,p_lease uuid,p_result text,p_code text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.check_billing_lease(p_environment,p_event_id,p_lease);
 IF p_result IS NULL OR p_result NOT IN ('processed','failed','review') THEN RAISE EXCEPTION 'INVALID_JOB_RESULT';END IF;
 UPDATE licensing_private.asaas_inbox SET status=CASE WHEN p_result='failed' AND attempts>=8 THEN 'review' ELSE p_result END,
 processed_at=CASE WHEN p_result='processed' THEN now() ELSE NULL END,lease_token=NULL,
 error_code=left(p_code,100),next_attempt_at=clock_timestamp()+make_interval(secs=>LEAST(3600,30*power(2,LEAST(attempts-1,7)))::integer)
 WHERE environment=p_environment AND event_id=p_event_id;
 UPDATE licensing_private.billing_processors SET token=NULL,lease_until=NULL WHERE environment=p_environment AND token=p_lease;
END $$;

CREATE FUNCTION licensing.billing_context(p_environment text,p_subscription_id text,p_checkout_id text DEFAULT NULL,p_reference text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE contract licensing_private.billing_contracts; req licensing_private.checkout_requests; lic licensing.licenses; BEGIN
 SELECT * INTO contract FROM licensing_private.billing_contracts WHERE environment=p_environment AND subscription_id=p_subscription_id;
 IF FOUND THEN SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=contract.request_id;
 ELSE
  IF p_checkout_id IS NOT NULL THEN SELECT * INTO req FROM licensing_private.checkout_requests WHERE environment=p_environment AND provider_id=p_checkout_id;
  ELSIF p_reference IS NOT NULL THEN SELECT * INTO req FROM licensing_private.checkout_requests WHERE environment=p_environment AND license_id::text||':'||id::text=p_reference;
  ELSE RETURN NULL;END IF;
 END IF;
 IF req.id IS NULL OR req.provider_id IS NULL OR (contract.subscription_id IS NULL AND req.state NOT IN ('ready','expired','uncertain')) THEN RETURN NULL;END IF;
 SELECT * INTO lic FROM licensing.licenses WHERE id=req.license_id;
 RETURN jsonb_build_object('request_id',req.id,'license_id',req.license_id,'checkout_id',req.provider_id,
 'reference',req.license_id::text||':'||req.id::text,'amount_minor',req.amount_minor,'period',req.period,
 'customer_id',contract.customer_id,'bound',contract.subscription_id IS NOT NULL,'test_mode',lic.test_mode);
END $$;

CREATE FUNCTION licensing.apply_canonical_payment(p_environment text,p_event_id text,p_lease uuid,p_request uuid,p_payment jsonb,p_subscription jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
#variable_conflict use_column
<<canonical>>
DECLARE req licensing_private.checkout_requests; lic licensing.licenses; old licensing.provider_payments;
 contract licensing_private.billing_contracts; control licensing_private.billing_control;
 payment_id text:=p_payment->>'id'; subscription_id text:=p_payment->>'subscription'; customer_id text:=p_payment->>'customer';
 amount_minor bigint:=(p_payment->>'amount_minor')::bigint; due_on date:=(p_payment->>'due_on')::date; paid_on date:=(p_payment->>'paid_on')::date;
 payment_status text:=p_payment->>'status'; eligible boolean; has_refund boolean:=COALESCE((p_payment->>'has_refund')::boolean,false);
 until_at timestamptz; entitlement_until timestamptz; changed boolean; managed boolean; new_status text;
 BEGIN
 PERFORM licensing_private.check_billing_lease(p_environment,p_event_id,p_lease);
 SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=p_request AND environment=p_environment;
 IF NOT FOUND OR req.provider_id IS NULL THEN RAISE EXCEPTION 'UNKNOWN_BILLING_REQUEST';END IF;
 SELECT * INTO lic FROM licensing.licenses WHERE id=req.license_id FOR UPDATE;
 IF (p_environment='sandbox') IS DISTINCT FROM lic.test_mode THEN RAISE EXCEPTION 'BILLING_ENVIRONMENT_MISMATCH';END IF;
 IF payment_id IS NULL OR payment_id !~ '^[a-zA-Z0-9_-]{1,200}$' OR subscription_id IS NULL OR subscription_id !~ '^[a-zA-Z0-9_-]{1,200}$' OR customer_id IS NULL OR customer_id !~ '^[a-zA-Z0-9_-]{1,200}$' OR amount_minor IS DISTINCT FROM req.amount_minor OR due_on IS NULL OR payment_status IS NULL OR payment_status !~ '^[A-Z_]{1,80}$' THEN RAISE EXCEPTION 'INVALID_CANONICAL_PAYMENT';END IF;
 SELECT * INTO contract FROM licensing_private.billing_contracts WHERE environment=p_environment AND billing_contracts.subscription_id=canonical.subscription_id;
 IF FOUND AND (contract.request_id<>req.id OR contract.customer_id<>customer_id OR contract.amount_minor<>amount_minor OR contract.period<>req.period) THEN RAISE EXCEPTION 'BILLING_CONTRACT_CONFLICT';END IF;
 IF p_subscription IS NOT NULL THEN
  IF p_subscription->>'id' IS DISTINCT FROM subscription_id OR p_subscription->>'customer' IS DISTINCT FROM customer_id
  OR (p_subscription->>'amount_minor')::bigint IS DISTINCT FROM req.amount_minor
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
 managed:=NOT lic.complimentary AND (lic.status IN ('pending','reactivation_requested') OR (lic.status='active' AND control.last_revision=lic.billing_revision));
 IF managed THEN
  WITH RECURSIVE coverage(until_at) AS (
   SELECT p.coverage_until FROM licensing.provider_payments p WHERE p.license_id=lic.id AND p.environment=p_environment AND p.eligible
   AND (p.due_on::timestamp AT TIME ZONE 'America/Sao_Paulo')<=clock_timestamp() AND p.coverage_until>clock_timestamp()
   UNION
   SELECT p.coverage_until FROM coverage c JOIN licensing.provider_payments p ON p.license_id=lic.id AND p.environment=p_environment AND p.eligible
   AND (p.due_on::timestamp AT TIME ZONE 'America/Sao_Paulo')<=c.until_at AND p.coverage_until>c.until_at
  ) SELECT max(c.until_at) INTO entitlement_until FROM coverage c;
  new_status:=CASE WHEN entitlement_until>clock_timestamp() THEN 'active' ELSE 'pending' END;
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

CREATE FUNCTION licensing.admin_set_test_mode(p_license uuid,p_enabled boolean,p_request uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE actor uuid; lic licensing.licenses;BEGIN
 actor:=licensing_private.require_admin();SELECT * INTO lic FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND OR lic.institution_id IS NOT NULL OR lic.status<>'pending' OR EXISTS(SELECT 1 FROM licensing_private.billing_contracts WHERE license_id=p_license) THEN RAISE EXCEPTION 'TEST_MODE_CHANGE_NOT_ALLOWED';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('test_mode',p_license,p_enabled)) THEN RETURN;END IF;
 UPDATE licensing.licenses SET test_mode=p_enabled,updated_at=now() WHERE id=p_license;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(p_license,actor,'test_mode_changed',jsonb_build_object('test_mode',p_enabled));
END $$;
CREATE FUNCTION licensing.admin_retry_billing_event(p_environment text,p_event_id text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_admin();
 UPDATE licensing_private.asaas_inbox SET status='pending',next_attempt_at=now(),error_code=NULL,attempts=0
 WHERE environment=p_environment AND event_id=p_event_id AND status IN ('failed','review');
 IF FOUND THEN INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(NULL,auth.uid(),'billing_event_retry',jsonb_build_object('environment',p_environment,'event_id',p_event_id));END IF;
END $$;
CREATE FUNCTION licensing.admin_billing_queue() RETURNS TABLE(environment text,event_id text,state text,attempts integer,error_code text,received_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_admin();
 RETURN QUERY SELECT q.environment,q.event_id,q.status,q.attempts,q.error_code,q.received_at FROM licensing_private.asaas_inbox q ORDER BY q.received_at DESC LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION licensing_private.bump_billing_revision(),licensing_private.immutable_provider_audit(),licensing_private.check_billing_lease(text,text,uuid),licensing.claim_billing_event(text,text),licensing.finish_billing_event(text,text,uuid,text,text),licensing.billing_context(text,text,text,text),licensing.apply_canonical_payment(text,text,uuid,uuid,jsonb,jsonb),licensing.admin_set_test_mode(uuid,boolean,uuid),licensing.admin_retry_billing_event(text,text),licensing.admin_billing_queue() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION licensing.claim_billing_event(text,text),licensing.finish_billing_event(text,text,uuid,text,text),licensing.billing_context(text,text,text,text),licensing.apply_canonical_payment(text,text,uuid,uuid,jsonb,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION licensing.admin_set_test_mode(uuid,boolean,uuid),licensing.admin_retry_billing_event(text,text),licensing.admin_billing_queue() TO authenticated;
COMMIT;
