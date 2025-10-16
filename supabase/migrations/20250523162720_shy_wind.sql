-- Drop existing functions
DROP FUNCTION IF EXISTS public.validate_invitation(text);
DROP FUNCTION IF EXISTS public.join_institution(uuid, text);

-- Create function to validate invitation with specific error messages
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
  IF clean_code IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'type', 'error',
      'code', 'EMPTY_CODE',
      'message', 'Please enter an invitation code'
    );
  END IF;

  -- Check if user has access to invitations table
  IF NOT has_table_privilege('public.invitations', 'SELECT') THEN
    RETURN json_build_object(
      'valid', false,
      'type', 'error',
      'code', 'PERMISSION_DENIED',
      'message', 'You do not have permission to validate invitations'
    );
  END IF;

  -- First check if invitation exists at all
  SELECT 
    i.*,
    inst.name as institution_name,
    inst.id as institution_id,
    i.used_at IS NOT NULL as is_used,
    i.expires_at < now() as is_expired,
    inst.id IS NULL as invalid_institution
  INTO invitation_record
  FROM public.invitations i
  LEFT JOIN public.institutions inst ON inst.id = i.institution_id
  WHERE i.code = clean_code;

  -- If no invitation found, return invalid code error
  IF invitation_record IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'type', 'error',
      'code', 'INVALID_CODE',
      'message', 'The invitation code you entered is invalid'
    );
  END IF;

  -- Check each error condition in order of priority
  IF invitation_record.invalid_institution THEN
    RETURN json_build_object(
      'valid', false,
      'type', 'error',
      'code', 'INVALID_INSTITUTION',
      'message', 'The institution associated with this invitation no longer exists'
    );
  END IF;

  IF invitation_record.is_used THEN
    RETURN json_build_object(
      'valid', false,
      'type', 'error',
      'code', 'CODE_ALREADY_USED',
      'message', 'This invitation code has already been used'
    );
  END IF;

  IF invitation_record.is_expired THEN
    RETURN json_build_object(
      'valid', false,
      'type', 'error',
      'code', 'CODE_EXPIRED',
      'message', 'This invitation code has expired'
    );
  END IF;

  -- Return success with institution details
  RETURN json_build_object(
    'valid', true,
    'type', 'success',
    'code', 'VALID_CODE',
    'institution_id', invitation_record.institution_id,
    'institution_name', invitation_record.institution_name,
    'message', 'Valid invitation code for ' || invitation_record.institution_name
  );
END;
$$;

-- Create function to join institution with specific error messages
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
  validation_result json;
  invitation_record RECORD;
  user_record RECORD;
  profile_record RECORD;
  clean_code text;
BEGIN
  -- Clean input
  clean_code := NULLIF(TRIM(invitation_code), '');
  
  -- Return early if code is null or empty
  IF clean_code IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'type', 'error',
      'code', 'EMPTY_CODE',
      'message', 'Please enter an invitation code'
    );
  END IF;

  -- Check if user has necessary permissions
  IF NOT has_table_privilege('public.invitations', 'SELECT') OR
     NOT has_table_privilege('public.user_profiles', 'INSERT') THEN
    RETURN json_build_object(
      'success', false,
      'type', 'error',
      'code', 'PERMISSION_DENIED',
      'message', 'You do not have permission to join an institution'
    );
  END IF;

  -- Validate invitation first
  validation_result := public.validate_invitation(clean_code);
  IF NOT (validation_result->>'valid')::boolean THEN
    RETURN validation_result;
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
    FOR UPDATE;

    -- Double check invitation is still valid (race condition check)
    IF invitation_record IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'type', 'error',
        'code', 'INVALID_CODE',
        'message', 'The invitation code you entered is invalid'
      );
    END IF;

    IF invitation_record.used_at IS NOT NULL THEN
      RETURN json_build_object(
        'success', false,
        'type', 'error',
        'code', 'CODE_ALREADY_USED',
        'message', 'This invitation code has already been used'
      );
    END IF;

    IF invitation_record.expires_at < now() THEN
      RETURN json_build_object(
        'success', false,
        'type', 'error',
        'code', 'CODE_EXPIRED',
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
        'code', 'USER_NOT_FOUND',
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
      COALESCE(NULLIF(TRIM(user_record.raw_user_meta_data->>'first_name'), ''), ''),
      COALESCE(NULLIF(TRIM(user_record.raw_user_meta_data->>'last_name'), ''), ''),
      COALESCE(NULLIF(TRIM(user_record.raw_user_meta_data->>'phone'), ''), ''),
      COALESCE(NULLIF(TRIM(user_record.raw_user_meta_data->>'role'), ''), ''),
      COALESCE(NULLIF(TRIM(user_record.email), ''), '')
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      institution_id = EXCLUDED.institution_id,
      is_admin = EXCLUDED.is_admin,
      institution = EXCLUDED.institution,
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
      'code', 'JOIN_SUCCESS',
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
        'code', 'SYSTEM_ERROR',
        'message', 'An error occurred while joining the institution'
      );
  END;
END;
$$;