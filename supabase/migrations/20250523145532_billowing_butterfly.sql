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
BEGIN
  -- Return early if code is null
  IF invitation_code IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'Invitation code is required'
    );
  END IF;

  -- Get the invitation record with institution name
  SELECT 
    i.*,
    inst.name as institution_name,
    inst.id as institution_id
  INTO invitation_record
  FROM invitations i
  JOIN institutions inst ON inst.id = i.institution_id
  WHERE i.code = TRIM(invitation_code);

  -- Check if invitation exists
  IF invitation_record IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'Invalid invitation code',
      'code', invitation_code
    );
  END IF;

  -- Check if invitation is expired
  IF invitation_record.expires_at < now() THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'This invitation has expired',
      'code', invitation_code,
      'expires_at', invitation_record.expires_at
    );
  END IF;

  -- Check if invitation is already used
  IF invitation_record.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'This invitation has already been used',
      'code', invitation_code,
      'used_at', invitation_record.used_at
    );
  END IF;

  -- Return success with institution details
  RETURN json_build_object(
    'valid', true,
    'institution_id', invitation_record.institution_id,
    'institution_name', invitation_record.institution_name,
    'message', 'Valid invitation',
    'code', invitation_code,
    'expires_at', invitation_record.expires_at
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
BEGIN
  -- Return early if code is null
  IF invitation_code IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invitation code is required'
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
    FROM invitations i
    JOIN institutions inst ON inst.id = i.institution_id
    WHERE i.code = TRIM(invitation_code)
    FOR UPDATE;  -- Lock the row to prevent race conditions

    -- Check if invitation exists
    IF invitation_record IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'message', 'Invalid invitation code',
        'code', invitation_code
      );
    END IF;

    -- Check if invitation is expired
    IF invitation_record.expires_at < now() THEN
      RETURN json_build_object(
        'success', false,
        'message', 'This invitation has expired',
        'code', invitation_code,
        'expires_at', invitation_record.expires_at
      );
    END IF;

    -- Check if invitation is already used
    IF invitation_record.used_at IS NOT NULL THEN
      RETURN json_build_object(
        'success', false,
        'message', 'This invitation has already been used',
        'code', invitation_code,
        'used_at', invitation_record.used_at
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
        'message', 'User not found'
      );
    END IF;

    -- Check if user profile exists
    SELECT * INTO profile_record
    FROM user_profiles
    WHERE id = user_id;

    IF profile_record IS NULL THEN
      -- Create new profile if it doesn't exist
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
      RETURNING * INTO profile_record;
    ELSE
      -- Update existing profile
      UPDATE user_profiles
      SET 
        institution_id = invitation_record.institution_id,
        is_admin = false,
        institution = invitation_record.institution_name,
        email = COALESCE(user_record.email, profile_record.email)
      WHERE id = user_id
      RETURNING * INTO profile_record;
    END IF;

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
      'code', invitation_code,
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
      -- If anything fails, rollback and return error
      RETURN json_build_object(
        'success', false,
        'message', 'Error joining institution: ' || SQLERRM,
        'code', invitation_code
      );
  END;
END;
$$;