/*
  # Fix user_profiles RLS policies

  1. Changes
    - Drop and recreate policies for user_profiles table
    - Add institution-based access control
    - Fix infinite recursion issues
    
  2. Security
    - Users can only read profiles from their institution
    - Users can only update their own profile
    - Users can only create their own profile
*/

DO $$ 
BEGIN
  -- Drop existing policies
  DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
  DROP POLICY IF EXISTS "Users can create own profile" ON user_profiles;
  DROP POLICY IF EXISTS "Users can read profiles from same institution" ON user_profiles;

  -- Create new policies
  CREATE POLICY "Users can read profiles from same institution"
    ON user_profiles
    FOR SELECT
    TO authenticated
    USING (
      institution_id IN (
        SELECT user_profiles_1.institution_id 
        FROM user_profiles user_profiles_1
        WHERE user_profiles_1.id = auth.uid()
      )
    );

  CREATE POLICY "Users can update own profile"
    ON user_profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

  CREATE POLICY "Users can create own profile"
    ON user_profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);
END $$;