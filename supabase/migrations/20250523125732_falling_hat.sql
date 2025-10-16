-- Function to safely delete a user and all their data
CREATE OR REPLACE FUNCTION delete_user_and_data(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_user_id uuid;
  target_institution_id uuid;
BEGIN
  -- Get user ID and institution ID
  SELECT u.id, up.institution_id 
  INTO target_user_id, target_institution_id
  FROM auth.users u
  LEFT JOIN user_profiles up ON up.id = u.id
  WHERE u.email = user_email;

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
END;
$$;

-- Delete specified users
DO $$ 
BEGIN
  -- Delete first user
  PERFORM delete_user_and_data('eu@gmail.com');
  
  -- Delete second user
  PERFORM delete_user_and_data('fbdelatorre@gmail.com');
END $$;