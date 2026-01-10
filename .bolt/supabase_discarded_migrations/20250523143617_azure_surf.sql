-- Drop existing functions first
DROP FUNCTION IF EXISTS validate_invitation(text);
DROP FUNCTION IF EXISTS join_institution(uuid, text);

-- Create function to validate invitation with expiration debugging
CREATE OR REPLACE FUNCTION validate_invitation(invitation_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record RECORD;
  now_utc timestamptz;
  debug_info json;
BEGIN
  -- Get current time in UTC
  now_utc := timezone('UTC', now());

  -- Get the invitation record with institution name
  SELECT 
    i.*,
    inst.name as institution_name,
    inst.id as institution_id
  INTO invitation_record
  FROM invitations i
  JOIN institutions inst ON inst.id = i.institution_id
  WHERE i.code = invitation_code;

  -- Build debug info
  debug_info := json_build_object(
    'input_code', invitation_code,
    'found', invitation_record IS NOT NULL,
    'current_time', now_utc,
    'expires_at', CASE 
      WHEN invitation_record IS NOT NULL THEN invitation_record.expires_at 
      ELSE NULL 
    END,
    'is_expired', CASE 
      WHEN invitation_record IS NOT NULL THEN invitation_record.expires_at < now_utc
      ELSE NULL 
    END,
    'time_until_expiry', CASE 
      WHEN invitation_record IS NOT NULL THEN 
        extract(epoch from (invitation_record.expires_at - now_utc))
      ELSE NULL 
    END
  );

  -- Check if invitation exists
  IF invitation_record IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'Invalid invitation code',
      'debug', debug_info
    );
  END IF;

  -- Check if invitation is expired
  IF invitation_record.expires_at < now_utc THEN
    RETURN json_build_object(
      'valid', false,
      'message', format(
        'This invitation has expired. Expired at: %s (Current time: %s)',
        invitation_record.expires_at,
        now_utc
      ),
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

-- Create function to join institution with expiration debugging
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
  now_utc timestamptz;
  debug_info json;
BEGIN
  -- Get current time in UTC
  now_utc := timezone('UTC', now());

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
    WHERE i.code = invitation_code
    FOR UPDATE;  -- Lock the row to prevent race conditions

    -- Build debug info
    debug_info := json_build_object(
      'input_code', invitation_code,
      'user_id', user_id,
      'found', invitation_record IS NOT NULL,
      'current_time', now_utc,
      'expires_at', CASE 
        WHEN invitation_record IS NOT NULL THEN invitation_record.expires_at 
        ELSE NULL 
      END,
      'is_expired', CASE 
        WHEN invitation_record IS NOT NULL THEN invitation_record.expires_at < now_utc
        ELSE NULL 
      END,
      'time_until_expiry', CASE 
        WHEN invitation_record IS NOT NULL THEN 
          extract(epoch from (invitation_record.expires_at - now_utc))
        ELSE NULL 
      END
    );

    -- Check if invitation exists
    IF invitation_record IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'message', 'Invalid invitation code',
        'debug', debug_info
      );
    END IF;

    -- Check if invitation is expired
    IF invitation_record.expires_at < now_utc THEN
      RETURN json_build_object(
        'success', false,
        'message', format(
          'This invitation has expired. Expired at: %s (Current time: %s)',
          invitation_record.expires_at,
          now_utc
        ),
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
      used_at = now_utc,
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