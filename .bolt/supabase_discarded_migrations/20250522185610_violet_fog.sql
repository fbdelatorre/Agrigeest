/*
  # Add invitation system and admin flag
  
  1. Changes
    - Add is_admin column to user_profiles
    - Set first user as admin
    - Add invitations table with necessary fields
    - Add RLS policies for invitations
    - Add function to validate invitation codes
    
  2. Security
    - Only admins can create invitations
    - Users can only see invitations for their institution
    - Invitations are validated securely
*/

-- Add is_admin column to user_profiles if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' 
    AND column_name = 'is_admin'
  ) THEN
    ALTER TABLE user_profiles
    ADD COLUMN is_admin boolean DEFAULT false;
  END IF;
END $$;

-- Set the first user as admin
UPDATE user_profiles
SET is_admin = true
WHERE id IN (
  SELECT id FROM user_profiles
  ORDER BY created_at ASC
  LIMIT 1
);

-- Create invitations table if it doesn't exist
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  role text
);

-- Enable RLS on invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can create invitations" ON invitations;
DROP POLICY IF EXISTS "Users can read invitations for their institution" ON invitations;

-- Create policies for invitations
CREATE POLICY "Admins can create invitations"
  ON invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

CREATE POLICY "Users can read invitations for their institution"
  ON invitations
  FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id FROM user_profiles
      WHERE id = auth.uid()
    )
  );

-- Function to validate invitation code
CREATE OR REPLACE FUNCTION validate_invitation(
  invitation_code text
) RETURNS TABLE (
  is_valid boolean,
  institution_id uuid,
  message text
) AS $$
DECLARE
  invitation record;
BEGIN
  -- Get invitation details
  SELECT * INTO invitation
  FROM invitations
  WHERE code = invitation_code
  AND used_at IS NULL
  AND expires_at > now();

  -- Check if invitation exists and is valid
  IF invitation IS NULL THEN
    RETURN QUERY SELECT 
      false AS is_valid,
      NULL::uuid AS institution_id,
      'Invalid or expired invitation code'::text AS message;
    RETURN;
  END IF;

  -- Return success
  RETURN QUERY SELECT 
    true AS is_valid,
    invitation.institution_id,
    'Valid invitation'::text AS message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;