/*
  # Fix validate_invitation function
  
  1. Changes
    - Drop existing validate_invitation function
    - Recreate with proper return type (jsonb)
    - Ensure proper error handling for invitation validation
    
  2. Notes
    - Function validates invitation codes for the registration process
    - Returns JSON with validation status and appropriate messages
*/

-- Drop the existing function first to avoid return type conflict
DROP FUNCTION IF EXISTS public.validate_invitation(text);

-- Recreate the function with proper return type
CREATE OR REPLACE FUNCTION public.validate_invitation(invitation_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation_record RECORD;
  institution_name text;
BEGIN
  -- Check if invitation exists and is not expired or used
  SELECT i.*, inst.name as institution_name
  INTO invitation_record
  FROM invitations i
  JOIN institutions inst ON i.institution_id = inst.id
  WHERE i.code = invitation_code
  LIMIT 1;

  -- If no invitation found
  IF invitation_record IS NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'Invalid invitation code'
    );
  END IF;

  -- Check if invitation is expired
  IF invitation_record.expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'Invitation code has expired'
    );
  END IF;

  -- Check if invitation is already used
  IF invitation_record.used_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'message', 'Invitation code has already been used'
    );
  END IF;

  -- If all checks pass, return success with institution name
  RETURN jsonb_build_object(
    'valid', true,
    'message', 'Valid invitation code',
    'institution_name', invitation_record.institution_name
  );
END;
$$;