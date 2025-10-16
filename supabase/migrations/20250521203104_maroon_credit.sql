/*
  # Add institutions and invitations system

  1. New Tables
    - `institutions`
      - `id` (uuid, primary key)
      - `name` (text, not null, unique)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `created_by` (uuid, references auth.users)

    - `invitations`
      - `id` (uuid, primary key)
      - `institution_id` (uuid, references institutions)
      - `code` (text, not null, unique)
      - `expires_at` (timestamptz)
      - `created_at` (timestamptz)
      - `created_by` (uuid, references auth.users)
      - `used_at` (timestamptz)
      - `used_by` (uuid, references auth.users)

  2. Changes
    - Add institution_id to user_profiles
    - Update RLS policies
*/

-- Create institutions table
CREATE TABLE IF NOT EXISTS institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS on institutions
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

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

-- Add institution_id to user_profiles
ALTER TABLE user_profiles
ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

-- Create trigger for institutions updated_at
CREATE TRIGGER update_institutions_updated_at
  BEFORE UPDATE ON institutions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create RLS policies for institutions
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

-- Create RLS policies for invitations
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

-- Update RLS policies for user_profiles
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
CREATE POLICY "Users can read profiles from same institution"
  ON user_profiles
  FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Function to generate random invite code
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