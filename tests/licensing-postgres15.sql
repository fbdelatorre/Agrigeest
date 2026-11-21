-- Teste de contrato na cópia LOCAL. Todos os fixtures são desfeitos por ROLLBACK.
BEGIN;
CREATE TEMP TABLE checkout_fixture(admin_id uuid,owner_id uuid,other_id uuid,license_id uuid,request_id uuid);
INSERT INTO checkout_fixture VALUES(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,gen_random_uuid());
SET LOCAL session_replication_role='replica';
INSERT INTO auth.users(id,email,email_confirmed_at)
SELECT admin_id,'admin-'||admin_id||'@example.test',now() FROM checkout_fixture UNION ALL
SELECT owner_id,'owner-'||owner_id||'@example.test',now() FROM checkout_fixture UNION ALL
SELECT other_id,'other-'||other_id||'@example.test',now() FROM checkout_fixture;
SET LOCAL session_replication_role='origin';
INSERT INTO licensing_private.platform_admins(user_id) SELECT admin_id FROM checkout_fixture;
GRANT ALL ON checkout_fixture TO authenticated,service_role;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',admin_id::text,true),set_config('request.jwt.claims','{"aal":"aal2"}',true) FROM checkout_fixture;
UPDATE checkout_fixture SET license_id=licensing.admin_create_license(owner_id,'Contrato PG15 fictício','farm','monthly',15000,0,gen_random_uuid());
SELECT licensing.admin_set_test_mode(license_id,true,gen_random_uuid()) FROM checkout_fixture;
SELECT count(*) FROM licensing.admin_checkout_requests();
SELECT set_config('request.jwt.claim.sub',owner_id::text,true) FROM checkout_fixture;
DO $$ DECLARE f record; r jsonb; BEGIN
 SELECT * INTO f FROM checkout_fixture;
 r:=licensing.reserve_checkout(f.license_id,f.request_id,'sandbox');
 IF r->>'state'<>'reserved' THEN RAISE EXCEPTION 'EXPECTED_RESERVATION'; END IF;
 IF licensing.reserve_checkout(f.license_id,f.request_id,'sandbox')<>r THEN RAISE EXCEPTION 'IDEMPOTENCY_FAILED'; END IF;
 BEGIN
  PERFORM licensing.claim_checkout(f.owner_id,f.request_id);
  RAISE EXCEPTION 'USER_CLAIM_WAS_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM licensing.admin_checkout_requests();
  RAISE EXCEPTION 'OWNER_ADMIN_REPORT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub',other_id::text,true) FROM checkout_fixture;
DO $$ DECLARE f record; BEGIN
 SELECT * INTO f FROM checkout_fixture;
 BEGIN
  PERFORM licensing.reserve_checkout(f.license_id,f.request_id,'sandbox');
  RAISE EXCEPTION 'CROSS_OWNER_CHECKOUT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE f record; r jsonb; BEGIN
 SELECT * INTO f FROM checkout_fixture;
 r:=licensing.claim_checkout(f.owner_id,f.request_id);
 IF (r->>'amount_minor')::bigint<>15000 THEN RAISE EXCEPTION 'SERVER_PRICE_FAILED'; END IF;
 IF licensing.claim_checkout(f.owner_id,f.request_id) IS NOT NULL THEN RAISE EXCEPTION 'DOUBLE_CLAIM_ALLOWED'; END IF;
 r:=licensing.finish_checkout(f.owner_id,f.request_id,'pg15_test_checkout');
 IF r->>'state'<>'ready' THEN RAISE EXCEPTION 'CHECKOUT_NOT_READY'; END IF;
 IF EXISTS(SELECT 1 FROM licensing.licenses WHERE id=f.license_id AND status='active') THEN RAISE EXCEPTION 'CHECKOUT_ACTIVATED_WITHOUT_PAYMENT';END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE f record; j jsonb; r jsonb; p jsonb; s jsonb; first_until timestamptz; evt text; due date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; BEGIN
 SELECT * INTO f FROM checkout_fixture;
 p:=jsonb_build_object('id','pay_pg15_canonical','subscription','sub_pg15_canonical','customer','cus_pg15','amount_minor',15000,'status','RECEIVED','due_on',due,'paid_on',due,'checkout_id','pg15_test_checkout','deleted',false,'has_refund',false);
 s:=jsonb_build_object('id','sub_pg15_canonical','customer','cus_pg15','amount_minor',15000,'cycle','MONTHLY','checkout_id','pg15_test_checkout','reference',f.license_id||':'||f.request_id);
 evt:='evt_pg15_'||gen_random_uuid();
 PERFORM licensing.ingest_asaas_event('sandbox',jsonb_build_object('id',evt,'event','PAYMENT_RECEIVED','payment',jsonb_build_object('id',p->>'id')));
 j:=licensing.claim_billing_event('sandbox',evt);
 r:=licensing.apply_canonical_payment('sandbox',evt,(j->>'lease')::uuid,f.request_id,p,s);
 IF r->>'license_status'<>'active' THEN RAISE EXCEPTION 'PG15_CANONICAL_ACTIVATION_FAILED';END IF;
 first_until:=(r->>'valid_until')::timestamptz;
 evt:='evt_pg15_replay_'||gen_random_uuid();
 PERFORM licensing.ingest_asaas_event('sandbox',jsonb_build_object('id',evt,'event','PAYMENT_RECEIVED','payment',jsonb_build_object('id',p->>'id')));
 j:=licensing.claim_billing_event('sandbox',evt);
 r:=licensing.apply_canonical_payment('sandbox',evt,(j->>'lease')::uuid,f.request_id,p,s);
 IF (r->>'changed')::boolean OR (r->>'valid_until')::timestamptz<>first_until THEN RAISE EXCEPTION 'PG15_REPLAY_EXTENDED_COVERAGE';END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',owner_id::text,true) FROM checkout_fixture;
DO $$ DECLARE f record; BEGIN
 SELECT * INTO f FROM checkout_fixture;
 IF NOT licensing.is_active(f.license_id) THEN RAISE EXCEPTION 'CANONICAL_PAYMENT_DID_NOT_ACTIVATE'; END IF;
 PERFORM licensing.owner_license_action(f.license_id,'cancel',gen_random_uuid());
 IF licensing.reserve_checkout(f.license_id,f.request_id,'sandbox')->>'url' IS NOT NULL THEN RAISE EXCEPTION 'CANCELLED_CHECKOUT_URL_EXPOSED'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
