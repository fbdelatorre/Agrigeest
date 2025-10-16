-- Drop existing function first
DROP FUNCTION IF EXISTS join_institution(uuid, text);

-- Recreate function with proper return type
CREATE OR REPLACE FUNCTION public.join_institution(
  user_id uuid,
  invitation_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution_id uuid;
  v_invitation_record invitations%ROWTYPE;
  v_user_profile user_profiles%ROWTYPE;
BEGIN
  -- Check if user already has an institution
  SELECT * INTO v_user_profile
  FROM user_profiles
  WHERE id = user_id;

  IF v_user_profile.institution_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User already belongs to an institution'
    );
  END IF;

  -- Get and validate invitation
  SELECT * INTO v_invitation_record
  FROM invitations
  WHERE code = invitation_code
    AND used_at IS NULL
    AND expires_at > CURRENT_TIMESTAMP;

  IF v_invitation_record IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid or expired invitation code'
    );
  END IF;

  -- Update user profile with institution
  UPDATE user_profiles
  SET institution_id = v_invitation_record.institution_id,
      is_admin = false
  WHERE id = user_id;

  -- Mark invitation as used
  UPDATE invitations
  SET used_at = CURRENT_TIMESTAMP,
      used_by = user_id
  WHERE id = v_invitation_record.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Successfully joined institution'
  );
END;
$$;

-- Add email column to user_profiles table
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS email text;