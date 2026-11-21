BEGIN;
CREATE FUNCTION licensing.admin_checkout_requests() RETURNS TABLE(
 id uuid,license_id uuid,label text,environment text,state text,amount_minor bigint,period text,created_at timestamptz,provider_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_admin();
 RETURN QUERY SELECT c.id,c.license_id,l.label,c.environment,c.state,c.amount_minor,c.period,c.created_at,c.provider_id
 FROM licensing_private.checkout_requests c JOIN licensing.licenses l ON l.id=c.license_id
 ORDER BY c.created_at DESC,c.id LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION licensing.admin_checkout_requests() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION licensing.admin_checkout_requests() TO authenticated;
COMMIT;
