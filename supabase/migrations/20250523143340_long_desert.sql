-- Create function to check invitation codes
CREATE OR REPLACE FUNCTION check_invitation_codes()
RETURNS TABLE (
  code text,
  status text,
  expires_at timestamptz,
  used_at timestamptz,
  institution_name text,
  created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.code,
    CASE 
      WHEN i.used_at IS NOT NULL THEN 'used'
      WHEN i.expires_at < NOW() THEN 'expired'
      ELSE 'valid'
    END as status,
    i.expires_at,
    i.used_at,
    inst.name as institution_name,
    CONCAT(up.first_name, ' ', up.last_name) as created_by_name
  FROM invitations i
  JOIN institutions inst ON inst.id = i.institution_id
  LEFT JOIN user_profiles up ON up.id = i.created_by
  ORDER BY i.created_at DESC;
END;
$$;

-- Create function to check specific invitation code
CREATE OR REPLACE FUNCTION check_specific_invitation(invitation_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record RECORD;
BEGIN
  -- Get invitation details
  SELECT 
    i.code,
    i.expires_at,
    i.used_at,
    i.created_at,
    inst.name as institution_name,
    CONCAT(up.first_name, ' ', up.last_name) as created_by_name,
    CASE 
      WHEN i.used_at IS NOT NULL THEN 'used'
      WHEN i.expires_at < NOW() THEN 'expired'
      ELSE 'valid'
    END as status
  INTO invitation_record
  FROM invitations i
  JOIN institutions inst ON inst.id = i.institution_id
  LEFT JOIN user_profiles up ON up.id = i.created_by
  WHERE i.code = invitation_code;

  IF invitation_record IS NULL THEN
    RETURN json_build_object(
      'found', false,
      'message', 'Invitation code not found'
    );
  END IF;

  RETURN json_build_object(
    'found', true,
    'code', invitation_record.code,
    'status', invitation_record.status,
    'expires_at', invitation_record.expires_at,
    'used_at', invitation_record.used_at,
    'created_at', invitation_record.created_at,
    'institution_name', invitation_record.institution_name,
    'created_by', invitation_record.created_by_name
  );
END;
$$;