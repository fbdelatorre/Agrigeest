/*
# Corrigir salvamento de geometrias Polygon e MultiPolygon

1. Objetivo
- Corrigir o salvamento de perimetros importados em KML, KMZ, GeoJSON e Shapefile.
- Aceitar tanto geometrias `Polygon` quanto `MultiPolygon` no mesmo fluxo.

2. Funcao modificada
- `public.save_area_geometry`
- A funcao agora aplica `ST_Multi` antes da conversao para o tipo tipado da coluna.
- O SRID e normalizado para 4326 e coordenadas Z extras sao removidas.

3. Integridade dos dados
- Nenhuma tabela, coluna ou dado existente e removido.
- A coluna `areas.geometry` continua sendo `MultiPolygon` no SRID 4326.

4. Seguranca
- A funcao continua sendo executada como invoker e respeita as politicas de acesso existentes.
*/

CREATE OR REPLACE FUNCTION public.save_area_geometry(area_id_param uuid, geojson_text text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, extensions
AS $function$
UPDATE public.areas
SET geometry = ST_Multi(
  ST_Force2D(
    ST_SetSRID(ST_GeomFromGeoJSON(geojson_text), 4326)
  )
)::geometry(MultiPolygon, 4326),
updated_at = now()
WHERE id = area_id_param;
$function$;
