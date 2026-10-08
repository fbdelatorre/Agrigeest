-- ETAPA 1H-I Migration B: Harden user-facing functions
-- update_season_status + check_institution_exists

-- update_season_status: add auth.uid() check, search_path, qualify tables, preserve logic
CREATE OR REPLACE FUNCTION public.update_season_status(season_id_param uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- If setting a season to active, deactivate all other seasons first
  IF new_status = 'active' THEN
    UPDATE public.seasons
    SET status = 'completed'
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND id != season_id_param;
  END IF;

  -- Update the target season's status
  UPDATE public.seasons
  SET 
    status = new_status,
    updated_at = now()
  WHERE id = season_id_param
    AND user_id = auth.uid();
END;
$function$;

-- check_institution_exists: add search_path, qualify table, preserve logic (no auth.uid())
CREATE OR REPLACE FUNCTION public.check_institution_exists(institution_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.institutions 
    WHERE LOWER(name) = LOWER(institution_name)
  );
END;
$function$;

-- Grants for update_season_status: revoke PUBLIC/anon, keep authenticated/service_role/postgres
REVOKE EXECUTE ON FUNCTION public.update_season_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_season_status(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_season_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_season_status(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_season_status(uuid, text) TO postgres;

-- Grants for check_institution_exists: revoke PUBLIC, keep anon (needed pre-login)
REVOKE EXECUTE ON FUNCTION public.check_institution_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_institution_exists(text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_institution_exists(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_institution_exists(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_institution_exists(text) TO postgres;
