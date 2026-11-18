BEGIN;
CREATE FUNCTION public.precision_satellite_bounds(p_area uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, extensions, pg_temp AS $$
  WITH area AS (
    SELECT ST_Force2D(geometry) AS geom
    FROM public.areas WHERE id = p_area AND geometry IS NOT NULL AND NOT ST_IsEmpty(geometry)
      AND institution_id = (SELECT institution_id FROM public.user_profiles WHERE id = auth.uid())
  ), coords AS (
    SELECT geom, ST_X(ST_PointOnSurface(geom)) AS lng, ST_Y(ST_PointOnSurface(geom)) AS lat FROM area
  ), projected AS (
    SELECT geom, (CASE WHEN lat < 0 THEN 32700 ELSE 32600 END + LEAST(60, GREATEST(1, floor((lng + 180) / 6)::integer + 1))) AS srid
    FROM coords WHERE lat BETWEEN -80 AND 84
  ), utm AS (
    SELECT geom, srid, ST_Transform(geom,srid) AS shape FROM projected
  ), raster AS (
    SELECT *, floor(ST_XMin(shape)/10)*10 AS west, floor(ST_YMin(shape)/10)*10 AS south,
      ceil(ST_XMax(shape)/10)*10 AS east, ceil(ST_YMax(shape)/10)*10 AS north FROM utm
  )
  SELECT jsonb_build_object(
    'geometry', ST_AsGeoJSON(geom)::jsonb, 'projected', ST_AsGeoJSON(shape,6,0)::jsonb,
    'srid', srid, 'width', ((east-west)/10)::integer, 'height', ((north-south)/10)::integer,
    'bbox', jsonb_build_array(west,south,east,north),
    'corners', jsonb_build_array(
      ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_MakePoint(west,north),srid),4326))::jsonb->'coordinates',
      ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_MakePoint(east,north),srid),4326))::jsonb->'coordinates',
      ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_MakePoint(east,south),srid),4326))::jsonb->'coordinates',
      ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_MakePoint(west,south),srid),4326))::jsonb->'coordinates'
    )
  ) FROM raster;
$$;
REVOKE ALL ON FUNCTION public.precision_satellite_bounds(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.precision_satellite_bounds(uuid) TO authenticated;
COMMIT;
