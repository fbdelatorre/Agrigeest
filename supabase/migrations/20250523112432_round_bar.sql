/*
  # Fix ambiguous code column in create_invitation function

  1. Changes
    - Update create_invitation function to explicitly reference the invitations table
    for the code column to resolve ambiguity
*/

CREATE OR REPLACE FUNCTION create_invitation(institution_id_param uuid)
RETURNS TABLE (
  code text,
  created_at timestamptz,
  expires_at timestamptz,
  created_by_name text,
  used_at timestamptz,
  used_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code text;
  new_invitation_id uuid;
BEGIN
  -- Generate a random 8-character code
  new_code := substr(md5(random()::text), 1, 8);
  
  -- Insert the new invitation
  INSERT INTO invitations (
    institution_id,
    code,
    expires_at,
    created_by
  )
  VALUES (
    institution_id_param,
    new_code,
    now() + interval '7 days',
    auth.uid()
  )
  RETURNING id INTO new_invitation_id;

  -- Return the invitation details
  RETURN QUERY
  SELECT 
    i.code,
    i.created_at,
    i.expires_at,
    CONCAT(cp.first_name, ' ', cp.last_name) as created_by_name,
    i.used_at,
    CONCAT(up.first_name, ' ', up.last_name) as used_by_name
  FROM invitations i
  LEFT JOIN user_profiles cp ON cp.id = i.created_by
  LEFT JOIN user_profiles up ON up.id = i.used_by
  WHERE i.id = new_invitation_id;
END;
$$;