-- Autorizações de aparelho exigem uma sessão Auth ainda existente no servidor.
BEGIN;
CREATE OR REPLACE FUNCTION licensing_private.device_owner(p_license uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM licensing.licenses l JOIN auth.users u ON u.id=l.owner_id WHERE l.id=p_license AND l.owner_id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s WHERE s.user_id=auth.uid() AND s.id::text=auth.jwt()->>'session_id' AND (s.not_after IS NULL OR s.not_after>now())) THEN RAISE EXCEPTION 'DEVICE_SESSION_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT (SELECT test_mode FROM licensing.licenses WHERE id=p_license) THEN RAISE EXCEPTION 'DEVICE_STAGE_SANDBOX_ONLY';END IF;
 RETURN auth.uid();
END $$;
REVOKE ALL ON FUNCTION licensing_private.device_owner(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;