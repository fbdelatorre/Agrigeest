/*
  # Fix create_invitation function ambiguous column references
  
  1. Changes
    - Drop existing function if it exists
    - Recreate function with explicit table aliases
    - Fix ambiguous column references
    
  2. Security
    - Maintain SECURITY DEFINER setting
    - Keep existing access controls
*/

-- Drop existing function
DROP FUNCTION IF EXISTS create_invitation(uuid, integer);

-- Recreate function with fixed column references
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
  new_invitation invitations;
BEGIN
  -- Generate a random code (6 characters)
  WITH new_code AS (
    SELECT substr(md5(random()::text), 1, 6) as code
  )
  -- Insert the new invitation
  INSERT INTO invitations (
    institution_id,
    code,
    expires_at,
    created_by
  )
  SELECT 
    institution_id_param,
    new_code.code,
    now() + (expires_in_days || ' days')::interval,
    auth.uid()
  FROM new_code
  RETURNING * INTO new_invitation;
  
  -- Return the newly created invitation
  RETURN QUERY
  SELECT 
    new_invitation.id,
    new_invitation.institution_id,
    new_invitation.code,
    new_invitation.expires_at,
    new_invitation.created_at,
    new_invitation.created_by,
    new_invitation.used_at,
    new_invitation.used_by;
END;
$$;