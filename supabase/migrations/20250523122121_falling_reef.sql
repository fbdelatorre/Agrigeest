-- Create function to check if institution exists
CREATE OR REPLACE FUNCTION check_institution_exists(institution_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM institutions 
    WHERE LOWER(name) = LOWER(institution_name)
  );
END;
$$;

-- Update handle_user_registration to be more strict
CREATE OR REPLACE FUNCTION handle_user_registration(
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
  -- Check if institution already exists (case insensitive)
  IF EXISTS (
    SELECT 1 
    FROM institutions 
    WHERE LOWER(name) = LOWER(institution_name)
  ) THEN
    RAISE EXCEPTION 'Institution already exists';
  END IF;

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