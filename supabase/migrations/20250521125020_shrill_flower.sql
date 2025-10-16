/*
  # Fix user_profiles RLS policies

  1. Changes
    - Drop existing INSERT policy if exists
    - Create new INSERT policy for authenticated users to create their own profile
    - Ensure proper RLS checks for user profile creation
*/

-- Drop existing INSERT policy if it exists
DROP POLICY IF EXISTS "Allow insert access to all authenticated users" ON user_profiles;

-- Create new INSERT policy with proper conditions
CREATE POLICY "Users can create own profile"
  ON user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);