/*
  # Fix seasons table RLS policies

  1. Changes
    - Drop existing season policies
    - Create new RLS policies that properly handle institution access
    - Ensure proper checks for both institution_id and user_id
    
  2. Security
    - Users can only access seasons from their institution
    - Users must provide their institution_id when creating seasons
    - All operations require proper institution membership
*/

-- Drop existing season policies
DROP POLICY IF EXISTS "Users can read seasons from their institution" ON seasons;
DROP POLICY IF EXISTS "Users can create seasons in their institution" ON seasons;
DROP POLICY IF EXISTS "Users can update seasons in their institution" ON seasons;
DROP POLICY IF EXISTS "Users can delete seasons in their institution" ON seasons;

-- Create new RLS policies for seasons
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
    ) AND
    user_id = auth.uid()
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