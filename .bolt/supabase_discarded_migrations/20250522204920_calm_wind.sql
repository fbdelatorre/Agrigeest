/*
  # Fix Seasons RLS Policies

  1. Changes
    - Drop existing RLS policies for seasons table
    - Create new RLS policies with proper institution_id handling
    
  2. Security
    - Enable RLS on seasons table
    - Add policies for CRUD operations that properly handle institution_id
    - Ensure users can only create seasons for their own institution
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can create seasons in their institution" ON seasons;
DROP POLICY IF EXISTS "Users can delete seasons in their institution" ON seasons;
DROP POLICY IF EXISTS "Users can read seasons from their institution" ON seasons;
DROP POLICY IF EXISTS "Users can update seasons in their institution" ON seasons;

-- Create new policies with proper institution_id handling
CREATE POLICY "Users can create seasons in their institution"
ON seasons
FOR INSERT
TO authenticated
WITH CHECK (
  institution_id IN (
    SELECT institution_id 
    FROM user_profiles 
    WHERE id = auth.uid()
  )
  AND 
  user_id = auth.uid()
);

CREATE POLICY "Users can read seasons from their institution"
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

CREATE POLICY "Users can update seasons in their institution"
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

CREATE POLICY "Users can delete seasons in their institution"
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