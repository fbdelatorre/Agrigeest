/*
  # Fix handle_user_registration function
  
  1. Changes
    - Drop existing function
    - Recreate function with correct return type and parameters
    - Add security definer for proper permissions
    
  2. Notes
    - Function handles institution creation during registration
    - Sets user as admin of the new institution
*/

-- Drop existing function first
DROP FUNCTION IF EXISTS handle_user_registration(uuid, text);

-- Recreate function with correct implementation
CREATE FUNCTION handle_user_registration(
  user_id uuid,
  institution_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_institution_id uuid;
BEGIN
  -- Create new institution
  INSERT INTO institutions (name, created_by)
  VALUES (institution_name, user_id)
  RETURNING id INTO new_institution_id;

  -- Update user profile with the new institution
  UPDATE user_profiles
  SET 
    institution_id = new_institution_id,
    is_admin = true
  WHERE user_profiles.id = user_id;
END;
$$;