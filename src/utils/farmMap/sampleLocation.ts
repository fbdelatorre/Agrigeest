import type { Polygon, MultiPolygon, Position } from 'geojson';

export type SamplePoint = [longitude: number, latitude: number];
export type SampleBoundary = { id: string; geometry: Polygon | MultiPolygon };

function testRing(point: SamplePoint, ring: Position[]) {
  const [x, y] = point;
  const metresPerLongitude = 111320 * Math.cos(y * Math.PI / 180);
  let inside = false;
  let distance = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, ay] = ring[j];
    const [bx, by] = ring[i];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    const dx = (bx - ax) * metresPerLongitude;
    const dy = (by - ay) * 111132;
    const px = (x - ax) * metresPerLongitude;
    const py = (y - ay) * 111132;
    const length = dx * dx + dy * dy;
    const fraction = length ? Math.max(0, Math.min(1, (px * dx + py * dy) / length)) : 0;
    distance = Math.min(distance, Math.hypot(px - fraction * dx, py - fraction * dy));
  }
  return { inside, distance };
}

export function locateSample(point: SamplePoint, boundaries: SampleBoundary[], accuracy: number | null) {
  const matches: string[] = [];
  let closest = Infinity;
  for (const { id, geometry } of boundaries) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    let matched = false;
    for (const [outer, ...holes] of polygons) {
      const outline = testRing(point, outer);
      const interiors = holes.map(ring => testRing(point, ring));
      const distance = Math.min(outline.distance, ...interiors.map(ring => ring.distance));
      closest = Math.min(closest, distance);
      matched ||= distance < 0.01 || (outline.inside && !interiors.some(ring => ring.inside));
    }
    if (matched) matches.push(id);
  }
  return { matches, uncertain: matches.length !== 1 || closest < 0.01 || (accuracy !== null && (accuracy > 25 || closest <= accuracy)) };
}
