import { ViewMode, ColorScaleEntry, ImportedPolygon } from '../../types/farmMap';
import { parseDate } from '../dateHelpers';

export const DAY_COLOR_SCALES: ColorScaleEntry[] = [
  { label: '0-5 dias', color: '#16a34a', maxDays: 5 },
  { label: '6-10 dias', color: '#65a30d', maxDays: 10 },
  { label: '11-15 dias', color: '#eab308', maxDays: 15 },
  { label: '16-20 dias', color: '#ea580c', maxDays: 20 },
  { label: 'Mais de 20 dias', color: '#dc2626', maxDays: null },
];

export const NEVER_APPLIED_COLOR = '#9ca3af';
export const NO_DATA_COLOR = '#d1d5db';

export const NEXT_APP_COLOR_SCALES: ColorScaleEntry[] = [
  { label: 'Vencida', color: '#dc2626', maxDays: -1 },
  { label: 'Hoje', color: '#ea580c', maxDays: 0 },
  { label: 'Em ate 3 dias', color: '#eab308', maxDays: 3 },
  { label: 'Em ate 7 dias', color: '#65a30d', maxDays: 7 },
  { label: 'Mais de 7 dias', color: '#16a34a', maxDays: null },
];

const CROP_COLORS = [
  '#16a34a', '#2563eb', '#ea580c', '#9333ea', '#0891b2',
  '#db2777', '#ca8a04', '#4f46e5', '#059669', '#b45309',
];

export function getCropColor(crop: string | null): string {
  if (!crop || crop.trim() === '') return NO_DATA_COLOR;
  const lower = crop.toLowerCase();
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = lower.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CROP_COLORS[Math.abs(hash) % CROP_COLORS.length];
}

export function getCultivarColor(cultivar: string | null): string {
  if (!cultivar || cultivar.trim() === '') return NO_DATA_COLOR;
  const lower = cultivar.toLowerCase();
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = lower.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CROP_COLORS[Math.abs(hash) % CROP_COLORS.length];
}

export function getDaysSince(dateStr: string | null, referenceDate?: Date): number | null {
  if (!dateStr) return null;
  const date = parseDate(dateStr);
  if (!date) return null;
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  ref.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.floor((ref.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDaysUntil(dateStr: string | null, referenceDate?: Date): number | null {
  if (!dateStr) return null;
  const date = parseDate(dateStr);
  if (!date) return null;
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  ref.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.floor((date.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
}

export function getColorForDays(days: number | null): string {
  if (days === null) return NEVER_APPLIED_COLOR;
  for (const entry of DAY_COLOR_SCALES) {
    if (entry.maxDays === null || days <= entry.maxDays) return entry.color;
  }
  return DAY_COLOR_SCALES[DAY_COLOR_SCALES.length - 1].color;
}

export function getColorForNextApp(days: number | null): string {
  if (days === null) return NO_DATA_COLOR;
  if (days < 0) return NEXT_APP_COLOR_SCALES[0].color;
  if (days === 0) return NEXT_APP_COLOR_SCALES[1].color;
  if (days <= 3) return NEXT_APP_COLOR_SCALES[2].color;
  if (days <= 7) return NEXT_APP_COLOR_SCALES[3].color;
  return NEXT_APP_COLOR_SCALES[4].color;
}

interface SummaryData {
  lastOperationDate: string | null;
  lastFungicideDate: string | null;
  lastInsecticideDate: string | null;
  lastHerbicideDate: string | null;
  lastDessecacaoDate: string | null;
  nextOperationDate: string | null;
  currentCrop: string | null;
  cultivar: string | null;
}

export function getAreaColor(viewMode: ViewMode, summary: SummaryData, referenceDate?: Date): string {
  switch (viewMode) {
    case 'lastOperation':
      return getColorForDays(getDaysSince(summary.lastOperationDate, referenceDate));
    case 'lastFungicide':
      return getColorForDays(getDaysSince(summary.lastFungicideDate, referenceDate));
    case 'lastInsecticide':
      return getColorForDays(getDaysSince(summary.lastInsecticideDate, referenceDate));
    case 'lastHerbicide':
      return getColorForDays(getDaysSince(summary.lastHerbicideDate, referenceDate));
    case 'lastDessecacao':
      return getColorForDays(getDaysSince(summary.lastDessecacaoDate, referenceDate));
    case 'nextApplication':
      return getColorForNextApp(getDaysUntil(summary.nextOperationDate, referenceDate));
    case 'crop':
      return getCropColor(summary.currentCrop);
    case 'cultivar':
      return getCultivarColor(summary.cultivar);
    default:
      return NO_DATA_COLOR;
  }
}

export function getLegendForViewMode(viewMode: ViewMode): ColorScaleEntry[] {
  if (viewMode === 'nextApplication') {
    return [...NEXT_APP_COLOR_SCALES, { label: 'Sem programacao', color: NO_DATA_COLOR, maxDays: null }];
  }
  if (viewMode === 'crop' || viewMode === 'cultivar') {
    return [];
  }
  return [...DAY_COLOR_SCALES, { label: 'Nunca aplicado', color: NEVER_APPLIED_COLOR, maxDays: null }];
}

export function getViewModeLabel(mode: ViewMode, language: 'pt' | 'en'): string {
  const labels: Record<ViewMode, { pt: string; en: string }> = {
    lastOperation: { pt: 'Ultima operacao', en: 'Last operation' },
    lastFungicide: { pt: 'Ultimo fungicida', en: 'Last fungicide' },
    lastInsecticide: { pt: 'Ultimo inseticida', en: 'Last insecticide' },
    lastHerbicide: { pt: 'Ultimo herbicida', en: 'Last herbicide' },
    lastDessecacao: { pt: 'Ultima desseccao', en: 'Last desiccation' },
    nextApplication: { pt: 'Proxima aplicacao', en: 'Next application' },
    crop: { pt: 'Cultura', en: 'Crop' },
    cultivar: { pt: 'Cultivar', en: 'Cultivar' },
  };
  return labels[mode][language];
}

export function formatDateBR(dateStr: string | null): string {
  if (!dateStr) return '--/--/----';
  const date = parseDate(dateStr);
  if (!date) return '--/--/----';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function calculatePolygonAreaHectares(geometry: GeoJSON.Geometry): number {
  if (geometry.type === 'Polygon') {
    return ringAreaHectares(geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon') {
    let total = 0;
    for (const polygon of geometry.coordinates) {
      total += ringAreaHectares(polygon[0]);
    }
    return total;
  }
  return 0;
}

function ringAreaHectares(coords: number[][]): number {
  if (coords.length < 3) return 0;
  const R = 6378137;
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    const lat1 = (coords[i][1] * Math.PI) / 180;
    const lat2 = (coords[j][1] * Math.PI) / 180;
    const lon1 = (coords[i][0] * Math.PI) / 180;
    const lon2 = (coords[j][0] * Math.PI) / 180;
    area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = Math.abs(area * R * R / 2);
  return area / 10000;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshtein(na, nb);
  return 1 - dist / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function sizeSimilarity(a: number, b: number): number {
  if (a === 0 && b === 0) return 1;
  const diff = Math.abs(a - b);
  const avg = (a + b) / 2;
  if (avg === 0) return 0;
  return Math.max(0, 1 - (diff / avg) * 2);
}

export function parseKML(kmlText: string): ImportedPolygon[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'text/xml');
  const placemarks = doc.getElementsByTagName('Placemark');
  const results: ImportedPolygon[] = [];

  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const nameEl = pm.getElementsByTagName('name')[0];
    const name = nameEl ? nameEl.textContent || `Poligono ${i + 1}` : `Poligono ${i + 1}`;

    const polygonEl = pm.getElementsByTagName('Polygon')[0];
    if (!polygonEl) continue;

    const outerBoundary = polygonEl.getElementsByTagName('outerBoundaryIs')[0];
    if (!outerBoundary) continue;

    const linearRing = outerBoundary.getElementsByTagName('LinearRing')[0];
    if (!linearRing) continue;

    const coordsEl = linearRing.getElementsByTagName('coordinates')[0];
    if (!coordsEl || !coordsEl.textContent) continue;

    const coords = coordsEl.textContent.trim().split(/\s+/).map(c => {
      const parts = c.split(',').map(Number);
      return [parts[0], parts[1]];
    });

    if (coords.length < 3) continue;

    const geometry: GeoJSON.Geometry = {
      type: 'Polygon',
      coordinates: [coords],
    };

    const feature: GeoJSON.Feature = {
      type: 'Feature',
      geometry,
      properties: { name },
    };

    results.push({
      id: `import-${i}-${Date.now()}`,
      name,
      areaHectares: calculatePolygonAreaHectares(geometry),
      geojson: feature,
      matchedAreaId: null,
      matchConfidence: 0,
    });
  }

  return results;
}

export function parseGeoJSONFile(text: string): ImportedPolygon[] {
  const data = JSON.parse(text);
  const results: ImportedPolygon[] = [];

  const features: GeoJSON.Feature[] = data.type === 'FeatureCollection' ? data.features : [data];

  features.forEach((feature, i) => {
    if (!feature.geometry) return;
    const geom = feature.geometry;
    if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return;

    const name = (feature.properties?.name as string) || `Poligono ${i + 1}`;

    results.push({
      id: `import-${i}-${Date.now()}`,
      name,
      areaHectares: calculatePolygonAreaHectares(geom),
      geojson: { ...feature, geometry: geom },
      matchedAreaId: null,
      matchConfidence: 0,
    });
  });

  return results;
}

export async function parseShapefile(file: File): Promise<ImportedPolygon[]> {
  const arrayBuffer = await file.arrayBuffer();
  const shp = (await import('shpjs')).default;
  const geojson = await shp(arrayBuffer);

  const features: GeoJSON.Feature[] = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
  const results: ImportedPolygon[] = [];

  features.forEach((feature, i) => {
    if (!feature.geometry) return;
    const geom = feature.geometry;
    if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return;

    const name = (feature.properties?.name as string) ||
      (feature.properties?.NOME as string) ||
      (feature.properties?.Name as string) ||
      `Poligono ${i + 1}`;

    results.push({
      id: `import-${i}-${Date.now()}`,
      name,
      areaHectares: calculatePolygonAreaHectares(geom),
      geojson: { ...feature, geometry: geom },
      matchedAreaId: null,
      matchConfidence: 0,
    });
  });

  return results;
}

export async function parseKMZ(file: File): Promise<ImportedPolygon[]> {
  const arrayBuffer = await file.arrayBuffer();
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(arrayBuffer);

  let kmlContent: string | null = null;
  for (const filename of Object.keys(zip.files)) {
    if (filename.toLowerCase().endsWith('.kml')) {
      kmlContent = await zip.files[filename].async('text');
      break;
    }
  }

  if (!kmlContent) throw new Error('No KML file found inside KMZ archive');
  return parseKML(kmlContent);
}

export function stripZCoordinates(geometry: GeoJSON.Geometry): GeoJSON.Geometry {
  if (geometry.type === 'Polygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(ring =>
        ring.map(([lng, lat]: number[]) => [lng, lat])
      ),
    };
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(polygon =>
        polygon.map(ring =>
          ring.map(([lng, lat]: number[]) => [lng, lat])
        )
      ),
    };
  }
  return geometry;
}

export function matchPolygonToAreas(
  polygon: ImportedPolygon,
  areas: { id: string; name: string; size: number }[]
): { areaId: string; confidence: number } | null {
  let bestMatch: { areaId: string; confidence: number } | null = null;

  for (const area of areas) {
    const nSim = nameSimilarity(polygon.name, area.name);
    const sSim = sizeSimilarity(polygon.areaHectares, area.size);
    const combined = nSim * 0.7 + sSim * 0.3;

    if (combined > 0.5 && (!bestMatch || combined > bestMatch.confidence)) {
      bestMatch = { areaId: area.id, confidence: combined };
    }
  }

  return bestMatch;
}