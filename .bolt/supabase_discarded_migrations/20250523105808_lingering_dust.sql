/*
  # Fix ambiguous ID reference in list_institution_users function

  1. Changes
    - Update list_institution_users function to use explicit table references
    - Fix ambiguous column references by qualifying them with table names
    - Ensure correct join conditions and column selections

  2. Security
    - Maintain existing security context
    - Function remains accessible to authenticated users only
*/

CREATE OR REPLACE FUNCTION public.list_institution_users(institution_id_param uuid)
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
  WHERE up.institution_id = institution_id_param;
END;
$$;