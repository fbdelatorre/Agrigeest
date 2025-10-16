-- Delete user and related data
DO $$ 
DECLARE
  user_id uuid;
BEGIN
  -- Get user ID from email
  SELECT id INTO user_id
  FROM auth.users
  WHERE email = 'fbdelatorre@gmail.com';

  IF user_id IS NOT NULL THEN
    -- Delete user profile first (this will cascade to other tables)
    DELETE FROM user_profiles
    WHERE id = user_id;

    -- Delete auth user
    DELETE FROM auth.users
    WHERE id = user_id;
  END IF;
END $$;