-- ETAPA 1H-D: Secure delete_invitation
-- Add auth.uid() check, search_path, table qualification, used_at protection, FOUND pattern, restrict grants.

CREATE OR REPLACE FUNCTION public.delete_invitation(invitation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  target_institution_id uuid;
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Get invitation's institution
  SELECT institution_id INTO target_institution_id
  FROM public.invitations
  WHERE code = invitation_code;

  -- Check if invitation exists
  IF target_institution_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if user is admin in the same institution
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = target_institution_id
  ) THEN
    RETURN false;
  END IF;

  -- Delete only if invitation has not been used (preserve audit history)
  DELETE FROM public.invitations
  WHERE code = invitation_code
  AND institution_id = target_institution_id
  AND used_at IS NULL;

  IF FOUND THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

-- Revoke PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.delete_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_invitation(text) FROM anon;

-- Grant explicitly to authenticated, service_role, postgres
GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO postgres;
