/*
  # Fix institution-based access control

  1. Changes
    - Drop existing tables and policies to start fresh
    - Create institutions table with proper structure
    - Add institution_id to all relevant tables
    - Set up RLS policies for institution-based access
    - Create functions for invitation management
    
  2. Security
    - Users can only access data from their own institution
    - Admins have additional privileges within their institution
*/

-- Drop existing policies to avoid conflicts
DO $$ 
BEGIN
  -- Drop all existing policies
  DROP POLICY IF EXISTS "Users can read their own institution" ON institutions;
  DROP POLICY IF EXISTS "Users can create institutions" ON institutions;
  DROP POLICY IF EXISTS "Users can read invitations for their institution" ON invitations;
  DROP POLICY IF EXISTS "Users can create invitations for their institution" ON invitations;
  DROP POLICY IF EXISTS "Users can read areas from their institution" ON areas;
  DROP POLICY IF EXISTS "Users can create areas in their institution" ON areas;
  DROP POLICY IF EXISTS "Users can update areas in their institution" ON areas;
  DROP POLICY IF EXISTS "Users can delete areas in their institution" ON areas;
  DROP POLICY IF EXISTS "Users can read operations from their institution" ON operations;
  DROP POLICY IF EXISTS "Users can create operations in their institution" ON operations;
  DROP POLICY IF EXISTS "Users can update operations in their institution" ON operations;
  DROP POLICY IF EXISTS "Users can delete operations in their institution" ON operations;
  DROP POLICY IF EXISTS "Users can read products from their institution" ON products;
  DROP POLICY IF EXISTS "Users can create products in their institution" ON products;
  DROP POLICY IF EXISTS "Users can update products in their institution" ON products;
  DROP POLICY IF EXISTS "Users can delete products in their institution" ON products;
  DROP POLICY IF EXISTS "Users can read seasons from their institution" ON seasons;
  DROP POLICY IF EXISTS "Users can create seasons in their institution" ON seasons;
  DROP POLICY IF EXISTS "Users can update seasons in their institution" ON seasons;
  DROP POLICY IF EXISTS "Users can delete seasons in their institution" ON seasons;
END $$;

-- Create or update institutions table
CREATE TABLE IF NOT EXISTS institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS on institutions
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

-- Create policies for institutions
CREATE POLICY "Users can read their own institution"
  ON institutions FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create institutions"
  ON institutions FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 
      FROM user_profiles 
      WHERE id = auth.uid() 
      AND institution_id IS NOT NULL
    )
  );

-- Add institution_id to all relevant tables
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE areas
ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE operations
ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE products
ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE seasons
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
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  role text
);

-- Enable RLS on invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Create policies for invitations
CREATE POLICY "Users can read invitations for their institution"
  ON invitations FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Admins can create invitations"
  ON invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.is_admin = true
      AND user_profiles.institution_id = invitations.institution_id
    )
  );

-- Create RLS policies for areas
CREATE POLICY "Users can read areas from their institution"
  ON areas FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create areas in their institution"
  ON areas FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update areas in their institution"
  ON areas FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete areas in their institution"
  ON areas FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Create RLS policies for operations
CREATE POLICY "Users can read operations from their institution"
  ON operations FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create operations in their institution"
  ON operations FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update operations in their institution"
  ON operations FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete operations in their institution"
  ON operations FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Create RLS policies for products
CREATE POLICY "Users can read products from their institution"
  ON products FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create products in their institution"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update products in their institution"
  ON products FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete products from their institution"
  ON products FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Create RLS policies for seasons
CREATE POLICY "Users can read seasons from their institution"
  ON seasons FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create seasons in their institution"
  ON seasons FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update seasons in their institution"
  ON seasons FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete seasons in their institution"
  ON seasons FOR DELETE
  TO authenticated
  USING (
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