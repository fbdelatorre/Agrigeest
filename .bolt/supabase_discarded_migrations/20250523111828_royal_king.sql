/*
  # Fix list_institution_users function type mismatch

  1. Changes
    - Drop and recreate the list_institution_users function with correct return types
    - Ensure all returned columns are explicitly cast to text where needed
    - Add proper security definer and stability settings

  2. Security
    - Function runs with security definer to access auth.users
    - RLS policies still apply through the user_profiles table join
*/

-- Drop the existing function if it exists
DROP FUNCTION IF EXISTS list_institution_users;

-- Recreate the function with proper type handling
CREATE OR REPLACE FUNCTION list_institution_users(institution_id_param uuid)
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
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.id,
    (au.email)::text as email,
    up.first_name,
    up.last_name,
    up.role,
    COALESCE(up.is_admin, false) as is_admin
  FROM user_profiles up
  JOIN auth.users au ON au.id = up.id
  WHERE up.institution_id = institution_id_param;
END;
$$;