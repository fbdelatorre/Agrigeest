-- Create function to list users in institution
CREATE OR REPLACE FUNCTION list_institution_users(
  institution_id_param uuid
)
RETURNS TABLE (
  id uuid,
  email text,
  first_name text,
  last_name text,
  role text,
  is_admin boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user belongs to institution
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'User does not belong to this institution';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    up.first_name,
    up.last_name,
    up.role,
    up.is_admin
  FROM auth.users u
  JOIN user_profiles up ON up.id = u.id
  WHERE up.institution_id = institution_id_param
  ORDER BY up.first_name, up.last_name;
END;
$$;

-- Create function to toggle user admin status
CREATE OR REPLACE FUNCTION toggle_user_admin_status(
  user_id_param uuid,
  new_status boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target_institution_id uuid;
BEGIN
  -- Get the target user's institution
  SELECT institution_id INTO target_institution_id
  FROM user_profiles
  WHERE id = user_id_param;

  -- Check if requesting user is admin in the same institution
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND institution_id = target_institution_id
    AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only administrators can modify admin status';
  END IF;

  -- Update user's admin status
  UPDATE user_profiles
  SET is_admin = new_status
  WHERE id = user_id_param
  AND institution_id = target_institution_id;
END;
$$;