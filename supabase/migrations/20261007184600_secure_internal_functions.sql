-- ETAPA 1H-I Migration A: Harden internal functions
-- handle_new_user (trigger) + clean_expired_invitations
-- Revoke all EXECUTE except postgres

-- handle_new_user: add search_path, qualify table, preserve all logic
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  first_name text;
  last_name text;
  phone text;
  role text;
BEGIN
  -- Get user metadata
  first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  role := COALESCE(NEW.raw_user_meta_data->>'role', '');

  -- Log the user creation
  RAISE LOG 'Creating user profile for new user: %, first_name: %, last_name: %', 
    NEW.id, first_name, last_name;

  -- Create user profile
  INSERT INTO public.user_profiles (
    id,
    first_name,
    last_name,
    phone,
    role,
    institution,
    is_admin,
    institution_id,
    email
  )
  VALUES (
    NEW.id,
    first_name,
    last_name,
    phone,
    role,
    '',
    false,
    NULL,
    NEW.email
  );
  
  RETURN NEW;
END;
$function$;

-- clean_expired_invitations: add search_path, qualify table, preserve DELETE logic
CREATE OR REPLACE FUNCTION public.clean_expired_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  DELETE FROM public.invitations
  WHERE expires_at <= timezone('UTC', now())
  AND used_at IS NULL;
END;
$function$;

-- Grants: revoke all except postgres
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM service_role;

REVOKE EXECUTE ON FUNCTION public.clean_expired_invitations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clean_expired_invitations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.clean_expired_invitations() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.clean_expired_invitations() FROM service_role;
