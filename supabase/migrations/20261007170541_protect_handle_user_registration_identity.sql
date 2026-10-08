-- ETAPA 1G-A: Protect handle_user_registration with auth.uid() identity check
-- Add identity verification at the top, harden search_path, qualify tables, restrict grants.

CREATE OR REPLACE FUNCTION public.handle_user_registration(
  user_id uuid,
  institution_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  new_institution_id uuid;
  user_profile_record RECORD;
BEGIN
  -- Identity check: require authenticated user and matching user_id
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized user';
  END IF;

  -- Log the function call
  RAISE LOG 'handle_user_registration called with user_id: %, institution_name: %', user_id, institution_name;

  -- Check if institution already exists (case insensitive)
  IF EXISTS (
    SELECT 1 
    FROM public.institutions 
    WHERE LOWER(name) = LOWER(institution_name)
  ) THEN
    RAISE EXCEPTION 'Institution already exists';
  END IF;

  -- Start transaction to ensure atomicity
  BEGIN
    -- Create new institution
    INSERT INTO public.institutions (name, created_by)
    VALUES (institution_name, user_id)
    RETURNING id INTO new_institution_id;
    
    RAISE LOG 'Created new institution with id: %', new_institution_id;

    -- Check if user profile exists
    SELECT * INTO user_profile_record
    FROM public.user_profiles
    WHERE id = user_id;

    IF user_profile_record IS NULL THEN
      -- Create new user profile if it doesn't exist
      RAISE LOG 'User profile does not exist, creating new profile for user: %', user_id;
      
      INSERT INTO public.user_profiles (
        id,
        institution_id,
        is_admin,
        institution,
        first_name,
        last_name,
        phone,
        role
      )
      SELECT
        user_id,
        new_institution_id,
        true,
        institution_name,
        COALESCE(raw_user_meta_data->>'first_name', ''),
        COALESCE(raw_user_meta_data->>'last_name', ''),
        COALESCE(raw_user_meta_data->>'phone', ''),
        COALESCE(raw_user_meta_data->>'role', '')
      FROM auth.users
      WHERE id = user_id;
    ELSE
      -- Update existing user profile
      RAISE LOG 'User profile exists, updating profile for user: %', user_id;
      
      UPDATE public.user_profiles
      SET 
        institution_id = new_institution_id,
        is_admin = true,
        institution = institution_name
      WHERE id = user_id;
    END IF;

    -- Return success
    RETURN json_build_object(
      'success', true,
      'message', 'Successfully created institution and updated user profile',
      'institution_id', new_institution_id,
      'institution_name', institution_name
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error
      RAISE LOG 'Error in handle_user_registration: %, SQLSTATE: %', SQLERRM, SQLSTATE;
      
      -- Re-raise the exception
      RAISE EXCEPTION 'Error creating institution: %', SQLERRM;
  END;
END;
$function$;

-- Revoke EXECUTE from PUBLIC and anon
REVOKE EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) FROM anon;

-- Grant EXECUTE explicitly to authenticated, service_role, postgres
GRANT EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) TO postgres;
