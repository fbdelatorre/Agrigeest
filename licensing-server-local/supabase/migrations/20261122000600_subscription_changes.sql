-- Somente licenciamento. Nenhuma tabela ou lançamento operacional é alterado.
BEGIN;
ALTER TABLE licensing_private.asaas_inbox ADD COLUMN is_fixture boolean NOT NULL DEFAULT false;
CREATE FUNCTION licensing.mark_billing_test_event(p_event_id text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 UPDATE licensing_private.asaas_inbox SET is_fixture=true WHERE environment='sandbox' AND event_id=p_event_id;
END $$;
DROP FUNCTION licensing.admin_billing_queue();
CREATE FUNCTION licensing.admin_billing_queue() RETURNS TABLE(environment text,event_id text,state text,attempts integer,error_code text,received_at timestamptz,is_fixture boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_admin();
 RETURN QUERY SELECT q.environment,q.event_id,q.status,q.attempts,q.error_code,q.received_at,q.is_fixture FROM licensing_private.asaas_inbox q ORDER BY q.received_at DESC LIMIT 100;
END $$;
CREATE TABLE licensing.extra_prices(kind text NOT NULL CHECK(kind IN ('farm','consultancy')),period text NOT NULL CHECK(period IN ('monthly','annual')),unit_minor bigint NOT NULL CHECK(unit_minor BETWEEN 1 AND 1000000000),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(kind,period));
ALTER TABLE licensing.extra_prices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing.extra_prices FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON licensing.extra_prices TO authenticated,service_role;
CREATE POLICY extra_price_read ON licensing.extra_prices FOR SELECT TO authenticated USING(true);
ALTER TABLE licensing.licenses ADD COLUMN extra_unit_minor bigint CHECK(extra_unit_minor BETWEEN 1 AND 1000000000);
CREATE TABLE licensing_private.subscription_changes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),license_id uuid NOT NULL REFERENCES licensing.licenses(id),environment text NOT NULL CHECK(environment IN ('sandbox','production')),
 subscription_id text NOT NULL,action text NOT NULL CHECK(action IN ('suspend','extras')),state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','failed','review','scheduled','done','superseded')),
 actor_id uuid REFERENCES auth.users(id),target_extras integer CHECK(target_extras BETWEEN 0 AND 100),target_minor bigint CHECK(target_minor BETWEEN 1 AND 1000000000),unit_minor bigint,
 effective_on date,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_token uuid,error_code text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX one_subscription_change ON licensing_private.subscription_changes(environment,subscription_id) WHERE state IN ('pending','processing','failed','review','scheduled');
CREATE TABLE licensing_private.billing_price_versions(environment text NOT NULL,subscription_id text NOT NULL,effective_on date NOT NULL,amount_minor bigint NOT NULL,extras integer NOT NULL,unit_minor bigint,change_id uuid REFERENCES licensing_private.subscription_changes(id),PRIMARY KEY(environment,subscription_id,effective_on),FOREIGN KEY(environment,subscription_id) REFERENCES licensing_private.billing_contracts(environment,subscription_id));
ALTER TABLE licensing_private.subscription_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE licensing_private.billing_price_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing_private.subscription_changes,licensing_private.billing_price_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON licensing_private.subscription_changes,licensing_private.billing_price_versions TO service_role;
INSERT INTO licensing_private.billing_price_versions(environment,subscription_id,effective_on,amount_minor,extras,unit_minor)
 SELECT b.environment,b.subscription_id,'-infinity',b.amount_minor,l.extras,l.extra_unit_minor FROM licensing_private.billing_contracts b JOIN licensing.licenses l ON l.id=b.license_id;

CREATE FUNCTION licensing.admin_set_extra_price(p_kind text,p_period text,p_unit bigint,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE actor uuid;BEGIN
 actor:=licensing_private.require_admin();
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('extra_price',p_kind,p_period,p_unit)) THEN RETURN;END IF;
 INSERT INTO licensing.extra_prices(kind,period,unit_minor) VALUES(p_kind,p_period,p_unit) ON CONFLICT(kind,period) DO UPDATE SET unit_minor=EXCLUDED.unit_minor,updated_at=now();
 INSERT INTO licensing.events(actor_id,action,details) VALUES(actor,'extra_price_set',jsonb_build_object('kind',p_kind,'period',p_period,'unit_minor',p_unit));
END $$;
CREATE FUNCTION licensing.quote_extras(p_license uuid,p_extras integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; unit bigint; total bigint; current_extras integer; current_amount bigint; v licensing_private.billing_price_versions; BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license;
 IF NOT FOUND OR (l.owner_id IS DISTINCT FROM auth.uid() AND NOT licensing.is_platform_admin()) THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_extras IS NULL OR p_extras NOT BETWEEN 0 AND 100 OR l.status<>'active' OR l.complimentary THEN RAISE EXCEPTION 'EXTRAS_NOT_ALLOWED';END IF;
 SELECT v1.* INTO v FROM licensing_private.billing_price_versions v1 JOIN licensing_private.billing_contracts b ON b.environment=v1.environment AND b.subscription_id=v1.subscription_id WHERE b.license_id=l.id ORDER BY v1.effective_on DESC LIMIT 1;
 unit:=COALESCE(v.unit_minor,l.extra_unit_minor);current_extras:=COALESCE(v.extras,l.extras);current_amount:=COALESCE(v.amount_minor,l.amount_minor);
 IF unit IS NULL AND current_extras>0 THEN RAISE EXCEPTION 'LEGACY_EXTRA_PRICE_REQUIRED';END IF;
 IF unit IS NULL THEN SELECT unit_minor INTO unit FROM licensing.extra_prices WHERE kind=l.kind AND period=l.period;END IF;
 IF unit IS NULL THEN RAISE EXCEPTION 'EXTRA_PRICE_NOT_CONFIGURED';END IF;
 total:=current_amount+(p_extras-current_extras)::bigint*unit;
 IF current_amount-current_extras::bigint*unit<=0 OR total NOT BETWEEN 1 AND 1000000000 THEN RAISE EXCEPTION 'INVALID_EXTRA_TOTAL';END IF;
 RETURN jsonb_build_object('extras',p_extras,'current_extras',current_extras,'unit_minor',unit,'amount_minor',total,'users',4+p_extras,'devices',(CASE WHEN l.kind='farm' THEN 6 ELSE 5 END)+2*p_extras);
END $$;
CREATE FUNCTION licensing.request_extra_change(p_license uuid,p_extras integer,p_expected_minor bigint,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; b licensing_private.billing_contracts; q jsonb; created uuid; BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND OR (l.owner_id IS DISTINCT FROM auth.uid() AND NOT licensing.is_platform_admin()) THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('extras_change',p_license,p_extras,p_expected_minor)) THEN SELECT result INTO created FROM licensing_private.requests WHERE id=p_request;RETURN created;END IF;
 q:=licensing.quote_extras(p_license,p_extras);
 IF (q->>'amount_minor')::bigint IS DISTINCT FROM p_expected_minor THEN RAISE EXCEPTION 'EXTRA_QUOTE_CHANGED';END IF;
 IF p_extras=(q->>'current_extras')::integer THEN RAISE EXCEPTION 'EXTRAS_UNCHANGED';END IF;
 IF (SELECT count(*) FROM licensing_private.billing_contracts WHERE license_id=p_license)<>1 THEN RAISE EXCEPTION 'SINGLE_CONTRACT_REQUIRED';END IF;
 SELECT * INTO b FROM licensing_private.billing_contracts WHERE license_id=p_license;
 IF (b.environment='sandbox') IS DISTINCT FROM l.test_mode THEN RAISE EXCEPTION 'BILLING_ENVIRONMENT_MISMATCH';END IF;
 UPDATE licensing_private.subscription_changes SET state='superseded',updated_at=now() WHERE license_id=l.id AND action='extras' AND state='scheduled';
 INSERT INTO licensing_private.subscription_changes(license_id,environment,subscription_id,action,actor_id,target_extras,target_minor,unit_minor)
 VALUES(l.id,b.environment,b.subscription_id,'extras',auth.uid(),p_extras,(q->>'amount_minor')::bigint,(q->>'unit_minor')::bigint) RETURNING id INTO created;
 UPDATE licensing_private.requests SET result=created WHERE id=p_request;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(l.id,auth.uid(),'extras_change_requested',q||jsonb_build_object('change_id',created));RETURN created;
END $$;
CREATE FUNCTION licensing_private.queue_subscription_stop(p_license uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 UPDATE licensing_private.subscription_changes SET state='superseded',updated_at=now() WHERE license_id=p_license AND action='extras' AND state IN ('pending','processing','failed','review','scheduled');
 INSERT INTO licensing_private.subscription_changes(license_id,environment,subscription_id,action,actor_id)
 SELECT license_id,environment,subscription_id,'suspend',COALESCE(auth.uid(),(SELECT owner_id FROM licensing.licenses WHERE id=p_license)) FROM licensing_private.billing_contracts WHERE license_id=p_license
 ON CONFLICT(environment,subscription_id) WHERE state IN ('pending','processing','failed','review','scheduled') DO NOTHING;
END $$;
CREATE FUNCTION licensing_private.stop_on_license_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF (NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status) OR (NEW.complimentary AND NOT OLD.complimentary) THEN PERFORM licensing_private.queue_subscription_stop(NEW.id);END IF;RETURN NEW;
END $$;
CREATE TRIGGER subscription_stop_on_license_change AFTER UPDATE ON licensing.licenses FOR EACH ROW EXECUTE FUNCTION licensing_private.stop_on_license_change();
CREATE FUNCTION licensing_private.initialize_contract_prices() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE l licensing.licenses; BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=NEW.license_id;
 INSERT INTO licensing_private.billing_price_versions VALUES(NEW.environment,NEW.subscription_id,'-infinity',NEW.amount_minor,l.extras,l.extra_unit_minor,NULL);
 IF l.status='cancelled' OR l.complimentary THEN PERFORM licensing_private.queue_subscription_stop(l.id);END IF;RETURN NEW;
END $$;
CREATE TRIGGER initialize_contract_prices AFTER INSERT ON licensing_private.billing_contracts FOR EACH ROW EXECUTE FUNCTION licensing_private.initialize_contract_prices();

CREATE FUNCTION licensing.claim_subscription_change(p_environment text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE processor licensing_private.billing_processors; job licensing_private.subscription_changes; b licensing_private.billing_contracts; v_token uuid:=gen_random_uuid(); BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'INVALID_ENVIRONMENT';END IF;
 INSERT INTO licensing_private.billing_processors(environment) VALUES(p_environment) ON CONFLICT DO NOTHING;
 SELECT * INTO processor FROM licensing_private.billing_processors WHERE environment=p_environment FOR UPDATE;
 IF processor.token IS NOT NULL AND processor.lease_until>clock_timestamp() THEN RETURN NULL;END IF;
 SELECT * INTO job FROM licensing_private.subscription_changes q WHERE environment=p_environment AND
 ((state IN ('pending','failed') AND next_attempt_at<=clock_timestamp() AND attempts<8) OR state='processing')
 ORDER BY CASE WHEN action='suspend' THEN 0 ELSE 1 END,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO b FROM licensing_private.billing_contracts WHERE environment=p_environment AND subscription_id=job.subscription_id;
 UPDATE licensing_private.billing_processors SET token=v_token,lease_until=clock_timestamp()+interval '90 seconds' WHERE environment=p_environment;
 UPDATE licensing_private.subscription_changes SET state='processing',attempts=attempts+1,lease_token=v_token,updated_at=now() WHERE id=job.id;
 RETURN to_jsonb(job)||jsonb_build_object('lease',v_token,'customer_id',b.customer_id,'current_minor',b.amount_minor,'period',b.period);
END $$;
CREATE FUNCTION licensing_private.check_subscription_lease(p_id uuid,p_lease uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM 1 FROM licensing_private.subscription_changes q JOIN licensing_private.billing_processors b ON b.environment=q.environment WHERE q.id=p_id AND q.state='processing' AND q.lease_token=p_lease AND b.token=p_lease AND b.lease_until>clock_timestamp() FOR UPDATE OF q,b;
 IF NOT FOUND THEN RAISE EXCEPTION 'STALE_SUBSCRIPTION_LEASE';END IF;
END $$;
CREATE FUNCTION licensing.prepare_subscription_change(p_id uuid,p_lease uuid,p_date date) RETURNS date LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE job licensing_private.subscription_changes; BEGIN
 PERFORM licensing_private.check_subscription_lease(p_id,p_lease);SELECT * INTO job FROM licensing_private.subscription_changes WHERE id=p_id;
 IF job.action<>'extras' OR p_date IS NULL OR p_date<=(now() AT TIME ZONE 'America/Sao_Paulo')::date OR (job.effective_on IS NOT NULL AND job.effective_on<>p_date) THEN RAISE EXCEPTION 'PROVIDER_EFFECTIVE_DATE_REVIEW';END IF;
 UPDATE licensing_private.subscription_changes SET effective_on=p_date WHERE id=p_id;RETURN p_date;
END $$;
CREATE FUNCTION licensing.finish_subscription_change(p_id uuid,p_lease uuid,p_result text,p_code text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job licensing_private.subscription_changes; l licensing.licenses; managed boolean; BEGIN
 PERFORM licensing_private.check_subscription_lease(p_id,p_lease);SELECT * INTO job FROM licensing_private.subscription_changes WHERE id=p_id;
 SELECT * INTO l FROM licensing.licenses WHERE id=job.license_id FOR UPDATE;
 IF p_result NOT IN ('done','failed','review') OR p_result IS NULL THEN RAISE EXCEPTION 'INVALID_JOB_RESULT';END IF;
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
CREATE FUNCTION licensing.admin_subscription_changes() RETURNS TABLE(id uuid,license_id uuid,environment text,subscription_id text,action text,state text,target_extras integer,target_minor bigint,effective_on date,error_code text,created_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_admin();RETURN QUERY SELECT q.id,q.license_id,q.environment,q.subscription_id,q.action,q.state,q.target_extras,q.target_minor,q.effective_on,q.error_code,q.created_at FROM licensing_private.subscription_changes q ORDER BY q.created_at DESC LIMIT 100;
END $$;
CREATE FUNCTION licensing.admin_retry_subscription_change(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_admin();UPDATE licensing_private.subscription_changes SET state='pending',attempts=0,next_attempt_at=now(),error_code=NULL WHERE id=p_id AND state IN ('failed','review');
END $$;
-- Não interrompe automaticamente contratos já cancelados antes desta migração.
-- Eles só entram na fila por solicitação explícita ou nova mudança da licença.
CREATE FUNCTION licensing.request_subscription_stop(p_license uuid,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE l licensing.licenses;BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND OR (l.owner_id IS DISTINCT FROM auth.uid() AND NOT licensing.is_platform_admin()) THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF l.status<>'cancelled' AND NOT l.complimentary THEN RAISE EXCEPTION 'CANCEL_LICENSE_FIRST';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('stop_subscription',p_license)) THEN RETURN;END IF;
 PERFORM licensing_private.queue_subscription_stop(p_license);
END $$;
REVOKE ALL ON FUNCTION licensing.mark_billing_test_event(text),licensing.admin_billing_queue(),licensing.admin_set_extra_price(text,text,bigint,uuid),licensing.quote_extras(uuid,integer),licensing.request_extra_change(uuid,integer,bigint,uuid),licensing_private.queue_subscription_stop(uuid),licensing_private.stop_on_license_change(),licensing_private.initialize_contract_prices(),licensing.claim_subscription_change(text),licensing_private.check_subscription_lease(uuid,uuid),licensing.prepare_subscription_change(uuid,uuid,date),licensing.finish_subscription_change(uuid,uuid,text,text),licensing.admin_subscription_changes(),licensing.admin_retry_subscription_change(uuid),licensing.request_subscription_stop(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION licensing.mark_billing_test_event(text),licensing.claim_subscription_change(text),licensing.prepare_subscription_change(uuid,uuid,date),licensing.finish_subscription_change(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION licensing.admin_billing_queue(),licensing.admin_set_extra_price(text,text,bigint,uuid),licensing.quote_extras(uuid,integer),licensing.request_extra_change(uuid,integer,bigint,uuid),licensing.admin_subscription_changes(),licensing.admin_retry_subscription_change(uuid),licensing.request_subscription_stop(uuid,uuid) TO authenticated;
-- Funções canônicas atualizadas abaixo usam versões de preço por vencimento.

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
 managed:=NOT lic.complimentary AND (lic.status IN ('pending','reactivation_requested') OR (lic.status='active' AND control.last_revision=lic.billing_revision));
 IF managed THEN
  SELECT * INTO current_price FROM licensing_private.billing_price_versions WHERE environment=p_environment AND billing_price_versions.subscription_id=canonical.subscription_id ORDER BY effective_on DESC LIMIT 1;
  SELECT LEAST(COALESCE(max(v.extras),0),current_price.extras) INTO active_extras FROM licensing.provider_payments p
  JOIN LATERAL(SELECT v1.extras FROM licensing_private.billing_price_versions v1 WHERE v1.environment=p.environment AND v1.subscription_id=p.subscription_id AND v1.effective_on<=p.due_on ORDER BY v1.effective_on DESC LIMIT 1)v ON true
  WHERE p.license_id=lic.id AND p.environment=p_environment AND p.eligible AND (p.due_on::timestamp AT TIME ZONE 'America/Sao_Paulo')<=clock_timestamp() AND p.coverage_until>clock_timestamp();
  IF lic.extras<>active_extras THEN
   UPDATE licensing.licenses SET extras=active_extras,amount_minor=contract.amount_minor,extra_unit_minor=COALESCE(current_price.unit_minor,extra_unit_minor),updated_at=now() WHERE id=lic.id RETURNING * INTO lic;
   UPDATE licensing_private.billing_control SET last_revision=lic.billing_revision WHERE license_id=lic.id;
   INSERT INTO licensing.provider_audit(license_id,environment,event_id,action,details) VALUES(lic.id,p_environment,p_event_id,'extras_reconciled',jsonb_build_object('extras',active_extras,'change_id',current_price.change_id));
  END IF;
  UPDATE licensing_private.subscription_changes SET state='done',updated_at=now() WHERE license_id=lic.id AND action='extras' AND state='scheduled' AND target_extras<=active_extras AND effective_on<=(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
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


CREATE FUNCTION licensing.billing_payment_context(p_environment text,p_subscription_id text,p_checkout_id text,p_reference text,p_due date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ctx jsonb; price bigint; current_amount bigint; BEGIN
 ctx:=licensing.billing_context(p_environment,p_subscription_id,p_checkout_id,p_reference);IF ctx IS NULL THEN RETURN NULL;END IF;
 SELECT amount_minor INTO price FROM licensing_private.billing_price_versions WHERE environment=p_environment AND subscription_id=p_subscription_id AND effective_on<=p_due ORDER BY effective_on DESC LIMIT 1;
 SELECT amount_minor INTO current_amount FROM licensing_private.billing_contracts WHERE environment=p_environment AND subscription_id=p_subscription_id;
 RETURN ctx||jsonb_build_object('amount_minor',COALESCE(price,(ctx->>'amount_minor')::bigint),'subscription_amount_minor',COALESCE(current_amount,(ctx->>'amount_minor')::bigint));
END $$;
REVOKE ALL ON FUNCTION licensing.billing_payment_context(text,text,text,text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION licensing.billing_payment_context(text,text,text,text,date) TO service_role;
CREATE OR REPLACE FUNCTION licensing.admin_create_license(p_owner uuid,p_label text,p_kind text,p_period text,p_amount bigint,p_extras integer,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; created_id uuid; unit bigint; BEGIN
 actor:=licensing_private.require_admin();
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_owner AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'VERIFIED_OWNER_REQUIRED';END IF;
 IF NOT licensing_private.request_once(p_request,jsonb_build_array('create',p_owner,p_label,p_kind,p_period,p_amount,p_extras)) THEN SELECT result INTO created_id FROM licensing_private.requests WHERE id=p_request;RETURN created_id;END IF;
 IF p_extras>0 THEN
  SELECT unit_minor INTO unit FROM licensing.extra_prices WHERE kind=p_kind AND period=p_period;
  IF unit IS NULL THEN RAISE EXCEPTION 'EXTRA_PRICE_NOT_CONFIGURED';END IF;
  IF p_amount-p_extras::bigint*unit<=0 THEN RAISE EXCEPTION 'INVALID_EXTRA_TOTAL';END IF;
 END IF;
 INSERT INTO licensing.licenses(owner_id,label,kind,period,amount_minor,extras,extra_unit_minor) VALUES(p_owner,btrim(p_label),p_kind,p_period,p_amount,p_extras,unit) RETURNING id INTO created_id;
 UPDATE licensing_private.requests SET result=created_id WHERE id=p_request;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(created_id,actor,'license_created',jsonb_build_object('owner',p_owner,'kind',p_kind,'status','pending','extra_unit_minor',unit));RETURN created_id;
END $$;
COMMIT;
