/*
  # Fix create_invitation function overloading issue
  
  1. Changes
    - Drop existing create_invitation functions with different parameter signatures
    - Create a single create_invitation function with clear parameter names
    - Ensure proper error handling and return type
    
  2. Security
    - Maintain SECURITY DEFINER setting
    - Keep admin-only access control
*/

-- Drop all existing create_invitation functions to avoid overloading conflicts
DROP FUNCTION IF EXISTS create_invitation(uuid);
DROP FUNCTION IF EXISTS create_invitation(uuid, integer);
DROP FUNCTION IF EXISTS create_invitation(institution_id_param uuid);
DROP FUNCTION IF EXISTS create_invitation(institution_id_param uuid, expires_in_days integer);

-- Create a single, unambiguous create_invitation function
CREATE OR REPLACE FUNCTION create_invitation(
  p_institution_id uuid,
  p_expires_in_days integer DEFAULT 7
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code text;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = p_institution_id
  ) THEN
    RAISE EXCEPTION 'Only administrators can create invitations';
  END IF;

  -- Generate unique code
  new_code := upper(substring(md5(random()::text) from 1 for 8));

  -- Create invitation with expiration date
  INSERT INTO invitations (
    institution_id,
    code,
    expires_at,
    created_by
  ) VALUES (
    p_institution_id,
    new_code,
    now() + (p_expires_in_days || ' days')::interval,
    auth.uid()
  );

  RETURN new_code;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating invitation: %', SQLERRM;
END;
$$;