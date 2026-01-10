-- Drop existing functions
DROP FUNCTION IF EXISTS create_invitation(uuid);
DROP FUNCTION IF EXISTS validate_invitation(text);
DROP FUNCTION IF EXISTS clean_expired_invitations();

-- Recreate create_invitation function with next day expiration
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

  -- Create invitation that expires at the end of next day (23:59:59)
  INSERT INTO invitations (
    institution_id,
    code,
    expires_at,
    created_by
  ) VALUES (
    institution_id_param,
    new_code,
    (date_trunc('day', timezone('UTC', now())) + interval '2 days' - interval '1 second'),
    auth.uid()
  );

  RETURN new_code;
END;
$$;

-- Recreate validate_invitation function with strict timestamp comparison
CREATE OR REPLACE FUNCTION validate_invitation(
  invitation_code text
) RETURNS TABLE (
  is_valid boolean,
  institution_id uuid,
  message text
) AS $$
BEGIN
  -- Return invalid if invitation doesn't exist or is expired
  IF NOT EXISTS (
    SELECT 1 FROM invitations 
    WHERE code = invitation_code 
    AND used_at IS NULL
    AND expires_at > timezone('UTC', now())
  ) THEN
    RETURN QUERY SELECT 
      false AS is_valid,
      NULL::uuid AS institution_id,
      'Invalid or expired invitation code'::text AS message;
    RETURN;
  END IF;

  -- Return success with institution id
  RETURN QUERY 
    SELECT 
      true AS is_valid,
      institution_id,
      'Valid invitation'::text AS message
    FROM invitations 
    WHERE code = invitation_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate clean_expired_invitations function with UTC timestamp
CREATE OR REPLACE FUNCTION clean_expired_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM invitations
  WHERE expires_at <= timezone('UTC', now())
  AND used_at IS NULL;
END;
$$;

-- Update existing invitations to expire at the end of next day
UPDATE invitations 
SET expires_at = (date_trunc('day', created_at) + interval '2 days' - interval '1 second')
WHERE used_at IS NULL;