-- Drop existing functions
DROP FUNCTION IF EXISTS validate_invitation(text);
DROP FUNCTION IF EXISTS join_institution(uuid, text);

-- Create function to validate invitation
CREATE OR REPLACE FUNCTION validate_invitation(invitation_code text)
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
  clean_code := TRIM(invitation_code);
  
  -- Return early if code is null or empty
  IF clean_code IS NULL OR clean_code = '' THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'Invitation code is required'
    );
  END IF;

  -- Get the invitation record with institution name using a CTE to ensure data consistency
  WITH invitation_data AS (
    SELECT 
      i.*,
      inst.name as institution_name,
      inst.id as institution_id
    FROM invitations i
    JOIN institutions inst ON inst.id = i.institution_id
    WHERE i.code = clean_code
  )
  SELECT * INTO invitation_record FROM invitation_data;

  -- Log for debugging
  RAISE NOTICE 'Validating invitation code: %, Record: %', clean_code, invitation_record;

  -- Check if invitation exists
  IF invitation_record IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'Invalid invitation code',
      'debug', json_build_object(
        'code', clean_code,
        'found', false
      )
    );
  END IF;

  -- Check if invitation is expired
  IF invitation_record.expires_at < now() THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'This invitation has expired',
      'debug', json_build_object(
        'code', clean_code,
        'expires_at', invitation_record.expires_at,
        'current_time', now()
      )
    );
  END IF;

  -- Check if invitation is already used
  IF invitation_record.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'This invitation has already been used',
      'debug', json_build_object(
        'code', clean_code,
        'used_at', invitation_record.used_at
      )
    );
  END IF;

  -- Return success with institution details
  RETURN json_build_object(
    'valid', true,
    'institution_id', invitation_record.institution_id,
    'institution_name', invitation_record.institution_name,
    'message', 'Valid invitation',
    'debug', json_build_object(
      'code', clean_code,
      'institution_id', invitation_record.institution_id,
      'institution_name', invitation_record.institution_name
    )
  );
END;
$$;

-- Create function to join institution
CREATE OR REPLACE FUNCTION join_institution(
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
  -- Clean and validate input
  clean_code := TRIM(invitation_code);
  
  -- Return early if code is null or empty
  IF clean_code IS NULL OR clean_code = '' THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invitation code is required'
    );
  END IF;

  -- Start transaction
  BEGIN
    -- Get invitation details with row lock using CTE for data consistency
    WITH invitation_data AS (
      SELECT 
        i.*,
        inst.name as institution_name,
        inst.id as institution_id
      FROM invitations i
      JOIN institutions inst ON inst.id = i.institution_id
      WHERE i.code = clean_code
      FOR UPDATE OF i
    )
    SELECT * INTO invitation_record FROM invitation_data;

    -- Log for debugging
    RAISE NOTICE 'Processing invitation: %, Code: %', invitation_record, clean_code;

    -- Check if invitation exists
    IF invitation_record IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'message', 'Invalid invitation code',
        'debug', json_build_object('code', clean_code)
      );
    END IF;

    -- Check if invitation is expired
    IF invitation_record.expires_at < now() THEN
      RETURN json_build_object(
        'success', false,
        'message', 'This invitation has expired',
        'debug', json_build_object(
          'code', clean_code,
          'expires_at', invitation_record.expires_at
        )
      );
    END IF;

    -- Check if invitation is already used
    IF invitation_record.used_at IS NOT NULL THEN
      RETURN json_build_object(
        'success', false,
        'message', 'This invitation has already been used',
        'debug', json_build_object(
          'code', clean_code,
          'used_at', invitation_record.used_at
        )
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
        'message', 'User not found',
        'debug', json_build_object('user_id', user_id)
      );
    END IF;

    -- Create or update profile using CTE for data consistency
    WITH new_profile AS (
      INSERT INTO user_profiles (
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
        COALESCE(user_record.raw_user_meta_data->>'first_name', ''),
        COALESCE(user_record.raw_user_meta_data->>'last_name', ''),
        COALESCE(user_record.raw_user_meta_data->>'phone', ''),
        COALESCE(user_record.raw_user_meta_data->>'role', ''),
        COALESCE(user_record.email, '')
      )
      ON CONFLICT (id) DO UPDATE
      SET 
        institution_id = EXCLUDED.institution_id,
        is_admin = EXCLUDED.is_admin,
        institution = EXCLUDED.institution,
        email = EXCLUDED.email
      RETURNING *
    )
    SELECT * INTO profile_record FROM new_profile;

    -- Verify profile was created/updated
    IF profile_record IS NULL THEN
      RAISE EXCEPTION 'Failed to create/update user profile';
    END IF;

    -- Mark invitation as used
    UPDATE invitations
    SET 
      used_at = now(),
      used_by = user_id
    WHERE id = invitation_record.id;

    -- Return success with all relevant details
    RETURN json_build_object(
      'success', true,
      'message', 'Successfully joined institution',
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
      ),
      'debug', json_build_object(
        'code', clean_code,
        'user_id', user_id,
        'institution_id', invitation_record.institution_id
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error details
      RAISE NOTICE 'Error in join_institution: %, SQLSTATE: %', SQLERRM, SQLSTATE;
      -- If anything fails, rollback and return error
      RAISE EXCEPTION 'Error joining institution: %', SQLERRM;
  END;
END;
$$;