-- Drop existing function
DROP FUNCTION IF EXISTS create_invitation(uuid);

-- Recreate the function with the correct signature
CREATE OR REPLACE FUNCTION create_invitation(institution_id_param uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code text;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'Only administrators can create invitations';
  END IF;

  -- Generate unique code
  new_code := upper(substring(md5(random()::text) from 1 for 8));

  -- Create invitation
  INSERT INTO invitations (
    institution_id,
    code,
    expires_at,
    created_by
  ) VALUES (
    institution_id_param,
    new_code,
    now() + interval '4 hours',
    auth.uid()
  );

  RETURN new_code;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating invitation: %', SQLERRM;
END;
$$;

-- Create function to list active invitations with proper signature
CREATE OR REPLACE FUNCTION list_active_invitations(institution_id_param uuid)
RETURNS TABLE (
  code text,
  created_at timestamptz,
  expires_at timestamptz,
  created_by_name text,
  used_at timestamptz,
  used_by_name text
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
    i.code,
    i.created_at,
    i.expires_at,
    (cp.first_name || ' ' || cp.last_name) as created_by_name,
    i.used_at,
    (up.first_name || ' ' || up.last_name) as used_by_name
  FROM invitations i
  LEFT JOIN user_profiles cp ON cp.id = i.created_by
  LEFT JOIN user_profiles up ON up.id = i.used_by
  WHERE i.institution_id = institution_id_param
  ORDER BY i.created_at DESC;
END;
$$;