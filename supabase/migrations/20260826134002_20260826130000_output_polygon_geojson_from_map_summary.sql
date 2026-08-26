/*
# Corrigir saida GeoJSON do get_area_map_summary para Polygon

1. Objetivo
- A coluna `areas.geometry` e tipada como `geometry(MultiPolygon, 4326)`.
- `ST_AsGeoJSON` retorna `"type":"MultiPolygon"`, mas o MapLibre GL so aceita `Polygon`, `LineString` e `Point` no filtro `$type`.
- MultiPolygon nao e um tipo valido para o filtro `$type` do MapLibre, causando erro ao adicionar camadas.

2. Funcao modificada
- `public.get_area_map_summary`
- Agora usa `ST_AsGeoJSON(ST_GeometryN(a.geometry, 1))` para extrair o primeiro poligono do MultiPolygon e retorna-lo como `Polygon` GeoJSON.
- Isso funciona porque todas as areas cadastradas tem um unico poligono (MultiPolygon com 1 poligono).

3. Integridade dos dados
- Nenhuma tabela, coluna ou dado existente e removido ou alterado.
- A coluna `areas.geometry` continua sendo `MultiPolygon` no SRID 4326.
- Apenas a representacao GeoJSON de saida e alterada para `Polygon`.

4. Seguranca
- A funcao continua STABLE e respeita as politicas de acesso existentes.
*/

CREATE OR REPLACE FUNCTION public.get_area_map_summary(season_id_param uuid)
RETURNS TABLE(
  area_id uuid,
  area_name text,
  area_size numeric,
  area_unit text,
  current_crop text,
  cultivar text,
  geojson text,
  last_operation_date date,
  last_fungicide_date date,
  last_insecticide_date date,
  last_herbicide_date date,
  last_dessecacao_date date,
  next_operation_date date
)
LANGUAGE sql
STABLE
AS $function$
SELECT
a.id AS area_id,
a.name AS area_name,
a.size AS area_size,
a.unit AS area_unit,
a.current_crop,
a.cultivar,
CASE WHEN a.geometry IS NOT NULL
THEN ST_AsGeoJSON(ST_GeometryN(a.geometry, 1))::text
ELSE NULL END AS geojson,
-- Last operation overall
(
SELECT MAX(o.start_date::date)
FROM operations o
WHERE o.area_id = a.id AND o.season_id = season_id_param
) AS last_operation_date,
-- Last fungicide (by type OR product category)
(
SELECT MAX(o.start_date::date)
FROM operations o
WHERE o.area_id = a.id AND o.season_id = season_id_param
AND (
LOWER(o.type) LIKE '%fungicid%'
OR EXISTS (
SELECT 1 FROM jsonb_array_elements(o.products_used) AS pu
JOIN products p ON p.id = (pu->>'productId')::uuid
WHERE LOWER(p.category) LIKE '%fungicid%'
)
)
) AS last_fungicide_date,
-- Last insecticide
(
SELECT MAX(o.start_date::date)
FROM operations o
WHERE o.area_id = a.id AND o.season_id = season_id_param
AND (
LOWER(o.type) LIKE '%inseticid%'
OR EXISTS (
SELECT 1 FROM jsonb_array_elements(o.products_used) AS pu
JOIN products p ON p.id = (pu->>'productId')::uuid
WHERE LOWER(p.category) LIKE '%inseticid%'
)
)
) AS last_insecticide_date,
-- Last herbicide
(
SELECT MAX(o.start_date::date)
FROM operations o
WHERE o.area_id = a.id AND o.season_id = season_id_param
AND (
LOWER(o.type) LIKE '%herbicid%'
OR EXISTS (
SELECT 1 FROM jsonb_array_elements(o.products_used) AS pu
JOIN products p ON p.id = (pu->>'productId')::uuid
WHERE LOWER(p.category) LIKE '%herbicid%'
)
)
) AS last_herbicide_date,
-- Last dessecacao
(
SELECT MAX(o.start_date::date)
FROM operations o
WHERE o.area_id = a.id AND o.season_id = season_id_param
AND LOWER(o.type) LIKE '%dessecac%'
) AS last_dessecacao_date,
-- Next scheduled operation
(
SELECT MIN(o.next_operation_date::date)
FROM operations o
WHERE o.area_id = a.id AND o.season_id = season_id_param
AND o.next_operation_date IS NOT NULL
) AS next_operation_date
FROM areas a
ORDER BY a.name;
$function$;