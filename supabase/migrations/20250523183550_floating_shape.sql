/*
  # Fix user registration and institution association
  
  1. Changes
    - Update handle_user_registration function to properly associate users with institutions
    - Add debug logging to track the registration process
    - Fix transaction handling to ensure atomicity
    
  2. Security
    - Maintain existing security context
    - Ensure proper error handling and validation
*/

-- Drop existing function
DROP FUNCTION IF EXISTS handle_user_registration(uuid, text);

-- Create improved function with better error handling and logging
CREATE OR REPLACE FUNCTION handle_user_registration(
  user_id uuid,
  institution_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_institution_id uuid;
  user_profile_record RECORD;
BEGIN
  -- Log the function call
  RAISE LOG 'handle_user_registration called with user_id: %, institution_name: %', user_id, institution_name;

  -- Check if institution already exists (case insensitive)
  IF EXISTS (
    SELECT 1 
    FROM institutions 
    WHERE LOWER(name) = LOWER(institution_name)
  ) THEN
    RAISE EXCEPTION 'Institution already exists';
  END IF;

  -- Start transaction to ensure atomicity
  BEGIN
    -- Create new institution
    INSERT INTO institutions (name, created_by)
    VALUES (institution_name, user_id)
    RETURNING id INTO new_institution_id;
    
    RAISE LOG 'Created new institution with id: %', new_institution_id;

    -- Check if user profile exists
    SELECT * INTO user_profile_record
    FROM user_profiles
    WHERE id = user_id;

    IF user_profile_record IS NULL THEN
      -- Create new user profile if it doesn't exist
      RAISE LOG 'User profile does not exist, creating new profile for user: %', user_id;
      
      INSERT INTO user_profiles (
        id,
        institution_id,
        is_admin,
        institution,
        first_name,
        last_name,
        phone,
        role
      )
      SELECT
        user_id,
        new_institution_id,
        true,
        institution_name,
        COALESCE(raw_user_meta_data->>'first_name', ''),
        COALESCE(raw_user_meta_data->>'last_name', ''),
        COALESCE(raw_user_meta_data->>'phone', ''),
        COALESCE(raw_user_meta_data->>'role', '')
      FROM auth.users
      WHERE id = user_id;
    ELSE
      -- Update existing user profile
      RAISE LOG 'User profile exists, updating profile for user: %', user_id;
      
      UPDATE user_profiles
      SET 
        institution_id = new_institution_id,
        is_admin = true,
        institution = institution_name
      WHERE id = user_id;
    END IF;

    -- Return success
    RETURN json_build_object(
      'success', true,
      'message', 'Successfully created institution and updated user profile',
      'institution_id', new_institution_id,
      'institution_name', institution_name
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Log the error
      RAISE LOG 'Error in handle_user_registration: %, SQLSTATE: %', SQLERRM, SQLSTATE;
      
      -- Re-raise the exception
      RAISE EXCEPTION 'Error creating institution: %', SQLERRM;
  END;
END;
$$;

-- Update the trigger function to properly handle user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  first_name text;
  last_name text;
  phone text;
  role text;
BEGIN
  -- Get user metadata
  first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  role := COALESCE(NEW.raw_user_meta_data->>'role', '');

  -- Log the user creation
  RAISE LOG 'Creating user profile for new user: %, first_name: %, last_name: %', 
    NEW.id, first_name, last_name;

  -- Create user profile
  INSERT INTO public.user_profiles (
    id,
    first_name,
    last_name,
    phone,
    role,
    institution,
    is_admin,
    institution_id,
    email
  )
  VALUES (
    NEW.id,
    first_name,
    last_name,
    phone,
    role,
    '',
    false,
    NULL,
    NEW.email
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Make sure the trigger is properly set up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();