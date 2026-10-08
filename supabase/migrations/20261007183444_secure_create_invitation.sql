-- ETAPA 1H-F: Harden create_invitation
-- Add auth.uid() check, search_path with pg_temp, qualify tables, restrict grants.

CREATE OR REPLACE FUNCTION public.create_invitation(p_institution_id uuid, p_expires_in_days integer DEFAULT 7)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  new_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = p_institution_id
  ) THEN
    RAISE EXCEPTION 'Only administrators can create invitations';
  END IF;

  -- Generate unique code
  new_code := upper(substring(md5(random()::text) from 1 for 8));

  -- Create invitation with expiration date
  INSERT INTO public.invitations (
    institution_id,
    code,
    expires_at,
    created_by
  ) VALUES (
    p_institution_id,
    new_code,
    now() + (p_expires_in_days || ' days')::interval,
    auth.uid()
  );

  RETURN new_code;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating invitation: %', SQLERRM;
END;
$function$;

-- Revoke PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.create_invitation(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_invitation(uuid, integer) FROM anon;

-- Grant explicitly to authenticated, service_role, postgres
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, integer) TO postgres;
