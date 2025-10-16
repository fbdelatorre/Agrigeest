-- Drop existing functions
DROP FUNCTION IF EXISTS public.validate_invitation(text);
DROP FUNCTION IF EXISTS public.join_institution(uuid, text);

-- Create function to validate invitation with single check
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

  -- Get the invitation record with all necessary information in a single query
  SELECT 
    i.*,
    inst.name as institution_name,
    inst.id as institution_id,
    CASE
      WHEN inst.id IS NULL THEN 'INVALID_INSTITUTION'
      WHEN i.used_at IS NOT NULL THEN 'CODE_ALREADY_USED'
      WHEN i.expires_at < now() THEN 'CODE_EXPIRED'
      ELSE 'VALID_CODE'
    END as status_code
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

  -- Return appropriate response based on status code
  CASE invitation_record.status_code
    WHEN 'INVALID_INSTITUTION' THEN
      RETURN json_build_object(
        'valid', false,
        'type', 'error',
        'code', 'INVALID_INSTITUTION',
        'message', 'The institution associated with this invitation no longer exists'
      );
    WHEN 'CODE_ALREADY_USED' THEN
      RETURN json_build_object(
        'valid', false,
        'type', 'error',
        'code', 'CODE_ALREADY_USED',
        'message', 'This invitation code has already been used'
      );
    WHEN 'CODE_EXPIRED' THEN
      RETURN json_build_object(
        'valid', false,
        'type', 'error',
        'code', 'CODE_EXPIRED',
        'message', 'This invitation code has expired'
      );
    ELSE
      RETURN json_build_object(
        'valid', true,
        'type', 'success',
        'code', 'VALID_CODE',
        'institution_id', invitation_record.institution_id,
        'institution_name', invitation_record.institution_name,
        'message', 'Valid invitation code for ' || invitation_record.institution_name
      );
  END CASE;
END;
$$;

-- Create function to join institution using the optimized validation
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

  -- Start transaction
  BEGIN
    -- Get invitation details with row lock and validate in a single query
    SELECT 
      i.*,
      inst.name as institution_name,
      inst.id as institution_id,
      CASE
        WHEN inst.id IS NULL THEN 'INVALID_INSTITUTION'
        WHEN i.used_at IS NOT NULL THEN 'CODE_ALREADY_USED'
        WHEN i.expires_at < now() THEN 'CODE_EXPIRED'
        ELSE 'VALID_CODE'
      END as status_code
    INTO invitation_record
    FROM public.invitations i
    LEFT JOIN public.institutions inst ON inst.id = i.institution_id
    WHERE i.code = clean_code
    FOR UPDATE;

    -- Handle invalid or problematic invitations
    IF invitation_record IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'type', 'error',
        'code', 'INVALID_CODE',
        'message', 'The invitation code you entered is invalid'
      );
    END IF;

    IF invitation_record.status_code != 'VALID_CODE' THEN
      RETURN json_build_object(
        'success', false,
        'type', 'error',
        'code', invitation_record.status_code,
        'message', CASE invitation_record.status_code
          WHEN 'INVALID_INSTITUTION' THEN 'The institution associated with this invitation no longer exists'
          WHEN 'CODE_ALREADY_USED' THEN 'This invitation code has already been used'
          WHEN 'CODE_EXPIRED' THEN 'This invitation code has expired'
        END
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