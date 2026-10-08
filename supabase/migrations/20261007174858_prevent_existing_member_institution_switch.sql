-- ETAPA 1G-D: Block institution switching in join_institution
-- Allow join_institution ONLY when the user does not already belong to an institution.
-- Preserves all 1G-B identity protections and the original logic for new users.

CREATE OR REPLACE FUNCTION public.join_institution(
  user_id uuid,
  invitation_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  invitation_record RECORD;
  user_record RECORD;
  profile_record RECORD;
  clean_code text;
BEGIN
  -- Identity check: require authenticated user and matching user_id (1G-B)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized user';
  END IF;

  -- Block institution switching: only allow if user does not already belong to an institution
  IF EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = user_id
      AND institution_id IS NOT NULL
  ) THEN
    RETURN json_build_object(
      'success', false,
      'type', 'error',
      'message', 'User already belongs to an institution'
    );
  END IF;

  -- Clean input
  clean_code := NULLIF(TRIM(invitation_code), '');
  
  -- Return early if code is null or empty
  IF clean_code IS NULL OR clean_code = '' THEN
    RETURN json_build_object(
      'success', false,
      'type', 'error',
      'message', 'Please enter an invitation code'
    );
  END IF;

  -- Start transaction
  BEGIN
    -- Use exception handling to properly catch NO_DATA_FOUND
    BEGIN
      -- Get invitation details with row lock
      SELECT 
        i.*,
        inst.name as institution_name,
        inst.id as institution_id
      INTO 
        invitation_record
      FROM public.invitations i
      JOIN public.institutions inst ON inst.id = i.institution_id
      WHERE i.code = clean_code
      FOR UPDATE OF i;

      -- Check if invitation is already used
      IF invitation_record.used_at IS NOT NULL THEN
        RETURN json_build_object(
          'success', false,
          'type', 'error',
          'message', 'This invitation code has already been used'
        );
      END IF;

      -- Check if invitation is expired
      IF invitation_record.expires_at < now() THEN
        RETURN json_build_object(
          'success', false,
          'type', 'error',
          'message', 'This invitation code has expired'
        );
      END IF;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        -- No invitation found
        RETURN json_build_object(
          'success', false,
          'type', 'error',
          'message', 'Invalid invitation code'
        );
    END;

    -- Get user details
    SELECT * INTO user_record
    FROM auth.users
    WHERE id = user_id;

    -- Check if user exists
    IF user_record IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'type', 'error',
        'message', 'User not found'
      );
    END IF;

    -- Create or update profile
    INSERT INTO public.user_profiles (
      id,
      institution_id,
      is_admin,
      institution,
      first_name,
      last_name,
      phone,
      role,
      email
    )
    VALUES (
      user_id,
      invitation_record.institution_id,
      false,
      invitation_record.institution_name,
      user_record.raw_user_meta_data->>'first_name',
      user_record.raw_user_meta_data->>'last_name',
      user_record.raw_user_meta_data->>'phone',
      user_record.raw_user_meta_data->>'role',
      user_record.email
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      institution_id = EXCLUDED.institution_id,
      is_admin = EXCLUDED.is_admin,
      institution = EXCLUDED.institution,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      phone = EXCLUDED.phone,
      role = EXCLUDED.role,
      email = EXCLUDED.email
    RETURNING * INTO profile_record;

    -- Mark invitation as used
    UPDATE public.invitations
    SET 
      used_at = now(),
      used_by = user_id
    WHERE id = invitation_record.id;

    -- Return success
    RETURN json_build_object(
      'success', true,
      'type', 'success',
      'message', 'Successfully joined ' || invitation_record.institution_name,
      'institution_id', invitation_record.institution_id,
      'institution_name', invitation_record.institution_name,
      'profile', json_build_object(
        'id', profile_record.id,
        'email', profile_record.email,
        'institution_id', profile_record.institution_id,
        'institution', profile_record.institution,
        'first_name', profile_record.first_name,
        'last_name', profile_record.last_name,
        'role', profile_record.role
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object(
        'success', false,
        'type', 'error',
        'message', 'Error joining institution: ' || SQLERRM
      );
  END;
END;
$function$;

-- Ensure grants remain correct (CREATE OR REPLACE may reset ACL)
REVOKE EXECUTE ON FUNCTION public.join_institution(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_institution(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO postgres;
