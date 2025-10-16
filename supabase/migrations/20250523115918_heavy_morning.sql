/*
  # Delete specific user and related data
  
  1. Changes
    - Delete user fbdelatorre@gmail.com and all associated data
    - Clean up related records in all tables
    - Remove institution if user was last member
*/

DO $$ 
DECLARE
  target_user_id uuid;
  target_institution_id uuid;
BEGIN
  -- Get user ID and institution ID with properly qualified columns
  SELECT u.id, up.institution_id 
  INTO target_user_id, target_institution_id
  FROM auth.users u
  JOIN user_profiles up ON up.id = u.id
  WHERE u.email = 'fbdelatorre@gmail.com';

  IF target_user_id IS NOT NULL THEN
    -- Delete all operations by this user
    DELETE FROM operations 
    WHERE user_id = target_user_id;

    -- Delete all areas created by this user
    DELETE FROM areas 
    WHERE user_id = target_user_id;

    -- Delete all seasons created by this user
    DELETE FROM seasons 
    WHERE user_id = target_user_id;

    -- Delete all invitations created by or used by this user
    DELETE FROM invitations 
    WHERE created_by = target_user_id OR used_by = target_user_id;

    -- Delete user profile
    DELETE FROM user_profiles 
    WHERE id = target_user_id;

    -- Delete auth user
    DELETE FROM auth.users 
    WHERE id = target_user_id;

    -- If this was the last user in their institution, delete the institution
    IF NOT EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE institution_id = target_institution_id 
      AND id != target_user_id
    ) THEN
      DELETE FROM institutions 
      WHERE id = target_institution_id;
    END IF;
  END IF;
END $$;