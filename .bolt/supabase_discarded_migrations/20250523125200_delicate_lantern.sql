/*
  # Update validate_invitation function
  
  1. Changes
    - Drop existing function
    - Recreate with JSON return type
    - Add institution name to return value
    
  2. Security
    - Maintain SECURITY DEFINER
    - Set search_path to public
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS validate_invitation(text);

-- Recreate the function with JSON return type
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

  -- Get institution details
  SELECT json_build_object(
    'valid', true,
    'institution_id', invitations.institution_id,
    'institution_name', institutions.name
  )
  INTO result
  FROM invitations
  JOIN institutions ON institutions.id = invitations.institution_id
  WHERE invitations.code = invitation_code;

  RETURN result;
END;
$$;