-- ETAPA 1H-G: Harden validate_invitation
-- Add search_path with pg_temp, qualify tables, restrict PUBLIC grant (keep anon).

CREATE OR REPLACE FUNCTION public.validate_invitation(invitation_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  invitation_record RECORD;
  institution_name text;
BEGIN
  -- Check if invitation exists and is not expired or used
  SELECT i.*, inst.name as institution_name
  INTO invitation_record
  FROM public.invitations i
  JOIN public.institutions inst ON i.institution_id = inst.id
  WHERE i.code = invitation_code
  LIMIT 1;

  -- If no invitation found
  IF invitation_record IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'Invalid invitation code'
    );
  END IF;

  -- Check if invitation is expired
  IF invitation_record.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'Invitation code has expired'
    );
  END IF;

  -- Check if invitation is already used
  IF invitation_record.used_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'Invitation code has already been used'
    );
  END IF;

  -- If all checks pass, return success with institution name
  RETURN jsonb_build_object(
    'valid', true,
    'message', 'Valid invitation code',
    'institution_name', invitation_record.institution_name
  );
END;
$function$;

-- Revoke PUBLIC, grant explicitly to anon (needed for pre-login validation), authenticated, service_role, postgres
REVOKE EXECUTE ON FUNCTION public.validate_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_invitation(text) TO anon;
GRANT EXECUTE ON FUNCTION public.validate_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_invitation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.validate_invitation(text) TO postgres;
