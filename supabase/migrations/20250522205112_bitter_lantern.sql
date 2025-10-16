/*
  # Fix Seasons Table RLS Policies

  1. Changes
    - Drop existing RLS policies for seasons table
    - Create new, more permissive policies that properly handle institution-based access
    
  2. Security
    - Enable RLS on seasons table
    - Add policies for:
      - Creating seasons (authenticated users within their institution)
      - Reading seasons (users can read seasons from their institution)
      - Updating seasons (users can update seasons in their institution)
      - Deleting seasons (users can delete seasons in their institution)
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create seasons in their institution" ON seasons;
DROP POLICY IF EXISTS "Users can read seasons from their institution" ON seasons;
DROP POLICY IF EXISTS "Users can update seasons in their institution" ON seasons;
DROP POLICY IF EXISTS "Users can delete seasons in their institution" ON seasons;

-- Create new policies
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