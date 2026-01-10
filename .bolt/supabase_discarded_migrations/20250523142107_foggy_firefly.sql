-- Drop existing functions first
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
  -- Get the invitation record with institution name
  SELECT 
    i.*,
    inst.name as institution_name,
    inst.id as institution_id
  INTO invitation_record
  FROM invitations i
  JOIN institutions inst ON inst.id = i.institution_id
  WHERE UPPER(TRIM(i.code)) = UPPER(TRIM(invitation_code))  -- Case-insensitive and trim whitespace
  AND i.used_at IS NULL  -- Not used yet
  AND i.expires_at > NOW();  -- Not expired

  -- Check if invitation exists and is valid
  IF invitation_record IS NULL THEN
    -- Try to find the invitation to give more specific error
    SELECT i.* INTO invitation_record
    FROM invitations i
    WHERE UPPER(TRIM(i.code)) = UPPER(TRIM(invitation_code));

    IF invitation_record IS NULL THEN
      RETURN json_build_object(
        'valid', false,
        'message', 'Invalid invitation code'
      );
    ELSIF invitation_record.used_at IS NOT NULL THEN
      RETURN json_build_object(
        'valid', false,
        'message', 'This invitation has already been used'
      );
    ELSIF invitation_record.expires_at <= NOW() THEN
      RETURN json_build_object(
        'valid', false,
        'message', 'This invitation has expired'
      );
    ELSE
      RETURN json_build_object(
        'valid', false,
        'message', 'Invalid invitation code'
      );
    END IF;
  END IF;

  -- Return success with institution details
  RETURN json_build_object(
    'valid', true,
    'institution_id', invitation_record.institution_id,
    'institution_name', invitation_record.institution_name,
    'message', 'Valid invitation'
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
BEGIN
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
    WHERE UPPER(TRIM(i.code)) = UPPER(TRIM(invitation_code))  -- Case-insensitive and trim whitespace
    AND i.used_at IS NULL  -- Not used yet
    AND i.expires_at > NOW()  -- Not expired
    FOR UPDATE;  -- Lock the row to prevent race conditions

    -- Check if invitation exists and is valid
    IF invitation_record IS NULL THEN
      -- Try to find the invitation to give more specific error
      SELECT i.* INTO invitation_record
      FROM invitations i
      WHERE UPPER(TRIM(i.code)) = UPPER(TRIM(invitation_code));

      IF invitation_record IS NULL THEN
        RETURN json_build_object(
          'success', false,
          'message', 'Invalid invitation code'
        );
      ELSIF invitation_record.used_at IS NOT NULL THEN
        RETURN json_build_object(
          'success', false,
          'message', 'This invitation has already been used'
        );
      ELSIF invitation_record.expires_at <= NOW() THEN
        RETURN json_build_object(
          'success', false,
          'message', 'This invitation has expired'
        );
      ELSE
        RETURN json_build_object(
          'success', false,
          'message', 'Invalid invitation code'
        );
      END IF;
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
      'institution_name', invitation_record.institution_name
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- If anything fails, rollback and return error
      RAISE EXCEPTION 'Error joining institution: %', SQLERRM;
  END;
END;
$$;