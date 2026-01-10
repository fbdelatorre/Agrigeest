-- Function to safely delete a user and all their data
CREATE OR REPLACE FUNCTION delete_user_and_data(user_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  target_institution_id uuid;
  is_admin boolean;
  user_count integer;
  next_admin_id uuid;
BEGIN
  -- Get user ID, institution ID, and admin status
  SELECT u.id, up.institution_id, up.is_admin 
  INTO target_user_id, target_institution_id, is_admin
  FROM auth.users u
  LEFT JOIN user_profiles up ON up.id = u.id
  WHERE u.email = user_email;

  -- Skip if user not found
  IF target_user_id IS NULL THEN
    RAISE NOTICE 'User % not found, skipping', user_email;
    RETURN;
  END IF;

  -- Skip if this is fabricio.grupodelatorre@gmail.com
  IF user_email = 'fabricio.grupodelatorre@gmail.com' THEN
    RAISE NOTICE 'Skipping deletion of protected user: %', user_email;
    RETURN;
  END IF;

  -- Count users in the institution
  SELECT COUNT(*) INTO user_count
  FROM user_profiles
  WHERE institution_id = target_institution_id;

  -- If this is the only user in the institution, delete all institution data
  IF user_count = 1 THEN
    -- Delete all operations by this user
    DELETE FROM operations 
    WHERE institution_id = target_institution_id;

    -- Delete all areas created by this user
    DELETE FROM areas 
    WHERE institution_id = target_institution_id;

    -- Delete all seasons created by this user
    DELETE FROM seasons 
    WHERE institution_id = target_institution_id;

    -- Delete all products
    DELETE FROM products 
    WHERE institution_id = target_institution_id;

    -- Delete all invitations created by or used by this user
    DELETE FROM invitations 
    WHERE institution_id = target_institution_id;

    -- Delete user profile
    DELETE FROM user_profiles 
    WHERE id = target_user_id;

    -- Delete auth user
    DELETE FROM auth.users 
    WHERE id = target_user_id;

    -- Delete the institution
    DELETE FROM institutions 
    WHERE id = target_institution_id;
  ELSE
    -- If admin and there are other users, transfer admin to another user
    IF is_admin THEN
      -- Find another user to make admin using row_number instead of LIMIT
      WITH ranked_users AS (
        SELECT 
          id,
          ROW_NUMBER() OVER (ORDER BY created_at) as row_num
        FROM user_profiles
        WHERE 
          institution_id = target_institution_id AND
          id != target_user_id
      )
      SELECT id INTO next_admin_id
      FROM ranked_users
      WHERE row_num = 1;
      
      -- Make the selected user an admin
      IF next_admin_id IS NOT NULL THEN
        UPDATE user_profiles
        SET is_admin = true
        WHERE id = next_admin_id;
      END IF;
    END IF;

    -- Delete user's operations
    DELETE FROM operations 
    WHERE user_id = target_user_id;

    -- Delete user's areas
    DELETE FROM areas 
    WHERE user_id = target_user_id;

    -- Delete user's seasons
    DELETE FROM seasons 
    WHERE user_id = target_user_id;

    -- Delete invitations created by or used by this user
    DELETE FROM invitations 
    WHERE created_by = target_user_id OR used_by = target_user_id;

    -- Delete user profile
    DELETE FROM user_profiles 
    WHERE id = target_user_id;

    -- Delete auth user
    DELETE FROM auth.users 
    WHERE id = target_user_id;
  END IF;
END;
$$;

-- Delete all users except fabricio.grupodelatorre@gmail.com
DO $$ 
DECLARE
  user_record RECORD;
BEGIN
  -- Get all users except the protected one
  FOR user_record IN
    SELECT email 
    FROM auth.users 
    WHERE email != 'fabricio.grupodelatorre@gmail.com'
  LOOP
    RAISE NOTICE 'Deleting user: %', user_record.email;
    PERFORM delete_user_and_data(user_record.email);
  END LOOP;
END $$;

-- Drop the function after use
DROP FUNCTION IF EXISTS delete_user_and_data(text);