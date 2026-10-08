/*
# ETAPA 3Z — New RPC: join_institution_with_invitation

## Purpose
Allow an authenticated user with institution_id IS NULL to join an
institution by consuming a valid invitation code. This is the safe
server-side mechanism that prepares the system for a future change
of user_profiles.institution_id FK from CASCADE to SET NULL.

## Security
- SECURITY DEFINER with explicit search_path = public, pg_temp
- Uses auth.uid() for identity — NEVER accepts user_id as parameter
- Locks user_profiles row FOR UPDATE before checking institution_id
- Locks invitation row FOR UPDATE before validating/consuming
- Blocks if user already has institution_id (USER_ALREADY_HAS_INSTITUTION)
- Blocks if invitation is used, expired, or not found
- Institution_id obtained exclusively from the invitation record
- Only authenticated role can EXECUTE; anon and PUBLIC revoked
- Does NOT alter is_admin, role, first_name, last_name, phone, or email
- Does NOT alter any FK, column, nullability, or RLS policy

## New function
- public.join_institution_with_invitation(p_code text) RETURNS jsonb

## Notes
1. The existing join_institution(user_id, invitation_code) is preserved
   unchanged — it is used during registration (pre-login flow).
2. This new RPC is for already-authenticated users with NULL institution_id.
3. No DML on existing data. No FK changes. No RLS changes.
*/

-- Create the new RPC
CREATE OR REPLACE FUNCTION public.join_institution_with_invitation(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile RECORD;
  v_invitation RECORD;
  v_institution RECORD;
  v_clean_code text;
BEGIN
  -- 1. Authentication check
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'NOT_AUTHENTICATED',
      'message', 'Authentication required'
    );
  END IF;

  -- 2. Lock profile row FOR UPDATE (prevents concurrent attempts)
  SELECT * INTO v_profile
  FROM public.user_profiles
  WHERE id = v_user_id
  FOR UPDATE;

  -- 3. Profile must exist
  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'PROFILE_NOT_FOUND',
      'message', 'User profile not found'
    );
  END IF;

  -- 4. User must NOT already have an institution
  IF v_profile.institution_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'USER_ALREADY_HAS_INSTITUTION',
      'message', 'User already belongs to an institution'
    );
  END IF;

  -- 5. Clean and validate code input
  v_clean_code := NULLIF(TRIM(p_code), '');
  IF v_clean_code IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVITATION_NOT_FOUND',
      'message', 'Invalid invitation code'
    );
  END IF;

  -- 6. Lock invitation row FOR UPDATE (prevents concurrent consumption)
  SELECT i.*, inst.name AS institution_name
  INTO v_invitation
  FROM public.invitations i
  JOIN public.institutions inst ON inst.id = i.institution_id
  WHERE i.code = v_clean_code
  FOR UPDATE OF i;

  -- 7. Invitation must exist
  IF v_invitation.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVITATION_NOT_FOUND',
      'message', 'Invalid invitation code'
    );
  END IF;

  -- 8. Invitation must not be already used
  IF v_invitation.used_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVITATION_ALREADY_USED',
      'message', 'This invitation code has already been used'
    );
  END IF;

  -- 9. Invitation must not be expired
  IF v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INVITATION_EXPIRED',
      'message', 'This invitation code has expired'
    );
  END IF;

  -- 10. Verify institution still exists
  SELECT * INTO v_institution
  FROM public.institutions
  WHERE id = v_invitation.institution_id;

  IF v_institution.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error_code', 'INSTITUTION_NOT_FOUND',
      'message', 'Institution not found'
    );
  END IF;

  -- 11. Atomic: set institution_id on profile + mark invitation as used
  UPDATE public.user_profiles
  SET institution_id = v_invitation.institution_id,
      institution = v_invitation.institution_name,
      updated_at = now()
  WHERE id = v_user_id AND institution_id IS NULL;

  -- 12. Mark invitation as consumed
  UPDATE public.invitations
  SET used_at = now(),
      used_by = v_user_id
  WHERE id = v_invitation.id;

  -- 13. Return success with updated profile info
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Successfully joined ' || v_invitation.institution_name,
    'institution_id', v_invitation.institution_id,
    'institution_name', v_invitation.institution_name
  );
END;
$function$;

-- Revoke EXECUTE from PUBLIC and anon (deny by default)
REVOKE EXECUTE ON FUNCTION public.join_institution_with_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_institution_with_invitation(text) FROM anon;

-- Grant EXECUTE only to authenticated
GRANT EXECUTE ON FUNCTION public.join_institution_with_invitation(text) TO authenticated;