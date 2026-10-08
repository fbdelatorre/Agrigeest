-- ETAPA 1F-C: Isolate copy_data_to_institution
-- Add search_path protection, qualify tables, restrict EXECUTE to service_role/postgres only.

CREATE OR REPLACE FUNCTION public.copy_data_to_institution(
  source_institution_id uuid,
  target_institution_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Copy areas
  INSERT INTO public.areas (
    name, size, unit, location, description, current_crop, cultivar,
    user_id, institution_id
  )
  SELECT
    name, size, unit, location, description, current_crop, cultivar,
    user_id, target_institution_id
  FROM public.areas
  WHERE institution_id = source_institution_id;

  -- Copy products
  INSERT INTO public.products (
    name, category, unit, quantity_in_stock, min_stock_level,
    price, supplier, description, institution_id
  )
  SELECT
    name, category, unit, quantity_in_stock, min_stock_level,
    price, supplier, description, target_institution_id
  FROM public.products
  WHERE institution_id = source_institution_id;

  -- Copy seasons
  INSERT INTO public.seasons (
    name, start_date, end_date, status, description,
    user_id, institution_id
  )
  SELECT
    name, start_date, end_date, status, description,
    user_id, target_institution_id
  FROM public.seasons
  WHERE institution_id = source_institution_id;
END;
$function$;

-- Revoke EXECUTE from PUBLIC, anon, and authenticated
REVOKE EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) FROM authenticated;

-- Grant EXECUTE explicitly to service_role and postgres
GRANT EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) TO postgres;
