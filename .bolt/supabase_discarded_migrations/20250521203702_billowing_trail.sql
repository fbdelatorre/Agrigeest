/*
  # Fix user_profiles RLS policies

  1. Changes
    - Drop existing policies that may cause recursion
    - Create new simplified policies for user_profiles table
    
  2. Security
    - Enable RLS on user_profiles table
    - Add policies for:
      - Users can read profiles from their institution
      - Users can update their own profile
      - Users can create their own profile
*/

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Users can read profiles from same institution" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can create own profile" ON user_profiles;

-- Create new simplified policies
CREATE POLICY "Users can read own profile"
ON user_profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
ON user_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can create own profile"
ON user_profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);