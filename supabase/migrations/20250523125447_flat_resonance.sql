-- Drop existing function first
DROP FUNCTION IF EXISTS validate_invitation(text);

-- Recreate function with unambiguous column references
CREATE OR REPLACE FUNCTION validate_invitation(invitation_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record invitations;
  result json;
BEGIN
  -- Get the invitation record
  SELECT *
  INTO invitation_record
  FROM invitations
  WHERE code = invitation_code;

  -- Check if invitation exists
  IF invitation_record IS NULL THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Invalid invitation code'
    );
  END IF;

  -- Check if invitation is expired
  IF invitation_record.expires_at < NOW() THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Invitation has expired'
    );
  END IF;

  -- Check if invitation is already used
  IF invitation_record.used_at IS NOT NULL THEN
    RETURN json_build_object(
      'valid', false,
      'error', 'Invitation has already been used'
    );
  END IF;

  -- Get institution details using explicit table aliases
  SELECT json_build_object(
    'valid', true,
    'institution_id', i.institution_id,
    'institution_name', inst.name
  )
  INTO result
  FROM invitations i
  JOIN institutions inst ON inst.id = i.institution_id
  WHERE i.code = invitation_code;

  RETURN result;
END;
$$;