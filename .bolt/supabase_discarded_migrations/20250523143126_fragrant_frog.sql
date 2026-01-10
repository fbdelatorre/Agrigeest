-- Drop existing functions first
DROP FUNCTION IF EXISTS validate_invitation(text);
DROP FUNCTION IF EXISTS join_institution(uuid, text);

-- Create function to validate invitation with debug logging
CREATE OR REPLACE FUNCTION validate_invitation(invitation_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record RECORD;
  debug_info json;
BEGIN
  -- Log input
  RAISE NOTICE 'Validating invitation code: %', invitation_code;

  -- Get the invitation record with institution name
  SELECT 
    i.*,
    inst.name as institution_name,
    inst.id as institution_id,
    json_build_object(
      'code', i.code,
      'expires_at', i.expires_at,
      'used_at', i.used_at,
      'institution_name', inst.name,
      'institution_id', inst.id
    ) as debug
  INTO invitation_record
  FROM invitations i
  JOIN institutions inst ON inst.id = i.institution_id
  WHERE i.code = invitation_code;  -- Exact match

  -- Store debug info
  debug_info := COALESCE(invitation_record.debug, json_build_object(
    'input_code', invitation_code,
    'found', false
  ));
  
  RAISE NOTICE 'Debug info: %', debug_info;

  -- Check if invitation exists
  IF invitation_record IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'Invalid invitation code',
      'debug', debug_info
    );
  END IF;

  -- Check if invitation is expired
  IF invitation_record.expires_at < NOW() THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'This invitation has expired',
      'debug', debug_info
    );
  END IF;

  -- Check if invitation is already used
  IF invitation_record.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'This invitation has already been used',
      'debug', debug_info
    );
  END IF;

  -- Return success with institution details
  RETURN json_build_object(
    'valid', true,
    'institution_id', invitation_record.institution_id,
    'institution_name', invitation_record.institution_name,
    'message', 'Valid invitation',
    'debug', debug_info
  );
END;
$$;

-- Create function to join institution with debug logging
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
  debug_info json;
BEGIN
  -- Log input
  RAISE NOTICE 'Joining institution with code: % for user: %', invitation_code, user_id;

  -- Start transaction
  BEGIN
    -- Get invitation details with row lock
    SELECT 
      i.*,
      inst.name as institution_name,
      inst.id as institution_id,
      json_build_object(
        'code', i.code,
        'expires_at', i.expires_at,
        'used_at', i.used_at,
        'institution_name', inst.name,
        'institution_id', inst.id
      ) as debug
    INTO invitation_record
    FROM invitations i
    JOIN institutions inst ON inst.id = i.institution_id
    WHERE i.code = invitation_code  -- Exact match
    FOR UPDATE;  -- Lock the row to prevent race conditions

    -- Store debug info
    debug_info := COALESCE(invitation_record.debug, json_build_object(
      'input_code', invitation_code,
      'user_id', user_id,
      'found', false
    ));
    
    RAISE NOTICE 'Debug info: %', debug_info;

    -- Check if invitation exists
    IF invitation_record IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'message', 'Invalid invitation code',
        'debug', debug_info
      );
    END IF;

    -- Check if invitation is expired
    IF invitation_record.expires_at < NOW() THEN
      RETURN json_build_object(
        'success', false,
        'message', 'This invitation has expired',
        'debug', debug_info
      );
    END IF;

    -- Check if invitation is already used
    IF invitation_record.used_at IS NOT NULL THEN
      RETURN json_build_object(
        'success', false,
        'message', 'This invitation has already been used',
        'debug', debug_info
      );
    END IF;

    -- Get user details
    SELECT * INTO user_record
    FROM auth.users
    WHERE id = user_id;

    -- Update user profile with institution
    UPDATE user_profiles
    SET 
      institution_id = invitation_record.institution_id,
      is_admin = false,
      institution = invitation_record.institution_name
    WHERE id = user_id;

    -- Get the number of rows affected
    IF NOT FOUND THEN
      -- If no rows were updated, create a new profile
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
        user_record.raw_user_meta_data->>'first_name',
        user_record.raw_user_meta_data->>'last_name',
        user_record.raw_user_meta_data->>'phone',
        user_record.raw_user_meta_data->>'role',
        user_record.email
      );
    END IF;

    -- Mark invitation as used
    UPDATE invitations
    SET 
      used_at = now(),
      used_by = user_id
    WHERE id = invitation_record.id;

    -- Return success
    RETURN json_build_object(
      'success', true,
      'message', 'Successfully joined institution',
      'institution_id', invitation_record.institution_id,
      'institution_name', invitation_record.institution_name,
      'debug', debug_info
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- If anything fails, rollback and return error
      RETURN json_build_object(
        'success', false,
        'message', 'Error joining institution: ' || SQLERRM,
        'debug', debug_info
      );
  END;
END;
$$;