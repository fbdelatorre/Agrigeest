/*
  # Fix seasons table RLS policies

  1. Changes
    - Update INSERT policy to ensure both user_id and institution_id are set correctly
    - Simplify policy conditions for better maintainability
  
  2. Security
    - Maintains RLS protection
    - Ensures users can only create seasons for their institution
    - Enforces user_id to match the authenticated user
*/

-- Drop existing insert policy
DROP POLICY IF EXISTS "Enable insert for users with matching institution" ON seasons;

-- Create new insert policy with proper user_id and institution_id checks
CREATE POLICY "Enable insert for users with matching institution"
ON seasons
FOR INSERT
TO authenticated
WITH CHECK (
  -- Ensure user_id matches the authenticated user
  user_id = auth.uid()
  AND
  -- Ensure institution_id matches the user's institution
  institution_id IN (
    SELECT institution_id
    FROM user_profiles
    WHERE id = auth.uid()
  )
);