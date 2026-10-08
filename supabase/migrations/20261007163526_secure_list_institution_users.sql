-- ETAPA 1F-A: Secure list_institution_users
-- Add auth.uid() check, membership check, search_path protection,
-- and restrict EXECUTE to authenticated only.

CREATE OR REPLACE FUNCTION public.list_institution_users(institution_id_param uuid)
RETURNS TABLE(id uuid, email text, first_name text, last_name text, role text, is_admin boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Require authenticated user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required';
  END IF;

  -- Require membership in the requested institution
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this institution';
  END IF;

  RETURN QUERY
  SELECT
    up.id,
    (au.email)::text AS email,
    up.first_name,
    up.last_name,
    up.role,
    COALESCE(up.is_admin, false) AS is_admin
  FROM public.user_profiles up
  JOIN auth.users au ON au.id = up.id
  WHERE up.institution_id = institution_id_param;
END;
$function$;

-- Revoke EXECUTE from PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.list_institution_users(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_institution_users(uuid) FROM anon;

-- Grant EXECUTE only to authenticated
GRANT EXECUTE ON FUNCTION public.list_institution_users(uuid) TO authenticated;
