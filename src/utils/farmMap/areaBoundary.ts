import type { MultiPolygon, Polygon } from 'geojson';

type Boundary = Polygon | MultiPolygon;

function readPostgisBoundary(hex: string): Boundary {
  if (hex.length % 2 !== 0 || !/^[\da-f]+$/i.test(hex)) throw new Error('Invalid EWKB');
  const buffer = Uint8Array.from(hex.match(/.{2}/g) ?? [], pair => parseInt(pair, 16));
  const view = new DataView(buffer.buffer);
  let offset = 0;

  const read = (nested = false): Boundary => {
    const order = view.getUint8(offset++);
    if (order > 1) throw new Error('Invalid byte order');
    const littleEndian = order === 1;
    const uint = () => {
      const value = view.getUint32(offset, littleEndian);
      offset += 4;
      return value;
    };
    const header = uint();
    const kind = header & 0x1fffffff;
    const dimensionFlag = Math.floor(kind / 1000);
    const dimension = 2 + Number(Boolean(header & 0x80000000) || dimensionFlag === 1 || dimensionFlag === 3) +
      Number(Boolean(header & 0x40000000) || dimensionFlag === 2 || dimensionFlag === 3);
    if ((header & 0x20000000) && uint() !== 4326) throw new Error('Unsupported SRID');
    const count = uint();
    if (count > (buffer.length - offset) / 4) throw new Error('Invalid element count');

    if (kind % 1000 === 3) {
      const coordinates = Array.from({ length: count }, () => {
        const points = uint();
        if (points > (buffer.length - offset) / (dimension * 8)) throw new Error('Invalid point count');
        return Array.from({ length: points }, () => {
          const lng = view.getFloat64(offset, littleEndian);
          const lat = view.getFloat64(offset + 8, littleEndian);
          offset += dimension * 8;
          return [lng, lat];
        });
      });
      return { type: 'Polygon', coordinates };
    }
    if (kind % 1000 === 6 && !nested) {
      const coordinates = Array.from({ length: count }, () => {
        const polygon = read(true);
        if (polygon.type !== 'Polygon') throw new Error('Invalid polygon');
        return polygon.coordinates;
      });
      return { type: 'MultiPolygon', coordinates };
    }
    throw new Error('Unsupported geometry');
  };

  const geometry = read();
  if (offset !== buffer.length) throw new Error('Invalid byte length');
  return geometry;
}

export function parseAreaBoundary(value: unknown): Boundary | null {
  try {
    let geometry = value;
    if (typeof value === 'string') {
      const text = value.trim();
      geometry = text.startsWith('{') ? JSON.parse(text) : readPostgisBoundary(text.replace(/^\\x/i, ''));
    }
    if (!geometry || typeof geometry !== 'object') return null;
    if ('type' in geometry && geometry.type === 'Feature' && 'geometry' in geometry) geometry = geometry.geometry;
    const boundary = geometry as Boundary | null;
    if (!boundary || !Array.isArray(boundary.coordinates)) return null;
    const polygons = boundary.type === 'Polygon' ? [boundary.coordinates] : boundary.type === 'MultiPolygon' ? boundary.coordinates : [];
    const valid = polygons.length > 0 && polygons.every(polygon =>
      Array.isArray(polygon) && polygon.length > 0 && polygon.every(ring =>
        Array.isArray(ring) && ring.length >= 4 && ring.every(point =>
          Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) &&
          Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90
        )
      )
    );
    return valid ? boundary : null;
  } catch {
    return null;
  }
}
