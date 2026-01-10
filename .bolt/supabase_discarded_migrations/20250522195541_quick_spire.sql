/*
  # Add multi-tenant functionality
  
  1. New Tables
    - institutions
    - invitations
  2. Changes
    - Add institution_id to existing tables
    - Add is_admin flag to user_profiles
    - Add invitation system
*/

-- Create institutions table if it doesn't exist
CREATE TABLE IF NOT EXISTS institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS on institutions
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read their own institution" ON institutions;
DROP POLICY IF EXISTS "Users can create institutions" ON institutions;

-- Create policies for institutions
CREATE POLICY "Users can read their own institution"
  ON institutions
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create institutions"
  ON institutions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 
      FROM user_profiles 
      WHERE id = auth.uid() 
      AND institution_id IS NOT NULL
    )
  );

-- Add institution_id to existing tables
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE areas
ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE operations
ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

-- Add is_admin flag to user_profiles
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Create invitations table
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE NOT NULL,
  code text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS on invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can read invitations for their institution" ON invitations;
DROP POLICY IF EXISTS "Users can create invitations for their institution" ON invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON invitations;

-- Create policies for invitations
CREATE POLICY "Users can read invitations for their institution"
  ON invitations
  FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create invitations for their institution"
  ON invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Create function to generate random invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS text AS $$
DECLARE
  code text;
  valid boolean;
BEGIN
  LOOP
    -- Generate a random 8-character code
    code := upper(substring(md5(random()::text) from 1 for 8));
    
    -- Check if code already exists
    SELECT NOT EXISTS (
      SELECT 1 
      FROM invitations 
      WHERE invitations.code = code
    ) INTO valid;
    
    EXIT WHEN valid;
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Create function to validate invitation code
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