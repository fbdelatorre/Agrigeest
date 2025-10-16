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
    inst.name as institution_name
  INTO invitation_record
  FROM invitations i
  JOIN institutions inst ON inst.id = i.institution_id
  WHERE i.code = invitation_code;

  -- Check if invitation exists
  IF invitation_record IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'Invalid invitation code'
    );
  END IF;

  -- Check if invitation is expired
  IF invitation_record.expires_at < NOW() THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'Invitation has expired'
    );
  END IF;

  -- Check if invitation is already used
  IF invitation_record.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'valid', false,
      'message', 'Invitation has already been used'
    );
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
  -- Get invitation details with FOR UPDATE to lock the row
  SELECT 
    i.*,
    inst.name as institution_name
  INTO invitation_record
  FROM invitations i
  JOIN institutions inst ON inst.id = i.institution_id
  WHERE i.code = invitation_code
  FOR UPDATE;

  -- Check if invitation exists
  IF invitation_record IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invalid invitation code'
    );
  END IF;

  -- Check if invitation is expired
  IF invitation_record.expires_at < NOW() THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invitation has expired'
    );
  END IF;

  -- Check if invitation is already used
  IF invitation_record.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Invitation has already been used'
    );
  END IF;

  -- Get user details
  SELECT * INTO user_record
  FROM auth.users
  WHERE id = user_id;

  -- Begin transaction
  BEGIN
    -- Update user profile with institution
    UPDATE user_profiles
    SET 
      institution_id = invitation_record.institution_id,
      is_admin = false,
      institution = invitation_record.institution_name
    WHERE id = user_id;

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
      RETURN json_build_object(
        'success', false,
        'message', 'Error joining institution: ' || SQLERRM
      );
  END;
END;
$$;