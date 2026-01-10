/*
  # Fix seasons table RLS policies

  1. Changes
    - Drop existing RLS policies for seasons table
    - Create new simplified policies that properly handle institution-based access
    - Ensure proper checks for season creation
    
  2. Security
    - Users can only access seasons from their institution
    - Season creation requires valid institution membership
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Enable insert for users with matching institution" ON seasons;
DROP POLICY IF EXISTS "Enable select for users with matching institution" ON seasons;
DROP POLICY IF EXISTS "Enable update for users with matching institution" ON seasons;
DROP POLICY IF EXISTS "Enable delete for users with matching institution" ON seasons;

-- Create new policies
CREATE POLICY "Enable select for users with matching institution"
  ON seasons
  FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Enable insert for users with matching institution"
  ON seasons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Enable update for users with matching institution"
  ON seasons
  FOR UPDATE
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

CREATE POLICY "Enable delete for users with matching institution"
  ON seasons
  FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );