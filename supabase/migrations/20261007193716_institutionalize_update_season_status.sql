/*
# Institutionalize update_season_status authorization

## Purpose
Fixes P1 from ETAPA 2D/2G: update_season_status authorized by
seasons.user_id = auth.uid() (personal model), but seasons are
shared by institution. This prevented colleagues from managing
each other's seasons and allowed multiple active seasons per
institution when created by different users.

## Changes
- Replaces user_id-based authorization with institution_id-based
- Obtains caller's institution_id from user_profiles (never from frontend)
- Validates target season belongs to caller's institution
- When activating a season, deactivates other active seasons in
  the SAME institution (not just same user)
- Adds pg_advisory_xact_lock to serialize concurrent activations
  per institution (same pattern as toggle_user_admin_status)
- Revalidates target season after acquiring lock

## What does NOT change
- Function signature (season_id_param uuid, new_status text) RETURNS void
- SECURITY DEFINER, owner postgres, search_path public/pg_temp
- Grants (authenticated, postgres, service_role)
- RLS policies on seasons
- No schema changes, no data changes
- Existing 2 active seasons in INST_741ba2ae are NOT corrected
  (historical inconsistency to be addressed separately)

## Security impact
- Same institution members can now manage each other's seasons
- Cross-institution access is blocked
- Concurrent activations within same institution are serialized
- user_id is no longer used for authorization (retained as historical/authorship data)
*/

CREATE OR REPLACE FUNCTION public.update_season_status(season_id_param uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  caller_institution_id uuid;
  target_institution_id uuid;
BEGIN
  -- Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get caller's real institution_id from user_profiles
  SELECT institution_id INTO caller_institution_id
  FROM public.user_profiles
  WHERE id = auth.uid();

  IF caller_institution_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to an institution';
  END IF;

  -- Get target season's institution_id
  SELECT institution_id INTO target_institution_id
  FROM public.seasons
  WHERE id = season_id_param;

  IF target_institution_id IS NULL THEN
    RAISE EXCEPTION 'Season not found';
  END IF;

  -- Cross-institution check: caller must belong to same institution as the season
  IF target_institution_id <> caller_institution_id THEN
    RAISE EXCEPTION 'Unauthorized: season belongs to a different institution';
  END IF;

  -- Serialize concurrent status changes within the same institution
  PERFORM pg_advisory_xact_lock(hashtext(caller_institution_id::text));

  -- Revalidate after lock: season might have changed
  SELECT institution_id INTO target_institution_id
  FROM public.seasons
  WHERE id = season_id_param;

  IF target_institution_id IS NULL THEN
    RAISE EXCEPTION 'Season not found after lock';
  END IF;

  IF target_institution_id <> caller_institution_id THEN
    RAISE EXCEPTION 'Unauthorized: season institution changed';
  END IF;

  -- If setting a season to active, deactivate all other active seasons
  -- in the SAME institution first
  IF new_status = 'active' THEN
    UPDATE public.seasons
    SET status = 'completed'
    WHERE institution_id = caller_institution_id
    AND status = 'active'
    AND id <> season_id_param;
  END IF;

  -- Update the target season's status
  UPDATE public.seasons
  SET
    status = new_status,
    updated_at = now()
  WHERE id = season_id_param
  AND institution_id = caller_institution_id;
END;
$function$;
