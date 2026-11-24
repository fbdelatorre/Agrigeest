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
SELECT licensing.admin_set_extra_price('farm','monthly',500,gen_random_uuid());
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
 IF (licensing.quote_extras(f.license_id,1)->>'amount_minor')::bigint<>15500 THEN RAISE EXCEPTION 'PG15_EXTRA_QUOTE_FAILED';END IF;
 PERFORM licensing.request_extra_change(f.license_id,1,15500,gen_random_uuid());
 PERFORM licensing.owner_license_action(f.license_id,'cancel',gen_random_uuid());
 IF licensing.reserve_checkout(f.license_id,f.request_id,'sandbox')->>'url' IS NOT NULL THEN RAISE EXCEPTION 'CANCELLED_CHECKOUT_URL_EXPOSED'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE job jsonb; BEGIN
 job:=licensing.claim_subscription_change('sandbox');
 IF job->>'action'<>'suspend' THEN RAISE EXCEPTION 'PG15_STOP_NOT_QUEUED';END IF;
 PERFORM licensing.finish_subscription_change((job->>'id')::uuid,(job->>'lease')::uuid,'done',NULL);
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',admin_id::text,true) FROM checkout_fixture;
SELECT licensing.admin_set_plan_price('farm','monthly',1000,gen_random_uuid());
SELECT set_config('request.jwt.claim.sub',owner_id::text,true) FROM checkout_fixture;
DO $$ DECLARE f record; purchased uuid; BEGIN
 SELECT * INTO f FROM checkout_fixture;
 purchased:=licensing.start_purchase('farm','monthly','Contratação PG15 pelo titular',0,1000,'sandbox',gen_random_uuid());
 IF licensing.is_active(purchased) THEN RAISE EXCEPTION 'PG15_PURCHASE_ACTIVATED_WITHOUT_PAYMENT';END IF;
 PERFORM licensing.owner_license_action(f.license_id,'request_reactivation',gen_random_uuid());
 PERFORM licensing.reserve_checkout(f.license_id,gen_random_uuid(),'sandbox');
 IF licensing.is_active(f.license_id) THEN RAISE EXCEPTION 'PG15_REACTIVATION_BEFORE_PAYMENT';END IF;
END $$;
RESET ROLE;
-- Cotas de instalações, sessão assinada e preservação do histórico em PostgreSQL 15.
CREATE TEMP TABLE device_fixture_sessions(idx integer,id uuid);
INSERT INTO device_fixture_sessions SELECT n,gen_random_uuid() FROM generate_series(1,7) n;
INSERT INTO auth.sessions(id,user_id) SELECT d.id,f.owner_id FROM device_fixture_sessions d CROSS JOIN checkout_fixture f;
GRANT SELECT ON device_fixture_sessions TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ DECLARE f record; lid uuid; installation uuid; device uuid; first_device uuid; secret text:=repeat('a',64); summary jsonb; BEGIN
 SELECT * INTO f FROM checkout_fixture;
 PERFORM set_config('request.jwt.claim.sub',f.admin_id::text,true);
 PERFORM set_config('request.jwt.claims','{"aal":"aal2"}',true);
 lid:=licensing.admin_create_license(f.owner_id,'Fixture aparelhos PG15','farm','monthly',1000,0,gen_random_uuid());
 PERFORM licensing.admin_set_test_mode(lid,true,gen_random_uuid());
 PERFORM licensing.admin_set_license(lid,'grant_free',NULL,'Fixture local com rollback',gen_random_uuid());
 PERFORM set_config('request.jwt.claim.sub',f.owner_id::text,true);
 FOR n IN 1..6 LOOP
  PERFORM set_config('request.jwt.claims',jsonb_build_object('session_id',(SELECT id FROM device_fixture_sessions WHERE idx=n))::text,true);
  installation:=gen_random_uuid();device:=licensing.register_device(lid,installation,secret,'Instalação PG15 '||n);
  IF n=1 THEN first_device:=device;END IF;
  IF NOT licensing.device_access(lid,installation,secret) THEN RAISE EXCEPTION 'PG15_DEVICE_ACCESS_FAILED';END IF;
  IF licensing.register_device(lid,installation,secret,'Instalação repetida')<>device THEN RAISE EXCEPTION 'PG15_DEVICE_IDEMPOTENCY_FAILED';END IF;
 END LOOP;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('session_id',(SELECT id FROM device_fixture_sessions WHERE idx=7))::text,true);
 BEGIN
  PERFORM licensing.register_device(lid,gen_random_uuid(),secret,'Sétima instalação');RAISE EXCEPTION 'PG15_DEVICE_LIMIT_BYPASSED';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'DEVICE_LIMIT_REACHED' THEN RAISE;END IF;END;
 PERFORM set_config('request.jwt.claim.sub',f.other_id::text,true);
 BEGIN PERFORM licensing.owner_devices(lid);RAISE EXCEPTION 'PG15_DEVICE_OTHER_OWNER_ALLOWED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.jwt.claim.sub',f.owner_id::text,true);
 PERFORM licensing.revoke_device(lid,first_device);
 summary:=licensing.owner_devices(lid);
 IF (summary->>'used')::integer<>5 OR jsonb_array_length(summary->'devices')<>6 THEN RAISE EXCEPTION 'PG15_DEVICE_REVOCATION_HISTORY_FAILED';END IF;
END $$;
RESET ROLE;
-- Integração das equipes e políticas de linhas na cópia local; tudo é temporário.
CREATE TEMP TABLE team_fixture(license_id uuid,organization_id uuid,invitation_id uuid,staff_session uuid);
INSERT INTO team_fixture(staff_session) VALUES(gen_random_uuid());
INSERT INTO auth.sessions(id,user_id) SELECT t.staff_session,f.other_id FROM team_fixture t CROSS JOIN checkout_fixture f;
GRANT ALL ON team_fixture TO authenticated;
CREATE TEMP TABLE team_field_records(id uuid DEFAULT gen_random_uuid(),farm_id uuid,author_id uuid,body text);
ALTER TABLE team_field_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY field_read ON team_field_records FOR SELECT TO authenticated USING(licensing.workspace_can(farm_id,'monitoring',false,author_id));
CREATE POLICY field_insert ON team_field_records FOR INSERT TO authenticated WITH CHECK(licensing.workspace_can(farm_id,'monitoring',true,author_id));
CREATE POLICY field_update ON team_field_records FOR UPDATE TO authenticated USING(licensing.workspace_can(farm_id,'monitoring',true,author_id)) WITH CHECK(licensing.workspace_can(farm_id,'monitoring',true,author_id));
CREATE POLICY field_delete ON team_field_records FOR DELETE TO authenticated USING(licensing.workspace_can(farm_id,'monitoring',true,author_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON team_field_records TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ DECLARE f record; lid uuid; org uuid; invitation jsonb; BEGIN
 SELECT * INTO f FROM checkout_fixture;
 PERFORM set_config('request.jwt.claim.sub',f.admin_id::text,true);PERFORM set_config('request.jwt.claims','{"aal":"aal2"}',true);
 lid:=licensing.admin_create_license(f.owner_id,'Fixture equipe PG15','farm','monthly',1000,0,gen_random_uuid());PERFORM licensing.admin_set_test_mode(lid,true,gen_random_uuid());PERFORM licensing.admin_set_license(lid,'grant_free',NULL,'Fixture com rollback',gen_random_uuid());
 PERFORM set_config('request.jwt.claim.sub',f.owner_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('session_id',(SELECT id FROM device_fixture_sessions WHERE idx=7))::text,true);
 org:=licensing.workspace_initialize(lid,gen_random_uuid());
 invitation:=licensing.workspace_invite(org,'other-'||f.other_id||'@example.test','field_monitor',ARRAY[]::uuid[],NULL,repeat('a',64),gen_random_uuid());
 UPDATE team_fixture SET license_id=lid,organization_id=org,invitation_id=(invitation->>'id')::uuid;
 PERFORM set_config('request.jwt.claim.sub',f.other_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('session_id',(SELECT staff_session FROM team_fixture))::text,true);
 PERFORM licensing.workspace_accept((invitation->>'id')::uuid,gen_random_uuid());
 IF licensing.workspace_can(org,'monitoring',true) THEN RAISE EXCEPTION 'PG15_TEAM_WRITE_WITHOUT_DEVICE';END IF;
 PERFORM licensing.register_device(lid,gen_random_uuid(),repeat('b',64),'Funcionário PG15');
 IF NOT licensing.workspace_can(org,'monitoring',true,f.other_id) OR licensing.workspace_can(org,'inventory',false) THEN RAISE EXCEPTION 'PG15_TEAM_ROLE_FAILED';END IF;
 INSERT INTO team_field_records(farm_id,author_id,body) VALUES(org,f.other_id,'Monitoramento próprio');
END $$;
RESET ROLE;
INSERT INTO team_field_records(farm_id,author_id,body) SELECT t.organization_id,f.owner_id,'Monitoramento do proprietário' FROM team_fixture t CROSS JOIN checkout_fixture f;
INSERT INTO team_field_records(farm_id,author_id,body) SELECT gen_random_uuid(),owner_id,'Outro tenant' FROM checkout_fixture;
SET LOCAL ROLE authenticated;
DO $$ DECLARE f record; t record; changed integer; BEGIN
 SELECT * INTO f FROM checkout_fixture;SELECT * INTO t FROM team_fixture;
 PERFORM set_config('request.jwt.claim.sub',f.other_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('session_id',t.staff_session)::text,true);
 IF (SELECT count(*) FROM team_field_records)<>2 THEN RAISE EXCEPTION 'PG15_TEAM_RLS_READ_ISOLATION';END IF;
 UPDATE team_field_records SET body='Tentativa indevida' WHERE author_id=f.owner_id;GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>0 THEN RAISE EXCEPTION 'PG15_MONITOR_EDITED_OTHER_AUTHOR';END IF;
 UPDATE team_field_records SET body='Edição permitida' WHERE author_id=f.other_id;GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>1 THEN RAISE EXCEPTION 'PG15_MONITOR_OWN_EDIT_DENIED';END IF;
 PERFORM set_config('request.jwt.claim.sub',f.owner_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('session_id',(SELECT id FROM device_fixture_sessions WHERE idx=7))::text,true);PERFORM licensing.owner_license_action(t.license_id,'cancel',gen_random_uuid());
 PERFORM set_config('request.jwt.claim.sub',f.other_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('session_id',t.staff_session)::text,true);
 IF (SELECT count(*) FROM team_field_records)<>2 THEN RAISE EXCEPTION 'PG15_CANCEL_LOST_READ_HISTORY';END IF;
 UPDATE team_field_records SET body='Não deve salvar';GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>0 THEN RAISE EXCEPTION 'PG15_CANCEL_ALLOWED_UPDATE';END IF;
 DELETE FROM team_field_records;GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>0 THEN RAISE EXCEPTION 'PG15_CANCEL_ALLOWED_DELETE';END IF;
 BEGIN INSERT INTO team_field_records(farm_id,author_id,body) VALUES(t.organization_id,f.other_id,'Não deve inserir');RAISE EXCEPTION 'PG15_CANCEL_ALLOWED_INSERT';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
