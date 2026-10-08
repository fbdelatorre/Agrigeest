-- ETAPA 1H-B: Secure list_active_invitations
-- Require is_admin, add search_path, qualify tables, restrict grants.

CREATE OR REPLACE FUNCTION public.list_active_invitations(institution_id_param uuid)
RETURNS TABLE(code text, created_at timestamp with time zone, expires_at timestamp with time zone, created_by_name text, used_at timestamp with time zone, used_by_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Require authentication
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Require admin membership in the requested institution
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND institution_id = institution_id_param
      AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only administrators can view invitations';
  END IF;

  RETURN QUERY
  SELECT 
    i.code,
    i.created_at,
    i.expires_at,
    (cp.first_name || ' ' || cp.last_name) as created_by_name,
    i.used_at,
    (up.first_name || ' ' || up.last_name) as used_by_name
  FROM public.invitations i
  LEFT JOIN public.user_profiles cp ON cp.id = i.created_by
  LEFT JOIN public.user_profiles up ON up.id = i.used_by
  WHERE i.institution_id = institution_id_param
  ORDER BY i.created_at DESC;
END;
$function$;

-- Revoke PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.list_active_invitations(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_active_invitations(uuid) FROM anon;

-- Grant explicitly to authenticated, service_role, postgres
GRANT EXECUTE ON FUNCTION public.list_active_invitations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_invitations(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_active_invitations(uuid) TO postgres;
