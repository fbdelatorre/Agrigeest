import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { AreaMapSummary, ViewMode, LayerSettings, MapFilters } from '../../types/farmMap';
import {
  getAreaColor,
  getLegendForViewMode,
  getViewModeLabel,
  getDaysSince,
  getDaysUntil,
  formatDateBR,
} from '../../utils/farmMap/farmMapHelpers';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import LayerControl from '../../components/farmMap/LayerControl';
import AreaDetailPanel from '../../components/farmMap/AreaDetailPanel';
import ImportPerimeters from '../../components/farmMap/ImportPerimeters';
import {
  Map as MapIcon, Layers, Upload, Search, Filter, X, ChevronDown,
  Calendar, AlertTriangle, Sprout, FlaskConical,
} from 'lucide-react';

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'satellite': {
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

const STREETS_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'osm': {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-layer',
      type: 'raster',
      source: 'osm',
      paint: {},
    },
  ],
};

const VIEW_MODES: ViewMode[] = [
  'lastOperation', 'lastFungicide', 'lastInsecticide', 'lastHerbicide',
  'lastDessecacao', 'nextApplication', 'crop', 'cultivar',
];

function extendGeometryBounds(bounds: maplibregl.LngLatBounds, geometry: GeoJSON.Geometry): void {
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

export const FarmMapScreen: React.FC = () => {
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { activeSeason, areas, getAreaMapSummary, products, operations } = useAppContext();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const currentFeaturesRef = useRef<GeoJSON.Feature[]>([]);

  const [summaries, setSummaries] = useState<AreaMapSummary[]>([]);
  const summariesRef = useRef<AreaMapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('lastFungicide');
  const [layerSettings, setLayerSettings] = useState<LayerSettings>({
    baseMap: 'satellite',
    showBoundaries: true,
    boundaryOpacity: 1,
    showNames: true,
    showCrop: false,
    showCultivar: false,
    showLastApplication: false,
  });
  const [showLayerControl, setShowLayerControl] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showViewModeDropdown, setShowViewModeDropdown] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<MapFilters>({
    crop: '', cultivar: '', operationType: '', operator: '', product: '', nextAppStatus: '',
  });
  const [referenceDate] = useState(new Date());

  // Load map summary data when active season changes
  useEffect(() => {
    if (!activeSeason) {
      setSummaries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    console.log('[FarmMap] STEP 0: fetching map summaries for season', activeSeason.id);
    getAreaMapSummary(activeSeason.id).then(data => {
      const withGeom = data.filter(d => d.geojson);
      console.log('[FarmMap] STEP 0a: got', data.length, 'summaries,', withGeom.length, 'with geojson');
      if (withGeom.length > 0) {
        console.log('[FarmMap] STEP 0b: first geojson:', withGeom[0].areaName, withGeom[0].geojson?.substring(0, 120));
      }
      summariesRef.current = data;
      setSummaries(data);
      setLoading(false);
    }).catch(err => {
      console.error('[FarmMap] STEP 0-ERR: failed to fetch summaries:', err);
      setLoading(false);
    });
  }, [activeSeason, getAreaMapSummary]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    console.log('[FarmMap] INIT: creating map. container:', mapContainerRef.current.clientWidth, 'x', mapContainerRef.current.clientHeight);

    const initialStyle = layerSettings.baseMap === 'satellite' ? SATELLITE_STYLE : STREETS_STYLE;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: initialStyle,
      center: [-51.0, -16.0],
      zoom: 8,
      attributionControl: true,
    });

    console.log('[FarmMap] INIT: map instance created');

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');

    const addAreasSourceAndLayers = (m: maplibregl.Map) => {
      if (m.getSource('areas-geojson')) return;

      m.addSource('areas-geojson', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      m.addLayer({
        id: 'areas-fill',
        type: 'fill',
        source: 'areas-geojson',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 1,
          'fill-outline-color': '#ffffff',
        },
        layout: { visibility: 'visible' },
      });

      m.addLayer({
        id: 'areas-outline',
        type: 'line',
        source: 'areas-geojson',
        paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.9 },
        layout: { visibility: 'visible' },
      });

      m.addLayer({
        id: 'areas-border',
        type: 'line',
        source: 'areas-geojson',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 1 },
        layout: { visibility: 'visible' },
      });

      m.addLayer({
        id: 'areas-label',
        type: 'symbol',
        source: 'areas-geojson',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'visibility': 'visible',
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#000000',
          'text-halo-width': 2,
        },
      });

      console.log('[FarmMap] style.load: dynamically added areas-geojson source + 4 layers');
    };

    // style.load fires when the style is parsed and is the right time to add
    // GeoJSON sources/layers dynamically. We use this instead of 'load' because
    // 'load' waits for raster tiles to download, which may never complete if tile
    // servers are unreachable.
    map.on('style.load', () => {
      console.log('[FarmMap] style.load fired - adding source/layers and setting mapReady');
      addAreasSourceAndLayers(map);
      setMapReady(true);
    });

    map.on('error', (e: any) => {
      console.error('[FarmMap] MAP ERROR:', e.error?.message || e.type, e.error || e);
    });

    map.on('webglcontextcreationerror', (e: any) => {
      console.error('[FarmMap] WebGL context creation error:', e);
    });

    mapRef.current = map;
    requestAnimationFrame(() => map.resize());

    return () => {
      map.remove();
      mapRef.current = null;
      hasInitializedStyle.current = false;
      eventsSetupRef.current = false;
      setMapReady(false);
    };
  }, []);

  // Update base map style
  const hasInitializedStyle = useRef(false);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!hasInitializedStyle.current) {
      hasInitializedStyle.current = true;
      return;
    }
    const style = layerSettings.baseMap === 'satellite' ? SATELLITE_STYLE : STREETS_STYLE;
    map.setStyle(style);
    // After style change, re-add the GeoJSON source/layers and restore data
    map.once('style.load', () => {
      // Re-add source + layers since setStyle wipes everything
      if (!map.getSource('areas-geojson')) {
        map.addSource('areas-geojson', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: currentFeaturesRef.current },
        });
        map.addLayer({
          id: 'areas-fill', type: 'fill', source: 'areas-geojson',
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': layerSettings.boundaryOpacity, 'fill-outline-color': '#ffffff' },
          layout: { visibility: layerSettings.showBoundaries ? 'visible' : 'none' },
        });
        map.addLayer({
          id: 'areas-outline', type: 'line', source: 'areas-geojson',
          paint: { 'line-color': '#ffffff', 'line-width': 4, 'line-opacity': 0.9 },
          layout: { visibility: layerSettings.showBoundaries ? 'visible' : 'none' },
        });
        map.addLayer({
          id: 'areas-border', type: 'line', source: 'areas-geojson',
          paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-opacity': 1 },
          layout: { visibility: layerSettings.showBoundaries ? 'visible' : 'none' },
        });
        map.addLayer({
          id: 'areas-label', type: 'symbol', source: 'areas-geojson',
          layout: { 'text-field': ['get', 'label'], 'text-size': 12, 'text-anchor': 'center', 'text-allow-overlap': false, visibility: layerSettings.showNames ? 'visible' : 'none' },
          paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 2 },
        });
      } else {
        const source = map.getSource('areas-geojson') as maplibregl.GeoJSONSource;
        if (source) source.setData({ type: 'FeatureCollection', features: currentFeaturesRef.current });
      }
    });
  }, [layerSettings.baseMap, mapReady]);

  // Set up event handlers for area layers (added dynamically after style.load)
  const eventsSetupRef = useRef(false);
  const setupLayerEvents = (map: maplibregl.Map) => {
    if (eventsSetupRef.current) return;
    eventsSetupRef.current = true;
    // Click handler
    map.on('click', 'areas-fill', (e) => {
      if (e.features && e.features.length > 0) {
        const areaId = e.features[0].properties?.areaId as string;
        if (areaId) {
          setSelectedAreaId(areaId);
        }
      }
    });

    // Cursor change on hover
    map.on('mouseenter', 'areas-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'areas-fill', () => {
      map.getCanvas().style.cursor = '';
    });

    // Right-click / context menu
    map.on('contextmenu', 'areas-fill', (e) => {
      if (e.features && e.features.length > 0) {
        const areaId = e.features[0].properties?.areaId as string;
        if (areaId) {
          setSelectedAreaId(areaId);
        }
      }
    });
  };

  // Update area data on map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const updateData = () => {
      console.log('[FarmMap] STEP 2: updateData called. mapReady:', mapReady, 'summaries:', summaries.length);
      setupLayerEvents(map);

      const source = map.getSource('areas-geojson') as maplibregl.GeoJSONSource;
      console.log('[FarmMap] STEP 2a: source exists:', !!source, 'type:', source?.type);
      if (!source) return;

      const features: GeoJSON.Feature[] = [];

      for (const summary of summaries) {
        if (!summary.geojson) continue;

        // Apply filters
        if (filters.crop && summary.currentCrop?.toLowerCase() !== filters.crop.toLowerCase()) continue;
        if (filters.cultivar && summary.cultivar?.toLowerCase() !== filters.cultivar.toLowerCase()) continue;
        if (searchTerm && !summary.areaName.toLowerCase().includes(searchTerm.toLowerCase())) continue;

        let geom: GeoJSON.Geometry;
        try {
          geom = JSON.parse(summary.geojson) as GeoJSON.Geometry;
        } catch {
          console.log('[FarmMap] STEP 2b: failed to parse geojson for', summary.areaName);
          continue;
        }

        // Build label
        const labelParts: string[] = [summary.areaName];
        if (layerSettings.showCrop && summary.currentCrop) labelParts.push(summary.currentCrop);
        if (layerSettings.showCultivar && summary.cultivar) labelParts.push(summary.cultivar);

        const color = getAreaColor(viewMode, summary, referenceDate);

        features.push({
          type: 'Feature',
          geometry: geom,
          properties: {
            areaId: summary.areaId,
            name: summary.areaName,
            color: color,
            label: labelParts.join('\n'),
            size: summary.areaSize,
          },
        });
      }

      console.log('[FarmMap] STEP 2c: built', features.length, 'features');
      if (features.length > 0) {
        console.log('[FarmMap] STEP 2d: first feature:', features[0].properties?.name, 'geom:', features[0].geometry.type, JSON.stringify(features[0].geometry).substring(0, 100));
      }

      currentFeaturesRef.current = features;
      source.setData({ type: 'FeatureCollection', features });
      console.log('[FarmMap] STEP 2e: setData called');

      // Check layer visibility
      if (map.getLayer('areas-fill')) {
        console.log('[FarmMap] STEP 2f: areas-fill visibility:', map.getLayoutProperty('areas-fill', 'visibility'));
        console.log('[FarmMap] STEP 2g: areas-fill paint color:', map.getPaintProperty('areas-fill', 'fill-color'));
        console.log('[FarmMap] STEP 2h: areas-fill paint opacity:', map.getPaintProperty('areas-fill', 'fill-opacity'));
      } else {
        console.log('[FarmMap] STEP 2f: areas-fill layer NOT FOUND');
      }

      // Fit bounds if we have features and no area is selected
      if (features.length > 0 && !selectedAreaId) {
        const bounds = new maplibregl.LngLatBounds();
        for (const feature of features) extendGeometryBounds(bounds, feature.geometry);
        if (!bounds.isEmpty()) {
          console.log('[FarmMap] STEP 2i: fitBounds to', bounds.toArray());
          map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
        }
      }

      // After a delay, check if features rendered
      setTimeout(() => {
        const rendered = map.queryRenderedFeatures(undefined, { layers: ['areas-fill'] });
        const sourceFeats = map.querySourceFeatures('areas-geojson');
        console.log('[FarmMap] STEP 3 (after 1.5s): rendered features:', rendered.length, 'source features:', sourceFeats.length);
        console.log('[FarmMap] STEP 3a: center:', map.getCenter(), 'zoom:', map.getZoom());
        console.log('[FarmMap] STEP 3b: container:', map.getContainer().clientWidth, 'x', map.getContainer().clientHeight, 'canvas:', map.getCanvas().clientWidth, 'x', map.getCanvas().clientHeight);
      }, 1500);
    };

    updateData();
  }, [summaries, viewMode, layerSettings, searchTerm, filters, selectedAreaId, referenceDate, mapReady]);

  // Toggle label visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer('areas-label')) map.setLayoutProperty('areas-label', 'visibility', layerSettings.showNames ? 'visible' : 'none');
  }, [layerSettings.showNames, mapReady]);

  // Apply boundary opacity changes in real time
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer('areas-fill')) {
      map.setPaintProperty('areas-fill', 'fill-opacity', layerSettings.boundaryOpacity);
    }
  }, [layerSettings.boundaryOpacity, mapReady]);

  // Toggle boundary visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const visibility = layerSettings.showBoundaries ? 'visible' : 'none';
    if (map.getLayer('areas-fill')) map.setLayoutProperty('areas-fill', 'visibility', visibility);
    if (map.getLayer('areas-outline')) map.setLayoutProperty('areas-outline', 'visibility', visibility);
    if (map.getLayer('areas-border')) map.setLayoutProperty('areas-border', 'visibility', visibility);
  }, [layerSettings.showBoundaries, mapReady]);

  const selectedSummary = useMemo(() => {
    if (!selectedAreaId) return null;
    return summaries.find(s => s.areaId === selectedAreaId) || null;
  }, [summaries, selectedAreaId]);

  const filteredSummaries = useMemo(() => {
    return summaries.filter(s => {
      if (searchTerm && !s.areaName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filters.crop && s.currentCrop?.toLowerCase() !== filters.crop.toLowerCase()) return false;
      if (filters.cultivar && s.cultivar?.toLowerCase() !== filters.cultivar.toLowerCase()) return false;
      return true;
    });
  }, [summaries, searchTerm, filters]);

  // Summary stats
  const stats = useMemo(() => {
    const totalArea = summaries.reduce((sum, s) => sum + s.areaSize, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const applicationsToday = operations.filter(op => {
      const opDate = new Date(op.startDate);
      opDate.setHours(0, 0, 0, 0);
      return opDate.getTime() === today.getTime();
    }).length;

    const overdueCount = summaries.filter(s => {
      const days = getDaysUntil(s.nextOperationDate, referenceDate);
      return days !== null && days < 0;
    }).length;

    const noFungicideCount = summaries.filter(s => !s.lastFungicideDate).length;

    return {
      areaCount: summaries.length,
      totalArea,
      applicationsToday,
      overdueCount,
      noFungicideCount,
      geomCount: summaries.filter(s => s.geojson).length,
    };
  }, [summaries, operations, referenceDate]);

  const handleSearchSelect = (areaId: string) => {
    const summary = summaries.find(s => s.areaId === areaId);
    if (!summary || !summary.geojson) return;

    setSelectedAreaId(areaId);

    // Fly to the area
    const map = mapRef.current;
    if (!map) return;
    const geom = JSON.parse(summary.geojson) as GeoJSON.Geometry;
    const bounds = new maplibregl.LngLatBounds();
    extendGeometryBounds(bounds, geom)
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
    }
  };

  const legend = getLegendForViewMode(viewMode);

  // Unique crops and cultivars for filter dropdowns
  const uniqueCrops = useMemo(() => {
    const crops = new Set<string>();
    summaries.forEach(s => { if (s.currentCrop) crops.add(s.currentCrop); });
    return Array.from(crops).sort();
  }, [summaries]);

  const uniqueCultivars = useMemo(() => {
    const cultivars = new Set<string>();
    summaries.forEach(s => { if (s.cultivar) cultivars.add(s.cultivar); });
    return Array.from(cultivars).sort();
  }, [summaries]);

  if (!activeSeason) {
    return (
      <div className="flex items-center justify-center h-full pt-20">
        <div className="text-center bg-gray-50 rounded-lg p-8">
          <MapIcon size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {language === 'pt' ? 'Nenhuma safra ativa' : 'No active season'}
          </h3>
          <p className="text-gray-600">
            {language === 'pt'
              ? 'Selecione uma safra no menu lateral para visualizar o mapa'
              : 'Select a season from the sidebar to view the map'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-5rem)] min-h-[520px] lg:h-[calc(100vh-3rem)] lg:min-h-[640px] pt-16 lg:pt-0">
      {/* Map area */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="absolute inset-0" />

        {/* Top bar with stats and controls */}
        <div className="absolute top-2 left-2 right-2 z-10 flex flex-wrap items-center gap-2">
          {/* Stats bar */}
          <div className="bg-white rounded-lg shadow-md px-3 py-2 flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <MapIcon size={14} className="text-green-700" />
              <span className="font-medium text-gray-700">{stats.areaCount}</span>
              <span className="text-gray-500">{language === 'pt' ? 'areas' : 'areas'}</span>
            </div>
            {stats.geomCount > 0 && (
              <div className="flex items-center gap-1">
                <MapIcon size={14} className="text-blue-600" />
                <span className="font-medium text-blue-600">{stats.geomCount}</span>
                <span className="text-gray-500">{language === 'pt' ? 'com limite' : 'with boundary'}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <Sprout size={14} className="text-green-700" />
              <span className="font-medium text-gray-700">{stats.totalArea.toFixed(1)}</span>
              <span className="text-gray-500">ha</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar size={14} className="text-blue-600" />
              <span className="font-medium text-gray-700">{stats.applicationsToday}</span>
              <span className="text-gray-500">{language === 'pt' ? 'hoje' : 'today'}</span>
            </div>
            {stats.overdueCount > 0 && (
              <div className="flex items-center gap-1">
                <AlertTriangle size={14} className="text-red-600" />
                <span className="font-medium text-red-600">{stats.overdueCount}</span>
                <span className="text-red-500">{language === 'pt' ? 'atrasadas' : 'overdue'}</span>
              </div>
            )}
            {stats.noFungicideCount > 0 && (
              <div className="flex items-center gap-1">
                <FlaskConical size={14} className="text-gray-500" />
                <span className="font-medium text-gray-600">{stats.noFungicideCount}</span>
                <span className="text-gray-500">{language === 'pt' ? 'sem fungicida' : 'no fungicide'}</span>
              </div>
            )}
          </div>

          {/* View mode dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowViewModeDropdown(!showViewModeDropdown)}
              className="bg-white rounded-lg shadow-md px-3 py-2 flex items-center gap-2 text-sm hover:bg-gray-50 transition-colors"
            >
              <Layers size={16} className="text-green-700" />
              <span className="text-gray-700">{getViewModeLabel(viewMode, language)}</span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {showViewModeDropdown && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[200px] z-20">
                {VIEW_MODES.map(mode => (
                  <button
                    key={mode}
                    onClick={() => { setViewMode(mode); setShowViewModeDropdown(false); }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${mode === viewMode ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-700'}`}
                  >
                    {getViewModeLabel(mode, language)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <input
              type="text"
              placeholder={language === 'pt' ? 'Buscar area...' : 'Search area...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm bg-white rounded-lg shadow-md border-0 focus:ring-2 focus:ring-green-500"
            />
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            {searchTerm && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 max-h-60 overflow-y-auto z-20">
                {filteredSummaries.slice(0, 10).map(s => (
                  <button
                    key={s.areaId}
                    onClick={() => { handleSearchSelect(s.areaId); setSearchTerm(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors text-gray-700"
                  >
                    {s.areaName}
                  </button>
                ))}
                {filteredSummaries.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-400">
                    {language === 'pt' ? 'Nenhuma area encontrada' : 'No areas found'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`bg-white rounded-lg shadow-md p-2 hover:bg-gray-50 transition-colors ${showFilters ? 'ring-2 ring-green-500' : ''}`}
            title={language === 'pt' ? 'Filtros' : 'Filters'}
          >
            <Filter size={18} className="text-gray-700" />
          </button>
          <button
            onClick={() => setShowLayerControl(!showLayerControl)}
            className={`bg-white rounded-lg shadow-md p-2 hover:bg-gray-50 transition-colors ${showLayerControl ? 'ring-2 ring-green-500' : ''}`}
            title={language === 'pt' ? 'Camadas' : 'Layers'}
          >
            <Layers size={18} className="text-gray-700" />
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="bg-white rounded-lg shadow-md p-2 hover:bg-gray-50 transition-colors"
            title={language === 'pt' ? 'Importar Perimetros' : 'Import Perimeters'}
          >
            <Upload size={18} className="text-gray-700" />
          </button>
          {summaries.some(s => s.geojson) && (
            <button
              onClick={() => {
                const map = mapRef.current;
                if (!map) return;
                const feats = currentFeaturesRef.current;
                if (feats.length === 0) return;
                const bounds = new maplibregl.LngLatBounds();
                for (const feature of feats) extendGeometryBounds(bounds, feature.geometry)
                if (!bounds.isEmpty()) {
                  map.fitBounds(bounds, { padding: 50, maxZoom: 16 });
                }
              }}
              className="bg-white rounded-lg shadow-md p-2 hover:bg-gray-50 transition-colors"
              title={language === 'pt' ? 'Centralizar nas areas' : 'Fit to areas'}
            >
              <MapIcon size={18} className="text-green-700" />
            </button>
          )}
        </div>

        {/* Legend */}
        {legend.length > 0 && (
          <div className="absolute bottom-2 left-2 z-10 bg-white rounded-lg shadow-md p-3">
            <h4 className="text-xs font-semibold text-gray-600 mb-2">
              {getViewModeLabel(viewMode, language)}
            </h4>
            <div className="space-y-1">
              {legend.map((entry, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded border border-gray-300"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs text-gray-700">{entry.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Layer control panel */}
        {showLayerControl && (
          <div className="absolute top-20 right-2 z-10">
            <LayerControl settings={layerSettings} onChange={setLayerSettings} />
          </div>
        )}

        {/* Filters panel */}
        {showFilters && (
          <div className="absolute top-20 right-2 z-10 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-64">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900 text-sm">
                {language === 'pt' ? 'Filtros' : 'Filters'}
              </h3>
              <button onClick={() => setShowFilters(false)} className="p-1 rounded hover:bg-gray-100">
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'pt' ? 'Cultura' : 'Crop'}</label>
                <select
                  value={filters.crop}
                  onChange={(e) => setFilters({ ...filters, crop: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
                >
                  <option value="">{language === 'pt' ? 'Todas' : 'All'}</option>
                  {uniqueCrops.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'pt' ? 'Cultivar' : 'Cultivar'}</label>
                <select
                  value={filters.cultivar}
                  onChange={(e) => setFilters({ ...filters, cultivar: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500"
                >
                  <option value="">{language === 'pt' ? 'Todos' : 'All'}</option>
                  {uniqueCultivars.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setFilters({ crop: '', cultivar: '', operationType: '', operator: '', product: '', nextAppStatus: '' })}
              >
                {language === 'pt' ? 'Limpar Filtros' : 'Clear Filters'}
              </Button>
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-green-700 border-t-transparent"></div>
              <p className="mt-2 text-sm text-gray-600">
                {language === 'pt' ? 'Carregando mapa...' : 'Loading map...'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Side panel - desktop */}
      {selectedSummary && (
        <div className="hidden lg:flex w-80 flex-none border-l border-gray-200">
          <AreaDetailPanel
            summary={selectedSummary}
            onClose={() => setSelectedAreaId(null)}
          />
        </div>
      )}

      {/* Bottom sheet - mobile */}
      {selectedSummary && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 max-h-[70vh]">
          <AreaDetailPanel
            summary={selectedSummary}
            onClose={() => setSelectedAreaId(null)}
          />
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <ImportPerimeters
          onClose={() => setShowImport(false)}
          onImportComplete={() => {
            if (activeSeason) {
              setLoading(true);
              getAreaMapSummary(activeSeason.id).then(data => {
                summariesRef.current = data;
                setSummaries(data);
                setLoading(false);
              });
            }
          }}
        />
      )}
    </div>
  );
};
