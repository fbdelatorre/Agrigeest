DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.get_area_map_summary(uuid)'::regprocedure);
  season_filter constant text := 'o.season_id = season_id_param';
  active_filter constant text := season_filter || ' AND o.status <> ''cancelled''';
  season_filter_count integer;
  active_filter_count integer;
BEGIN
  -- Keep the deployed geometry, classification and function attributes intact.
  SELECT count(*) INTO season_filter_count FROM regexp_matches(definition, 'o\.season_id = season_id_param', 'g');
  active_filter_count := (length(definition) - length(replace(definition, active_filter, ''))) / length(active_filter);

  IF season_filter_count = 6 AND active_filter_count = 6 THEN
    RETURN;
  END IF;

  IF season_filter_count <> 6 OR active_filter_count <> 0 THEN
    RAISE EXCEPTION 'Unexpected operation filters in get_area_map_summary';
  END IF;

  EXECUTE replace(definition, season_filter, active_filter);
END;
$migration$;
