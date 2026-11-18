import { createClient } from 'npm:@supabase/supabase-js@2.75.0';
import { acquisitions, daysBetween, evalscript, type VegetationIndex } from './processing.ts';

const endpoint = 'https://sh.dataspace.copernicus.eu';
const oauth = 'https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token';
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const cache = new Map<string, { body: string; expires: number }>();
const limits = new Map<string, { count: number; expires: number }>();
let token: { value: string; expires: number } | undefined;
let refreshing: Promise<string> | undefined;

class ServiceError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function accessToken() {
  if (token && token.expires > Date.now()) return token.value;
  const clientId = Deno.env.get('CDSE_CLIENT_ID');
  const clientSecret = Deno.env.get('CDSE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new ServiceError(503, 'Configure as credenciais do Copernicus no servidor para consultar o Sentinel‑2.');
  if (!refreshing) refreshing = (async () => {
    const response = await fetch(oauth, { method: 'POST', signal: AbortSignal.timeout(15000),
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }) });
    if (!response.ok) throw new ServiceError(response.status === 429 ? 429 : 502, 'O Copernicus recusou a autenticação.');
    const data = await response.json();
    if (typeof data.access_token !== 'string') throw new ServiceError(502, 'O Copernicus retornou uma autenticação inválida.');
    token = { value: data.access_token, expires: Date.now() + Math.max(0, (Number(data.expires_in) - 60) * 1000) };
    return token.value;
  })().finally(() => { refreshing = undefined; });
  return refreshing;
}

async function copernicus(path: string, body: unknown, accept = 'application/json') {
  const response = await fetch(endpoint + path, {
    method: 'POST', signal: AbortSignal.timeout(35000),
    headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json', Accept: accept },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new ServiceError(response.status === 429 ? 429 : 502, response.status === 429
    ? 'Limite de consultas do Copernicus atingido. Tente novamente mais tarde.'
    : 'O Copernicus não conseguiu processar o talhão e período informados.');
  return response;
}

async function catalog(geometry: object, from: string, to: string, clouds: number) {
  const result = await copernicus('/catalog/v1/search', {
    collections: ['sentinel-2-l2a'], intersects: geometry, limit: 100,
    datetime: from + 'T00:00:00Z/' + to + 'T23:59:59Z',
    filter: 'eo:cloud_cover <= ' + clouds, 'filter-lang': 'cql2-text',
  });
  const raw = await result.json();
  return { dates: acquisitions(raw.features ?? [], clouds), limited: Boolean(raw.context?.next) };
}

function pngData(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return 'data:image/png;base64,' + btoa(binary);
}

async function inspect(bounds: Record<string, unknown>, time: string, clouds: number, index: VegetationIndex) {
  const day = time.slice(0, 10);
  const acquisitionsOnDay = await catalog(bounds.geometry as object, day, day, clouds);
  const scene = acquisitionsOnDay.dates.find(date => date.time === time);
  if (!scene) throw new ServiceError(404, 'Aquisição indisponível para este talhão e filtro.');
  const width = Number(bounds.width), height = Number(bounds.height);
  if (width < 1 || height < 1 || width > 2500 || height > 2500 || width * height > 600000)
    throw new ServiceError(422, 'O talhão ultrapassa o limite de processamento de uma imagem de 10 m.');
  const acquired = new Date(time).valueOf();
  const timeRange = { from: new Date(acquired - 1000).toISOString(), to: new Date(acquired + 1000).toISOString() };
  const input = {
    bounds: { geometry: bounds.projected, bbox: bounds.bbox, properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/' + bounds.srid } },
    data: [{ type: 'sentinel-2-l2a', dataFilter: { timeRange, maxCloudCoverage: clouds },
      processing: { upsampling: 'NEAREST', downsampling: 'NEAREST' } }],
  };
  const stats = await (await copernicus('/statistics/v1', { input, aggregation: {
    timeRange, aggregationInterval: { of: 'P1D', lastIntervalBehavior: 'SHORTEN' }, resx: 10, resy: 10, evalscript: evalscript(index, false),
  }, calculations: { index: { histograms: { default: { nBins: 10, lowEdge: -1, highEdge: 1 } } } } })).json();
  const output = stats.data?.[0]?.outputs;
  const measurements = output?.index?.bands?.B0;
  const cloud = output?.cloud?.bands?.B0?.stats;
  const summary = measurements?.stats;
  const valid = Math.max(0, (summary?.sampleCount ?? 0) - (summary?.noDataCount ?? 0));
  const covered = Math.max(0, (cloud?.sampleCount ?? 0) - (cloud?.noDataCount ?? 0));
  if (covered && !Number.isFinite(cloud.mean)) throw new ServiceError(502, 'O Copernicus retornou estatísticas incompletas.');
  const image = valid ? await copernicus('/process/v1', { input, output: { width, height,
    responses: [{ identifier: 'default', format: { type: 'image/png' } }] }, evalscript: evalscript(index, true) }, 'image/png') : null;
  return {
    scene, index, resolution: 10, valid, covered, cloudPercent: covered ? cloud.mean * 100 : null,
    statistics: valid ? { mean: summary.mean, min: summary.min, max: summary.max, deviation: summary.stDev, histogram: measurements.histogram?.bins ?? [] } : null,
    imagery: image ? { url: pngData(await image.arrayBuffer()), corners: bounds.corners } : null,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function handleSentinelRequest(request: Request) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Método inválido.' }, 405);
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'Faça login.' }, 401);
  try {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await client.auth.getUser(authorization.slice(7));
    if (!user || authError) throw new ServiceError(401, 'Faça login novamente.');
    const raw = await request.text();
    if (raw.length > 2000) throw new ServiceError(413, 'Consulta excede o limite.');
    const body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || typeof body.area !== 'string' ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.area) ||
      !['catalog', 'inspect'].includes(body.action) || !Number.isInteger(body.clouds) || body.clouds < 0 || body.clouds > 100)
      throw new ServiceError(400, 'Confira o talhão e o limite de nuvens.');
    const { data: bounds, error } = await client.rpc('precision_satellite_bounds', { p_area: body.area });
    if (error) throw new ServiceError(502, 'Não foi possível recuperar o limite do talhão.');
    if (!bounds) throw new ServiceError(404, 'Talhão sem limite disponível.');
    if (body.action === 'inspect' && (!['NDVI', 'GNDVI'].includes(body.index) || typeof body.time !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.time) || !Number.isFinite(Date.parse(body.time))))
      throw new ServiceError(400, 'Confira a aquisição e o índice.');
    if (body.action === 'catalog' && (typeof body.from !== 'string' || typeof body.to !== 'string' ||
        !(daysBetween(body.from, body.to) >= 0 && daysBetween(body.from, body.to) <= 90)))
      throw new ServiceError(400, 'Selecione um intervalo de até 90 dias.');
    const geometryBytes = new TextEncoder().encode(JSON.stringify(bounds.geometry));
    const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', geometryBytes))).join(',');
    const key = JSON.stringify([body.area, fingerprint, body.action, body.clouds, body.from, body.to, body.time, body.index]);
    const saved = cache.get(key);
    if (saved && saved.expires > Date.now()) return new Response(saved.body, { headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });
    const now = Date.now();
    for (const [id, rate] of limits) if (rate.expires <= now) limits.delete(id);
    const rate = limits.get(user.id) ?? { count: 0, expires: now + 60000 };
    if (++rate.count > 12) throw new ServiceError(429, 'Aguarde um minuto antes de fazer nova consulta.');
    limits.set(user.id, rate);
    const result = body.action === 'catalog' ? await catalog(bounds.geometry, body.from, body.to, body.clouds)
      : await inspect(bounds, body.time, body.clouds, body.index);
    const outcome = JSON.stringify(result);
    if (cache.size >= 12) cache.delete(cache.keys().next().value!);
    cache.set(key, { body: outcome, expires: now + (body.action === 'catalog' ? 300000 : 1800000) });
    return new Response(outcome, { headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof ServiceError) return json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return json({ error: 'Consulta inválida.' }, 400);
    return json({ error: 'Não foi possível concluir a consulta de satélite. Tente novamente.' }, 502);
  }
}
