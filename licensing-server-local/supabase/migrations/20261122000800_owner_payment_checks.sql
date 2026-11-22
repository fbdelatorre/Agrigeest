-- Recuperação de conferência pelo próprio titular, sem confiar em callback ou comprovante.
BEGIN;
CREATE TABLE licensing_private.payment_check_limits(user_id uuid PRIMARY KEY REFERENCES auth.users(id),checked_at timestamptz NOT NULL);
ALTER TABLE licensing_private.payment_check_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing_private.payment_check_limits FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON licensing_private.payment_check_limits TO service_role;
CREATE FUNCTION licensing.claim_owner_payment_check(p_actor uuid,p_license uuid,p_environment text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE l licensing.licenses; r licensing_private.checkout_requests; claimed uuid; sub text;BEGIN
 SELECT * INTO l FROM licensing.licenses WHERE id=p_license;
 IF NOT FOUND OR l.owner_id IS DISTINCT FROM p_actor OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF p_environment IS NULL OR p_environment NOT IN ('sandbox','production') OR (p_environment='sandbox') IS DISTINCT FROM l.test_mode THEN RAISE EXCEPTION 'BILLING_ENVIRONMENT_MISMATCH';END IF;
 SELECT * INTO r FROM licensing_private.checkout_requests WHERE license_id=l.id AND environment=p_environment AND provider_id IS NOT NULL AND (l.billing_checkout_id IS NULL OR id=l.billing_checkout_id) ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'CHECKOUT_NOT_FOUND';END IF;
 IF (SELECT count(*) FROM licensing_private.billing_contracts WHERE environment=p_environment AND request_id=r.id)>1 THEN RAISE EXCEPTION 'BILLING_CONTRACT_REVIEW';END IF;
 SELECT subscription_id INTO sub FROM licensing_private.billing_contracts WHERE environment=p_environment AND request_id=r.id;
 INSERT INTO licensing_private.payment_check_limits(user_id,checked_at) VALUES(p_actor,clock_timestamp()) ON CONFLICT(user_id) DO UPDATE SET checked_at=EXCLUDED.checked_at WHERE payment_check_limits.checked_at<clock_timestamp()-interval '10 seconds' RETURNING user_id INTO claimed;
 IF claimed IS NULL THEN RAISE EXCEPTION 'PAYMENT_CHECK_RATE_LIMIT';END IF;
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(l.id,p_actor,'payment_check_requested',jsonb_build_object('request_id',r.id,'environment',p_environment));
 RETURN jsonb_build_object('request_id',r.id,'provider_id',r.provider_id,'subscription_id',sub);
END $$;
REVOKE ALL ON FUNCTION licensing.claim_owner_payment_check(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION licensing.claim_owner_payment_check(uuid,uuid,text) TO service_role;
COMMIT;
