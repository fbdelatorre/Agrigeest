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
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',owner_id::text,true) FROM checkout_fixture;
DO $$ DECLARE f record; BEGIN
 SELECT * INTO f FROM checkout_fixture;
 IF licensing.is_active(f.license_id) THEN RAISE EXCEPTION 'CHECKOUT_ACTIVATED_WITHOUT_PAYMENT'; END IF;
 PERFORM licensing.owner_license_action(f.license_id,'cancel',gen_random_uuid());
 IF licensing.reserve_checkout(f.license_id,f.request_id,'sandbox')->>'url' IS NOT NULL THEN RAISE EXCEPTION 'CANCELLED_CHECKOUT_URL_EXPOSED'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
