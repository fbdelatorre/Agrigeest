import { useEffect, useRef, useState } from 'react';
import * as maplibre from '../../lib/maplibre';
import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson';
import type { SamplePoint } from '../../utils/farmMap/sampleLocation';

export type MapField = Feature<Polygon | MultiPolygon, { id: string; name: string }>;
export type MapSample = Feature<Point, { id: string; color: string; composite?: boolean }>;
export type MapZone = Feature<Polygon, { id: string; name: string }>;
export type IndexImage = { url: string; corners: [SamplePoint, SamplePoint, SamplePoint, SamplePoint] };

export default function PrecisionMap({
  fields, points, focus, onPoint, onSample, imagery, basemap = false, showBoundaries = true, zones, draft,
}: {
  fields: MapField[]; points: MapSample[]; focus: string; basemap?: boolean; showBoundaries?: boolean;
  onPoint?: (point: SamplePoint) => void; onSample?: (id: string) => void; imagery?: IndexImage;
  zones?: MapZone[]; draft?: SamplePoint[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibre.Map | null>(null);
  const callbacks = useRef({ onPoint, onSample });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  callbacks.current = { onPoint, onSample };

  useEffect(() => {
    if (!container.current) return;
    let map: maplibre.Map;
    try {
      map = new maplibre.Map({ container: container.current, center: [-52, -15], zoom: 4, style: {
        version: 8,
        sources: {
          satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Esri' },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#edf2e8' } },
          { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
        ],
      } });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibre.NavigationControl(), 'top-right');
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(container.current);
    map.once('style.load', () => {
      for (const id of ['fields', 'samples', 'precision-zones', 'zone-draft']) {
        map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      }
      map.addLayer({ id: 'field-fill', source: 'fields', type: 'fill', paint: { 'fill-color': '#438552', 'fill-opacity': 0.14 } });
      map.addLayer({ id: 'field-border', source: 'fields', type: 'line', paint: { 'line-color': '#176044', 'line-width': 2 } });
      map.addLayer({ id: 'zone-fill', source: 'precision-zones', type: 'fill', paint: { 'fill-color': '#386cbb', 'fill-opacity': 0.23 } });
      map.addLayer({ id: 'zone-border', source: 'precision-zones', type: 'line', paint: { 'line-color': '#30578b', 'line-width': 2, 'line-dasharray': [2, 2] } });
      map.addLayer({ id: 'zone-drawing', source: 'zone-draft', type: 'line', paint: { 'line-color': '#c24c1e', 'line-width': 3 } });
      map.addLayer({ id: 'zone-vertices', source: 'zone-draft', type: 'circle', filter: ['==', '$type', 'Point'],
        paint: { 'circle-color': '#c24c1e', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, 'circle-radius': 5 } });
      map.addLayer({ id: 'sample-points', source: 'samples', type: 'circle', paint: {
        'circle-radius': ['case', ['boolean', ['get', 'composite'], false], 9, 6],
        'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
      } });
      setReady(true);
    });
    map.on('click', event => {
      if (map.getLayer('sample-points')) {
        const feature = map.queryRenderedFeatures(event.point, { layers: ['sample-points'] })[0];
        if (feature?.properties.id && callbacks.current.onSample) {
          callbacks.current.onSample(feature.properties.id as string);
          return;
        }
      }
      callbacks.current.onPoint?.([event.lngLat.wrap().lng, event.lngLat.lat]);
    });
    return () => { observer.disconnect(); mapRef.current = null; map.remove(); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const boundaries = focus ? fields.filter(field => field.properties.id === focus) : fields;
    const collection = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });
    map.getSource<maplibre.GeoJSONSource>('fields')?.setData(collection(boundaries));
    const bounds = new maplibre.LngLatBounds();
    for (const { geometry } of boundaries) {
      const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      polygons.flat(2).forEach(point => bounds.extend([point[0], point[1]]));
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 0 });
  }, [fields, focus, ready]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map?.setLayoutProperty('satellite', 'visibility', basemap ? 'visible' : 'none');
    map?.setLayoutProperty('field-fill', 'visibility', showBoundaries ? 'visible' : 'none');
    map?.setLayoutProperty('field-border', 'visibility', showBoundaries ? 'visible' : 'none');
    map?.getSource<maplibre.GeoJSONSource>('samples')?.setData({ type: 'FeatureCollection', features: points });
  }, [basemap, points, ready, showBoundaries]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map?.getSource<maplibre.GeoJSONSource>('precision-zones')?.setData({ type: 'FeatureCollection', features: zones ?? [] });
    const features: Feature[] = (draft ?? []).map(coordinates => ({ type: 'Feature', geometry: { type: 'Point', coordinates }, properties: {} }));
    if (draft && draft.length > 1) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: draft.length > 2 ? [...draft, draft[0]] : draft }, properties: {} });
    }
    map?.getSource<maplibre.GeoJSONSource>('zone-draft')?.setData({ type: 'FeatureCollection', features });
  }, [draft, ready, zones]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const map = mapRef.current;
    if (map.getLayer('index-image')) map.removeLayer('index-image');
    if (map.getSource('index-image')) map.removeSource('index-image');
    setImageFailed(false);
    if (!imagery) return;
    // Decode via img-src: MapLibre's URL loader uses fetch, which is correctly
    // blocked for data: URLs by the native app's connect-src policy.
    const image = new Image();
    image.onload = () => {
      try {
        map.addSource('index-image', { type: 'image', coordinates: imagery.corners });
        map.getSource<maplibre.ImageSource>('index-image')?.updateImage({ image });
        map.addLayer({ type: 'raster', id: 'index-image', source: 'index-image',
          paint: { 'raster-opacity': 0.85, 'raster-resampling': 'nearest' } }, 'field-border');
      } catch {
        setImageFailed(true);
      }
    };
    image.onerror = () => setImageFailed(true);
    image.src = imagery.url;
    return () => { image.onload = null; image.onerror = null; };
  }, [imagery, ready]);

  return <div className="relative">
    <div ref={container} className="h-80 w-full overflow-hidden rounded-lg bg-green-50 sm:h-96" aria-label="Mapa dos talhões" />
    {failed && <p className="absolute inset-x-0 top-2 px-3 text-sm" role="status">Mapa indisponível neste dispositivo. Use os controles de seleção ou as coordenadas.</p>}
    {imageFailed && <p className="absolute inset-x-0 top-2 rounded bg-white p-3 text-sm" role="status">Não foi possível exibir a imagem do índice. Clique em Exibir índice para tentar novamente.</p>}
  </div>;
}
