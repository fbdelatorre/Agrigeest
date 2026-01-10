-- Drop existing functions
DROP FUNCTION IF EXISTS public.validate_invitation(text);
DROP FUNCTION IF EXISTS public.join_institution(uuid, text);

-- Create function to validate invitation (for UI validation only)
CREATE OR REPLACE FUNCTION public.validate_invitation(invitation_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record RECORD;
  clean_code text;
BEGIN
  -- Clean and validate input
  clean_code := NULLIF(TRIM(invitation_code), '');
  
  -- Return early if code is null or empty
  IF clean_code IS NULL OR clean_code = '' THEN
    RETURN json_build_object(
      'valid', false,
      'type', 'error',
      'message', 'Please enter an invitation code'
    );
  END IF;

  -- Get the invitation record with institution details
  SELECT 
    i.*,
    inst.name as institution_name,
    inst.id as institution_id
  INTO invitation_record
  FROM public.invitations i
  JOIN public.institutions inst ON inst.id = i.institution_id
  WHERE i.code = clean_code;

  -- Check if invitation exists
  IF invitation_record IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'type', 'error',
      'message', 'Invalid invitation code'
    );
  END IF;

  -- Check if invitation is already used
  IF invitation_record.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'valid', false,
      'type', 'error',
      'message', 'This invitation code has already been used'
    );
  END IF;

  -- Check if invitation is expired
  IF invitation_record.expires_at < now() THEN
    RETURN json_build_object(
      'valid', false,
      'type', 'error',
      'message', 'This invitation code has expired'
    );
  END IF;

  -- Return success with institution details
  RETURN json_build_object(
    'valid', true,
    'type', 'success',
    'institution_id', invitation_record.institution_id,
    'institution_name', invitation_record.institution_name,
    'message', 'Valid invitation code for ' || invitation_record.institution_name
  );
END;
$$;

-- Create function to join institution with built-in validation
CREATE OR REPLACE FUNCTION public.join_institution(
  user_id uuid,
  invitation_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record RECORD;
  user_record RECORD;
  profile_record RECORD;
  clean_code text;
BEGIN
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
    -- Get invitation details with row lock
    SELECT 
      i.*,
      inst.name as institution_name,
      inst.id as institution_id
    INTO invitation_record
    FROM public.invitations i
    JOIN public.institutions inst ON inst.id = i.institution_id
    WHERE i.code = clean_code
    FOR UPDATE OF i;

    -- Check if invitation exists
    IF invitation_record IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'type', 'error',
        'message', 'Invalid invitation code'
      );
    END IF;

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
      is_admin = false,
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
$$;