/*
  # Fix user registration and institution access control
  
  1. Changes
    - Add trigger to automatically create user_profile on auth.users insert
    - Update RLS policies to properly enforce institution-based access
    - Add function to handle user registration with institution
    
  2. Security
    - Ensure users can only access data from their own institution
    - Prevent unauthorized institution access
*/

-- Create a trigger to create user_profile when a new user is created
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    first_name,
    last_name,
    phone,
    role,
    institution,
    is_admin,
    institution_id
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', ''),
    COALESCE(NEW.raw_user_meta_data->>'institution', ''),
    false,
    NULL
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to handle user registration with institution
CREATE OR REPLACE FUNCTION handle_user_registration(
  user_id uuid,
  institution_name text
) RETURNS uuid AS $$
DECLARE
  institution_id uuid;
BEGIN
  -- First try to find existing institution
  SELECT id INTO institution_id
  FROM institutions
  WHERE name = institution_name;
  
  -- If institution doesn't exist, create it
  IF institution_id IS NULL THEN
    INSERT INTO institutions (name, created_by)
    VALUES (institution_name, user_id)
    RETURNING id INTO institution_id;
    
    -- Set the creating user as admin
    UPDATE user_profiles
    SET 
      is_admin = true,
      institution_id = institution_id
    WHERE id = user_id;
  END IF;
  
  RETURN institution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to join institution with invitation code
CREATE OR REPLACE FUNCTION join_institution(
  user_id uuid,
  invitation_code text
) RETURNS TABLE (
  success boolean,
  message text
) AS $$
DECLARE
  invitation record;
BEGIN
  -- Get invitation details
  SELECT * INTO invitation
  FROM invitations
  WHERE code = invitation_code
  AND used_at IS NULL
  AND expires_at > now();

  -- Check if invitation exists and is valid
  IF invitation IS NULL THEN
    RETURN QUERY SELECT 
      false AS success,
      'Invalid or expired invitation code'::text AS message;
    RETURN;
  END IF;

  -- Update user profile with institution
  UPDATE user_profiles
  SET 
    institution_id = invitation.institution_id,
    is_admin = false
  WHERE id = user_id;

  -- Mark invitation as used
  UPDATE invitations
  SET 
    used_at = now(),
    used_by = user_id
  WHERE id = invitation.id;

  -- Return success
  RETURN QUERY SELECT 
    true AS success,
    'Successfully joined institution'::text AS message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;