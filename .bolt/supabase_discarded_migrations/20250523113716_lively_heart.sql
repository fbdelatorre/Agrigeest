/*
  # Fix create_invitation function
  
  1. Changes
    - Drop existing function first to allow return type change
    - Recreate function with proper return type and parameters
    - Maintain security and functionality
*/

-- Drop existing function first
DROP FUNCTION IF EXISTS create_invitation(uuid, integer);

-- Recreate function with proper return type
CREATE OR REPLACE FUNCTION create_invitation(
  institution_id_param uuid,
  expires_in_days integer DEFAULT 7
)
RETURNS TABLE (
  id uuid,
  institution_id uuid,
  code text,
  expires_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  used_at timestamptz,
  used_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_invitation_id uuid;
  new_code text;
BEGIN
  -- Generate a random code (6 characters)
  new_code := substr(md5(random()::text), 1, 6);
  
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
    now() + (expires_in_days || ' days')::interval,
    auth.uid()
  )
  RETURNING id INTO new_invitation_id;
  
  -- Return the newly created invitation
  RETURN QUERY
  SELECT 
    i.id,
    i.institution_id,
    i.code,
    i.expires_at,
    i.created_at,
    i.created_by,
    i.used_at,
    i.used_by
  FROM invitations i
  WHERE i.id = new_invitation_id;
END;
$$;