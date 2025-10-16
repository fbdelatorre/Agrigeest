/*
  # Update Seasons RLS policies

  1. Changes
    - Drop existing INSERT policy
    - Create new INSERT policy with better institution validation
    - Ensure user can only create seasons for their institution

  2. Security
    - Maintains RLS protection
    - Validates institution membership
    - Prevents unauthorized season creation
*/

-- Drop the existing insert policy
DROP POLICY IF EXISTS "Enable insert for users with matching institution" ON seasons;

-- Create new insert policy with better checks
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

-- Ensure RLS is enabled
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;