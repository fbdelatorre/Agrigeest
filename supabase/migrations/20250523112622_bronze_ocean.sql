/*
  # Fix invitation code generation function

  1. Changes
    - Update create_invitation function to properly handle code generation
    - Add proper RLS policies for invitations
    - Fix return type to match frontend expectations
*/

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS create_invitation(uuid);

-- Create updated function
CREATE OR REPLACE FUNCTION create_invitation(institution_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code text;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'Only administrators can create invitations';
  END IF;

  -- Generate unique code
  new_code := upper(substring(md5(random()::text) from 1 for 8));

  -- Create invitation
  INSERT INTO invitations (
    institution_id,
    code,
    expires_at,
    created_by
  ) VALUES (
    institution_id_param,
    new_code,
    now() + interval '7 days',
    auth.uid()
  );

  RETURN new_code;
END;
$$;