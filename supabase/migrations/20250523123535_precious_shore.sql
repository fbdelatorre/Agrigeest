-- Drop existing functions
DROP FUNCTION IF EXISTS create_invitation(uuid);
DROP FUNCTION IF EXISTS validate_invitation(text);

-- Recreate create_invitation function with 4 hour expiration
CREATE OR REPLACE FUNCTION create_invitation(
  institution_id_param uuid
)
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

  -- Create invitation with exactly 4 hours expiration
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
END;
$$;

-- Recreate validate_invitation function with better error messages
CREATE OR REPLACE FUNCTION validate_invitation(
  invitation_code text
) RETURNS TABLE (
  is_valid boolean,
  institution_id uuid,
  message text
) AS $$
DECLARE
  invitation record;
BEGIN
  -- Get invitation details
  SELECT * INTO invitation
  FROM invitations
  WHERE code = invitation_code;

  -- Check if invitation exists
  IF invitation IS NULL THEN
    RETURN QUERY SELECT 
      false AS is_valid,
      NULL::uuid AS institution_id,
      'Invalid invitation code'::text AS message;
    RETURN;
  END IF;

  -- Check if invitation is already used
  IF invitation.used_at IS NOT NULL THEN
    RETURN QUERY SELECT 
      false AS is_valid,
      NULL::uuid AS institution_id,
      'This invitation has already been used'::text AS message;
    RETURN;
  END IF;

  -- Check if invitation is expired
  IF invitation.expires_at <= now() THEN
    RETURN QUERY SELECT 
      false AS is_valid,
      NULL::uuid AS institution_id,
      'This invitation has expired'::text AS message;
    RETURN;
  END IF;

  -- Return success
  RETURN QUERY SELECT 
    true AS is_valid,
    invitation.institution_id,
    'Valid invitation'::text AS message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to automatically clean up expired invitations
CREATE OR REPLACE FUNCTION clean_expired_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM invitations
  WHERE expires_at <= now()
  AND used_at IS NULL;
END;
$$;