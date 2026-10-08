-- ETAPA 1H-K: Harden toggle_user_admin_status
-- Add: search_path, auth.uid() IS NULL check, advisory lock, last admin protection, revalidation
-- Preserve: signature, SECURITY DEFINER, caller admin check, same-institution check, promotion/demotion logic

CREATE OR REPLACE FUNCTION public.toggle_user_admin_status(user_id_param uuid, new_status boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  target_institution_id uuid;
  target_current_is_admin boolean;
  admin_count integer;
BEGIN
  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get the target user's institution and current admin status (initial read)
  SELECT institution_id, is_admin
  INTO target_institution_id, target_current_is_admin
  FROM public.user_profiles
  WHERE id = user_id_param;

  -- Target must exist
  IF target_institution_id IS NULL AND NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Check if requesting user is admin in the same institution
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND institution_id = target_institution_id
    AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only administrators can modify admin status';
  END IF;

  -- Acquire advisory transaction lock for this institution
  -- Serializes all admin-status changes within the same institution
  PERFORM pg_advisory_xact_lock(
    hashtext(target_institution_id::text)
  );

  -- REVALIDATION AFTER LOCK: re-read target's current state
  SELECT institution_id, is_admin
  INTO target_institution_id, target_current_is_admin
  FROM public.user_profiles
  WHERE id = user_id_param;

  -- Target must still exist
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- Target must still be in the same institution as the caller
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND institution_id = target_institution_id
    AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only administrators can modify admin status';
  END IF;

  -- Last admin protection: only applies when demoting an existing admin
  IF new_status = false AND target_current_is_admin = true THEN
    SELECT count(*) INTO admin_count
    FROM public.user_profiles
    WHERE institution_id = target_institution_id
    AND is_admin = true;

    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last administrator of an institution';
    END IF;
  END IF;

  -- Update user's admin status
  UPDATE public.user_profiles
  SET is_admin = new_status
  WHERE id = user_id_param
  AND institution_id = target_institution_id;
END;
$function$;

-- Grants: revoke PUBLIC and anon, keep authenticated/service_role/postgres
REVOKE EXECUTE ON FUNCTION public.toggle_user_admin_status(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.toggle_user_admin_status(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_user_admin_status(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_user_admin_status(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.toggle_user_admin_status(uuid, boolean) TO postgres;
