import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { AreaMapSummary } from '../../types/farmMap';
import { MapPinned, ExternalLink, Loader2 } from 'lucide-react';

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Tiles &copy; Esri',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'satellite-layer',
      type: 'raster',
      source: 'satellite',
      paint: {},
    },
  ],
};

function extendGeometryBounds(
  bounds: maplibregl.LngLatBounds,
  geometry: GeoJSON.Geometry
): void {
  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates) {
      for (const coordinate of ring) bounds.extend(coordinate as [number, number]);
    }
  }
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (const coordinate of ring) bounds.extend(coordinate as [number, number]);
      }
    }
  }
}

const FarmMapPreview: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { activeSeason, getAreaMapSummary } = useAppContext();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [areaCount, setAreaCount] = useState(0);

  // Load summaries and init map when season changes
  useEffect(() => {
    if (!activeSeason || !mapContainerRef.current) {
      setLoading(false);
      return;
    }

    setLoading(true);

    let map: maplibregl.Map | null = null;

    const initMap = async () => {
      try {
        const data = await getAreaMapSummary(activeSeason.id);
        const withGeom = data.filter((d) => d.geojson);
        setAreaCount(withGeom.length);

        if (!mapContainerRef.current) return;

        map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: SATELLITE_STYLE,
          center: [-51.0, -16.0],
          zoom: 8,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchZoomRotate: false,
        });

        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

        map.on('style.load', () => {
          if (!map) return;

          map.addSource('areas-preview', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });

          map.addLayer({
            id: 'areas-fill',
            type: 'fill',
            source: 'areas-preview',
            paint: {
              'fill-color': '#246B49',
              'fill-opacity': 0.35,
            },
          });

          map.addLayer({
            id: 'areas-outline',
            type: 'line',
            source: 'areas-preview',
            paint: {
              'line-color': '#246B49',
              'line-width': 2,
              'line-opacity': 0.9,
            },
          });

          // Build features
          const features: GeoJSON.Feature[] = withGeom
            .map((s: AreaMapSummary) => {
              if (!s.geojson) return null;
              try {
                const parsed = JSON.parse(s.geojson);
                const geom = parsed.geometry || parsed;
                return {
                  type: 'Feature' as const,
                  geometry: geom as GeoJSON.Geometry,
                  properties: { name: s.areaName },
                };
              } catch {
                return null;
              }
            })
            .filter((f): f is GeoJSON.Feature => f !== null);

          const source = map.getSource('areas-preview') as maplibregl.GeoJSONSource;
          if (source) {
            source.setData({
              type: 'FeatureCollection',
              features,
            });
          }

          // Fit bounds
          if (features.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            for (const f of features) {
              if (f.geometry) extendGeometryBounds(bounds, f.geometry);
            }
            if (bounds.isEmpty()) {
              map.setCenter([-51.0, -16.0]);
              map.setZoom(8);
            } else {
              map.fitBounds(bounds, { padding: 40, maxZoom: 16 });
            }
          }

          setLoading(false);
          requestAnimationFrame(() => map?.resize());
        });

        map.on('error', () => {
          // Silently handle tile errors in preview
        });

        mapRef.current = map;
      } catch {
        setLoading(false);
      }
    };

    initMap();

    return () => {
      if (map) {
        map.remove();
        map = null;
      }
      mapRef.current = null;
    };
  }, [activeSeason, getAreaMapSummary]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-card overflow-hidden h-full flex flex-col">
      {/* Header overlay */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-sm">
          <div className="flex items-center gap-2">
            <MapPinned size={16} className="text-brand-600" />
            <div>
              <p className="text-sm font-semibold text-gray-800 leading-tight">
                {language === 'pt' ? 'Mapa da Fazenda' : 'Farm Map'}
              </p>
              <p className="text-[10px] text-gray-500 leading-tight">
                {language === 'pt' ? 'Visão geral das áreas' : 'Areas overview'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* "Ver mapa completo" button */}
      <button
        onClick={() => navigate('/farm-map')}
        className="absolute top-3 right-3 z-10 bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-sm hover:bg-white transition-colors flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        {language === 'pt' ? 'Ver mapa completo' : 'Full map'}
        <ExternalLink size={12} />
      </button>

      {/* Map container */}
      <div className="relative flex-1 min-h-[300px]">
        <div ref={mapContainerRef} className="absolute inset-0" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={24} className="text-brand-600 animate-spin" />
              <p className="text-xs text-gray-500">
                {language === 'pt' ? 'Carregando mapa...' : 'Loading map...'}
              </p>
            </div>
          </div>
        )}

        {!loading && areaCount === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-center px-4">
              <MapPinned size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {language === 'pt'
                  ? 'Nenhuma área com geometria cadastrada.'
                  : 'No areas with geometry registered.'}
              </p>
            </div>
          </div>
        )}

        {!activeSeason && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-center px-4">
              <MapPinned size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {language === 'pt'
                  ? 'Selecione uma safra para visualizar o mapa.'
                  : 'Select a season to view the map.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FarmMapPreview;
