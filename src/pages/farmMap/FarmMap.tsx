import { useFieldSync } from '../../context/FieldSyncContext';
import { OfflineScope, readOfflineValue, writeOfflineValue } from '../../hooks/useOfflineStorage';
import Select from '../../components/ui/Select';
import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as maplibregl from '../../lib/maplibre';
import { useAppContext } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { getFieldRainfallTotals, type RainfallPeriod } from '../../lib/fieldData';
import { useFieldPage } from '../../hooks/useFieldPage';
import { listMapSamples } from '../../lib/precisionData';
import { sampleColors } from '../../lib/precisionTypes';
import { formatQuantity } from '../../utils/quantityFormat';
import { AreaMapSummary, ViewMode, LayerSettings, MapFilters } from '../../types/farmMap';
import {
  getAreaColor,
  getLegendForViewMode,
  getViewModeLabel,
  getDaysUntil,
} from '../../utils/farmMap/farmMapHelpers';
import Button from '../../components/ui/Button';
import LayerControl from '../../components/farmMap/LayerControl';
import AreaDetailPanel from '../../components/farmMap/AreaDetailPanel';
import ImportPerimeters from '../../components/farmMap/ImportPerimeters';
import {
  Map as MapIcon, Layers, Upload, Filter, X,
  Calendar, AlertTriangle, Sprout, FlaskConical, CloudRain, Crosshair,
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
  const { activeSeason, areas, getAreaMapSummary, operations, isOnline } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const showRainfall = searchParams.get('layer') === 'rainfall';
  const showSamples = searchParams.get('samples') === 'yes';
  const [rainfallPeriod, setRainfallPeriod] = useState<RainfallPeriod>('season');
  const [rainfallSnapshot, setRainfallSnapshot] = useState<{ key: string; totals: Record<string, number> } | null>(null);
  const [rainfallStatus, setRainfallStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const seasonId = activeSeason?.id;
  const hasSeason = Boolean(seasonId);
  const isPt = language === 'pt';
  const scope = useContext(OfflineScope);
  const { revision: fieldRevision, entries } = useFieldSync();
  const sampleRecords = useFieldPage('precision-farm-map', seasonId ?? '', '', 0,
    isOnline && showSamples && !!seasonId, fieldRevision, listMapSamples);
  const rainfallKey = 'agrigest:v2:rainfall-totals:' + scope + ':' + seasonId + ':' + rainfallPeriod;
  const rainfall = rainfallSnapshot?.key === rainfallKey ? rainfallSnapshot.totals : null;

  useEffect(() => {
    if (!showRainfall || !seasonId || !scope) return;
    const cached = readOfflineValue<Record<string, number> | null>(rainfallKey, null);
    setRainfallSnapshot(cached ? { key: rainfallKey, totals: cached } : null);
    if (!isOnline) return;
    const controller = new AbortController();
    setRainfallStatus('loading');
    void getFieldRainfallTotals(seasonId, rainfallPeriod, controller.signal)
      .then(totals => {
        if (controller.signal.aborted) return;
        writeOfflineValue(rainfallKey, totals);
        setRainfallSnapshot({ key: rainfallKey, totals });
        setRainfallStatus('ready');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        console.error('Error loading field rainfall:', error);
        setRainfallStatus('error');
      });
    return () => controller.abort();
  }, [fieldRevision, isOnline, rainfallKey, rainfallPeriod, scope, seasonId, showRainfall]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const currentFeaturesRef = useRef<GeoJSON.Feature[]>([]);

  const [summaries, setSummaries] = useState<AreaMapSummary[]>([]);
  const [mapRevision, setMapRevision] = useState(0);
  const fittedSeason = useRef<string>();
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(() => searchParams.get('area'));
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
  const [filters, setFilters] = useState<MapFilters>({
    crop: '', cultivar: '', operationType: '', operator: '', product: '', nextAppStatus: '',
  });
  const [referenceDate] = useState(new Date());

  useEffect(() => {
    if (!seasonId) {
      setSummaries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getAreaMapSummary(seasonId).then(data => {
      if (!cancelled) {
        setSummaries(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [seasonId, getAreaMapSummary, mapRevision]);

  // Initialize map
  useEffect(() => {
    if (!hasSeason || !mapContainerRef.current) return;
    if (mapRef.current) return;


    const initialStyle: maplibregl.StyleSpecification = {
      version: 8,
      sources: { ...SATELLITE_STYLE.sources, ...STREETS_STYLE.sources },
      layers: [
        { id: 'base-background', type: 'background', paint: { 'background-color': '#34424b' } },
        ...SATELLITE_STYLE.layers,
        ...STREETS_STYLE.layers.map(layer => ({ ...layer, layout: { visibility: 'none' as const } })),
      ]
    };

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: initialStyle,
        center: [-51.0, -16.0],
        zoom: 8,
      });
      setMapUnavailable(false);
    } catch (error) {
      console.error('Error initializing farm map:', error);
      setMapUnavailable(true);
      return;
    }


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
      m.addSource('farm-sample-points', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'farm-sample-points', source: 'farm-sample-points', type: 'circle', paint: {
        'circle-radius': ['case', ['boolean', ['get', 'composite'], false], 9, 6],
        'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2,
      } });

    };

    // style.load fires when the style is parsed and is the right time to add
    // GeoJSON sources/layers dynamically. We use this instead of 'load' because
    // 'load' waits for raster tiles to download, which may never complete if tile
    // servers are unreachable.
    map.once('style.load', () => {
      addAreasSourceAndLayers(map);
      setMapReady(true);
    });

    map.on('error', (event) => {
      console.error('Error loading farm map:', event.error);
    });

    mapRef.current = map;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(mapContainerRef.current);
    requestAnimationFrame(() => { if (mapRef.current === map) map.resize(); });

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      fittedSeason.current = undefined;
      eventsSetupRef.current = false;
      setMapReady(false);
    };
  }, [hasSeason]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setLayoutProperty('satellite-layer', 'visibility', isOnline && layerSettings.baseMap === 'satellite' ? 'visible' : 'none');
    map.setLayoutProperty('osm-layer', 'visibility', isOnline && layerSettings.baseMap === 'streets' ? 'visible' : 'none');
  }, [isOnline, layerSettings.baseMap, mapReady]);

  useEffect(() => {
    if (!mapReady) return;
    const points = new Map((sampleRecords.data ?? []).map(sample => [sample.id, sample]));
    for (const entry of entries) {
      if (entry.kind === 'sample' && entry.record.season_id === seasonId && !points.has(entry.id)) points.set(entry.id, entry.record);
    }
    const features: GeoJSON.Feature<GeoJSON.Point>[] = showSamples ? [...points.values()]
      .filter(sample => !selectedAreaId || sample.area_id === selectedAreaId)
      .map(sample => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [sample.longitude, sample.latitude] },
        properties: { color: sampleColors[sample.sample_type] ?? '#777', composite: sample.sample_mode === 'composite' },
      })) : [];
    mapRef.current?.getSource<maplibregl.GeoJSONSource>('farm-sample-points')?.setData({ type: 'FeatureCollection', features });
  }, [entries, mapReady, sampleRecords.data, seasonId, selectedAreaId, showSamples]);

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
      setupLayerEvents(map);

      const source = map.getSource('areas-geojson') as maplibregl.GeoJSONSource;
      if (!source) return;

      const features: GeoJSON.Feature[] = [];

      for (const summary of summaries) {
        if (!summary.geojson) continue;

        // Apply filters
        if (filters.crop && summary.currentCrop?.toLowerCase() !== filters.crop.toLowerCase()) continue;
        if (filters.cultivar && summary.cultivar?.toLowerCase() !== filters.cultivar.toLowerCase()) continue;

        let geom: GeoJSON.Geometry;
        try {
          geom = JSON.parse(summary.geojson) as GeoJSON.Geometry;
        } catch {
          continue;
        }

        // Build label
        const labelParts: string[] = [summary.areaName];
        if (layerSettings.showCrop && summary.currentCrop) labelParts.push(summary.currentCrop);
        if (layerSettings.showCultivar && summary.cultivar) labelParts.push(summary.cultivar);

        const rain = rainfall?.[summary.areaId];
        if (showRainfall && rain !== undefined) labelParts.push(formatQuantity(rain, language) + ' mm');
        const color = showRainfall
          ? rain === undefined ? '#64748b' : rain >= 50 ? '#1d4ed8' : rain > 0 ? '#0284c7' : '#bae6fd'
          : getAreaColor(viewMode, summary, referenceDate);

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


      currentFeaturesRef.current = features;
      source.setData({ type: 'FeatureCollection', features });

      const viewKey = `${seasonId}:${selectedAreaId ?? ''}`;
      if (features.length && fittedSeason.current !== viewKey) {
        const bounds = new maplibregl.LngLatBounds();
        for (const feature of features) {
          if (!selectedAreaId || feature.properties?.areaId === selectedAreaId) extendGeometryBounds(bounds, feature.geometry);
        }
        if (!bounds.isEmpty()) {
          fittedSeason.current = viewKey;
          map.fitBounds(bounds, { padding: 52, maxZoom: 15, duration: 0 });
        }
      }
    };

    updateData();
  }, [summaries, viewMode, layerSettings, filters, selectedAreaId, seasonId, referenceDate, mapReady, showRainfall, rainfall, rainfallStatus, isOnline, language]);

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
      if (filters.crop && s.currentCrop?.toLowerCase() !== filters.crop.toLowerCase()) return false;
      if (filters.cultivar && s.cultivar?.toLowerCase() !== filters.cultivar.toLowerCase()) return false;
      return true;
    });
  }, [summaries, filters]);

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
    if (!summary) return;

    setSelectedAreaId(areaId);

    const map = mapRef.current;
    if (!map || !summary.geojson) return;
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
        {mapUnavailable && (
          <p role="status" className="absolute inset-x-4 top-1/2 text-center text-sm text-gray-600">
            {isPt ? 'O mapa não pôde ser exibido neste dispositivo.' : 'The map could not be displayed on this device.'}
          </p>
        )}

        {/* Top bar with stats and controls */}
        <div className="absolute top-2 left-2 right-14 z-10 flex flex-wrap items-center gap-2">
          <Link to={'/precision?tab=map' + (selectedAreaId ? '&area=' + encodeURIComponent(selectedAreaId) : '')}
            className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-brand-700 shadow-md hover:underline">
            {isPt ? 'Mapa de análises' : 'Analysis map'}
          </Link>
          {/* Stats bar */}
          <div className="bg-white rounded-lg shadow-md px-3 py-2 flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <MapIcon size={14} className="text-brand-700" />
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
              <Sprout size={14} className="text-brand-700" />
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
                <AlertTriangle size={14} className="text-danger-600" />
                <span className="font-medium text-danger-600">{stats.overdueCount}</span>
                <span className="text-danger-500">{language === 'pt' ? 'atrasadas' : 'overdue'}</span>
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

          <div className="w-48">
            <Select aria-label={isPt ? 'Visualização do mapa' : 'Map view'} value={viewMode}
              onChange={event => setViewMode(event.target.value as ViewMode)}
              options={VIEW_MODES.map(mode => ({ value: mode, label: getViewModeLabel(mode, language) }))} />
          </div>

          <Button type="button" size="sm" variant={showRainfall ? 'primary' : 'outline'}
            leftIcon={<CloudRain size={16} />} aria-pressed={showRainfall}
            onClick={() => setSearchParams(current => {
              const next = new URLSearchParams(current);
              if (showRainfall) next.delete('layer');
              else next.set('layer', 'rainfall');
              return next;
            }, { replace: true })}>
            {isPt ? 'Pluviometria' : 'Rainfall'}
          </Button>

          <Button type="button" size="sm" variant={showSamples ? 'primary' : 'outline'} leftIcon={<Crosshair size={16} />}
            aria-pressed={showSamples} onClick={() => setSearchParams(current => {
              const next = new URLSearchParams(current);
              if (showSamples) next.delete('samples');
              else next.set('samples', 'yes');
              return next;
            }, { replace: true })}>{isPt ? 'Coletas' : 'Samples'}</Button>
          {showSamples && sampleRecords.failed && <span role="status" className="rounded bg-white p-1 text-xs">
            {isPt ? 'Coletas remotas indisponíveis.' : 'Remote samples unavailable.'}
          </span>}

          <div className="w-full sm:w-64">
            <Select placeholder={isPt ? 'Buscar talhão' : 'Find a field'} value={selectedAreaId ?? ''}
              onChange={event => handleSearchSelect(event.target.value)}
              options={filteredSummaries.map(summary => ({
                value: summary.areaId, label: summary.areaName,
                content: <span>{summary.areaName}{!summary.geojson && <span className="ml-2 text-xs text-gray-500">{isPt ? 'Sem perímetro' : 'No boundary'}</span>}</span>,
              }))} />
          </div>

          {/* Action buttons */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`bg-white rounded-lg shadow-md p-2 hover:bg-gray-50 transition-colors ${showFilters ? 'ring-2 ring-brand-500' : ''}`}
            title={language === 'pt' ? 'Filtros' : 'Filters'}
          >
            <Filter size={18} className="text-gray-700" />
          </button>
          <button
            onClick={() => setShowLayerControl(!showLayerControl)}
            className={`bg-white rounded-lg shadow-md p-2 hover:bg-gray-50 transition-colors ${showLayerControl ? 'ring-2 ring-brand-500' : ''}`}
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
              <MapIcon size={18} className="text-brand-700" />
            </button>
          )}
        </div>

        {!loading && !stats.geomCount && !mapUnavailable && (
          <div role="status" className="absolute inset-x-4 top-1/2 mx-auto w-fit rounded-lg bg-white p-3 text-center text-sm shadow">
            <p>{isPt ? 'Nenhum perímetro disponível nesta safra.' : 'No field boundaries available for this season.'}</p>
            <button type="button" onClick={() => setShowImport(true)} className="mt-1 font-medium text-brand-700 underline">
              {isPt ? 'Importar perímetros' : 'Import boundaries'}
            </button>
          </div>
        )}

        {/* Legend */}
        {!showRainfall && legend.length > 0 && (
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

        {showRainfall && (
          <section className="absolute bottom-10 right-2 z-10 w-64 max-w-[calc(100%-1rem)] rounded-lg bg-white p-3 text-sm shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="rainfall-period" className="font-semibold">{isPt ? 'Chuva acumulada' : 'Rainfall totals'}</label>
              <div className="w-full">
                <Select id="rainfall-period" value={rainfallPeriod} onChange={event => setRainfallPeriod(event.target.value as RainfallPeriod)}
                  options={[
                    { value: 'week', label: isPt ? 'Esta semana' : 'This week' },
                    { value: 'month', label: isPt ? 'Este mês' : 'This month' },
                    { value: 'season', label: isPt ? 'Safra selecionada' : 'Selected season' },
                  ]} />
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">{activeSeason.name}</p>
            {!isOnline && <p className="mt-2 text-xs text-gray-600">{rainfall
              ? (isPt ? 'Última consulta neste dispositivo' : 'Last result on this device')
              : (isPt ? 'Nenhum total armazenado para este período.' : 'No cached totals for this period.')}</p>}
            {isOnline && rainfallStatus === 'loading' && <p className="mt-2" role="status">{isPt ? 'Atualizando…' : 'Refreshing…'}</p>}
            {isOnline && rainfallStatus === 'error' && <p className="mt-2" role="alert">{isPt ? 'Não foi possível atualizar as chuvas.' : 'Could not update rainfall.'}</p>}
            {rainfall && (
                <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto">
                  {areas.map(area => (
                    <li className="flex justify-between gap-2" key={area.id}>
                      <span>{area.name}</span>
                      <span className="shrink-0 font-medium">{rainfall[area.id] === undefined
                        ? (isPt ? 'Sem leitura' : 'No reading')
                        : formatQuantity(rainfall[area.id], language) + ' mm'}</span>
                    </li>
                  ))}
                </ul>
              )}
            <Link to="/rainfall" className="mt-2 inline-block text-xs text-brand-700 underline">
              {isPt ? 'Registrar chuva' : 'Record rainfall'}
            </Link>
          </section>
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
                <Select aria-label={isPt ? 'Cultura' : 'Crop'} value={filters.crop}
                  onChange={event => setFilters({ ...filters, crop: event.target.value })}
                  options={[{ value: '', label: isPt ? 'Todas' : 'All' }, ...uniqueCrops.map(crop => ({ value: crop, label: crop }))]} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{language === 'pt' ? 'Cultivar' : 'Cultivar'}</label>
                <Select aria-label="Cultivar" value={filters.cultivar}
                  onChange={event => setFilters({ ...filters, cultivar: event.target.value })}
                  options={[{ value: '', label: isPt ? 'Todos' : 'All' }, ...uniqueCultivars.map(cultivar => ({ value: cultivar, label: cultivar }))]} />
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
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-700 border-t-transparent"></div>
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
            rainfallLabel={showRainfall && rainfall
              ? rainfall[selectedSummary.areaId] === undefined
                ? (isPt ? 'Sem leitura' : 'No reading')
                : formatQuantity(rainfall[selectedSummary.areaId], language) + ' mm'
              : undefined}
            onClose={() => setSelectedAreaId(null)}
          />
        </div>
      )}

      {/* Bottom sheet - mobile */}
      {selectedSummary && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 max-h-[70vh]">
          <AreaDetailPanel
            summary={selectedSummary}
            rainfallLabel={showRainfall && rainfall
              ? rainfall[selectedSummary.areaId] === undefined
                ? (isPt ? 'Sem leitura' : 'No reading')
                : formatQuantity(rainfall[selectedSummary.areaId], language) + ' mm'
              : undefined}
            onClose={() => setSelectedAreaId(null)}
          />
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <ImportPerimeters
          onClose={() => setShowImport(false)}
          onImportComplete={() => setMapRevision(value => value + 1)}
        />
      )}
    </div>
  );
};
