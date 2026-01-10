/*
  # Update invitation system
  
  1. Changes
    - Add function to delete invitations
    - Update create_invitation to use 4 hours expiration
    - Add function to clean expired invitations
    
  2. Security
    - Only admins can delete invitations
    - Only admins from same institution can manage invitations
*/

-- Update create_invitation function to use 4 hours expiration
CREATE OR REPLACE FUNCTION create_invitation(
  institution_id_param uuid
)
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

  -- Create invitation with 4 hours expiration
  INSERT INTO invitations (
    institution_id,
    code,
    expires_at,
    created_by
  ) VALUES (
    institution_id_param,
    new_code,
    now() + interval '4 hours',
    auth.uid()
  );

  RETURN new_code;
END;
$$;

-- Create function to delete invitation
CREATE OR REPLACE FUNCTION delete_invitation(
  invitation_code text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_institution_id uuid;
BEGIN
  -- Get invitation's institution
  SELECT institution_id INTO target_institution_id
  FROM invitations
  WHERE code = invitation_code;

  -- Check if invitation exists
  IF target_institution_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if user is admin in the same institution
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = target_institution_id
  ) THEN
    RETURN false;
  END IF;

  -- Delete the invitation
  DELETE FROM invitations
  WHERE code = invitation_code
  AND institution_id = target_institution_id;

  RETURN true;
END;
$$;

-- Create function to clean expired invitations
CREATE OR REPLACE FUNCTION clean_expired_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM invitations
  WHERE expires_at < now()
  AND used_at IS NULL;
END;
$$;