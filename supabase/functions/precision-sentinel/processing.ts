export type VegetationIndex = 'NDVI' | 'GNDVI';
export const cloudClasses = [3, 7, 8, 9, 10];
export const invalidClasses = [0, 1, 3, 7, 8, 9, 10, 11];
export const vegetationColors = ['#9d3a38', '#e5ac61', '#f2e3a2', '#a5cd83', '#236848'];

export function calculateIndex(nir: number, visible: number, scl: number, mask = 1) {
  return !mask || invalidClasses.includes(scl) || nir + visible <= 0 || nir < 0 || visible < 0
    ? null : (nir - visible) / (nir + visible);
}

export function evalscript(index: VegetationIndex, image: boolean) {
  const band = index === 'GNDVI' ? 'B03' : 'B04';
  const palette = vegetationColors.map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
  return `//VERSION=3
function setup() {
  return { input: [{bands: ["B08", "${band}", "SCL", "dataMask"]}], output: ${image
    ? '{bands:4,sampleType:"UINT8"}'
    : '[{id:"index",bands:1,sampleType:"FLOAT32"},{id:"cloud",bands:1,sampleType:"UINT8"},{id:"dataMask",bands:["index","cloud"]}]'} };
}
function evaluatePixel(s) {
  const cloud = ${JSON.stringify(cloudClasses)}.indexOf(s.SCL) >= 0;
  const clear = +!!(s.dataMask && ${JSON.stringify(invalidClasses)}.indexOf(s.SCL) < 0 && s.B08 >= 0 && s.${band} >= 0 && s.B08 + s.${band} > 0);
  const vegetation = clear ? (s.B08 - s.${band}) / (s.B08 + s.${band}) : 0;
  ${image ? `if (!clear) return [0,0,0,0];
  const colors = ${JSON.stringify(palette)};
  return colors[Math.min(4, Math.floor((vegetation + 1) * 2.5))].concat(255);`
    : 'return {index:[vegetation],cloud:[+cloud],dataMask:[clear,s.dataMask]};'}
}`;
}

export function daysBetween(from: string, to: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(from) || !date.test(to)) return NaN;
  const start = new Date(from), end = new Date(to);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || start.toISOString().slice(0, 10) !== from ||
      end.toISOString().slice(0, 10) !== to) return NaN;
  return (+end - +start) / 86400000;
}

export function acquisitions(features: { id: string; properties: { datetime: string; 'eo:cloud_cover'?: number } }[], clouds: number) {
  const exact = new Map<string, { date: string; time: string; sceneCloud: number; scene: string }>();
  for (const item of features) {
    const time = item.properties?.datetime;
    const cloud = item.properties?.['eo:cloud_cover'];
    if (typeof cloud !== 'number' || cloud > clouds || typeof time !== 'string' || !Number.isFinite(Date.parse(time))) continue;
    const key = new Date(time).toISOString();
    const previous = exact.get(key);
    if (!previous || cloud < previous.sceneCloud) exact.set(key, { date: key.slice(0, 10), time: key, sceneCloud: cloud, scene: item.id });
  }
  return [...exact.values()].sort((a, b) => b.time.localeCompare(a.time));
}

type Grid = { bbox: [number, number, number, number]; width: number; height: number };
type ProjectedShape = { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };

// Count 10 m pixel centres inside the requested polygon, including interior holes.
export function countFieldPixels(shape: ProjectedShape, grid: Grid) {
  const polygons = shape.type === 'Polygon' ? [shape.coordinates as number[][][]] : shape.coordinates as number[][][][];
  const [west, , , north] = grid.bbox;
  const rows = Array.from({ length: grid.height }, () => [] as [number, number][]);
  for (const polygon of polygons) {
    const crossings = Array.from({ length: grid.height }, () => [] as number[]);
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
        if (ay === by) continue;
        const first = Math.max(0, Math.floor((north - Math.max(ay, by)) / 10 - 0.5) + 1);
        const last = Math.min(grid.height - 1, Math.floor((north - Math.min(ay, by)) / 10 - 0.5));
        for (let row = first; row <= last; row++) {
          const y = north - (row + 0.5) * 10;
          crossings[row].push(ax + (bx - ax) * (y - ay) / (by - ay));
        }
      }
    }
    for (let row = 0; row < crossings.length; row++) {
      const line = crossings[row].sort((a, b) => a - b);
      for (let i = 1; i < line.length; i += 2) {
        const start = Math.max(0, Math.ceil((line[i - 1] - west) / 10 - 0.5));
        const end = Math.min(grid.width, Math.ceil((line[i] - west) / 10 - 0.5));
        if (end > start) rows[row].push([start, end]);
      }
    }
  }
  let count = 0;
  for (const spans of rows) {
    let end = 0;
    for (const [left, right] of spans.sort(([a], [b]) => a - b)) {
      count += Math.max(0, right - Math.max(end, left));
      end = Math.max(end, right);
    }
  }
  return count;
}
