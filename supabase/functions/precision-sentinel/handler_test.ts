import assert from 'node:assert/strict';
import { handleSentinelRequest } from './handler.ts';

Deno.test('Sentinel controls access and sends the field geometry to both processing APIs', async () => {
  const env = {
    SUPABASE_URL: 'https://agrigest-test.supabase.co', SUPABASE_ANON_KEY: 'mock-key',
    CDSE_CLIENT_ID: 'mock-client', CDSE_CLIENT_SECRET: 'mock-secret',
  };
  const previousEnv = Object.keys(env).map(key => [key, Deno.env.get(key)] as const);
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  const previousFetch = globalThis.fetch;
  const area = '00000000-0000-0000-0000-000000000001';
  const time = '2026-11-12T14:00:00.000Z';
  const geometry = { type: 'Polygon', coordinates: [[[-50,-20],[-49.99,-20],[-49.99,-19.99],[-50,-20]]] };
  const projected = { type: 'Polygon', coordinates: [[[200000,7500000],[200030,7500000],[200030,7500030],[200000,7500000]]] };
  const bounds = { geometry, projected, srid: 32722, width: 3, height: 3, bbox: [200000,7500000,200030,7500030],
    corners: [[-50,-19.99],[-49.99,-19.99],[-49.99,-20],[-50,-20]] };
  let downloads = 0;
  let tokenRequests = 0;
  globalThis.fetch = async (target, init) => {
    const url = new URL(target instanceof Request ? target.url : target.toString());
    const raw = init?.body;
    const body = typeof raw === 'string' ? JSON.parse(raw) : {};
    switch (url.pathname) {
      case '/auth/v1/user': return Response.json({ id: 'test-user', aud: 'authenticated' });
      case '/rest/v1/rpc/precision_satellite_bounds': return Response.json(body.p_area === area ? bounds : null);
      case '/auth/realms/CDSE/protocol/openid-connect/token':
        tokenRequests++;
        assert.equal((raw as URLSearchParams).get('client_secret'), 'mock-secret');
        return Response.json({ access_token: 'sentinel-token', expires_in: 1000 });
      case '/catalog/v1/search': {
        assert.deepEqual(body.intersects, geometry);
        const filtered = body.filter === 'eo:cloud_cover <= 0';
        return Response.json({ features: filtered ? [] : [
          { id: 'granule', properties: { datetime: time, 'eo:cloud_cover': 12 } },
          { id: 'cloudy', properties: { datetime: time, 'eo:cloud_cover': 70 } },
        ] });
      }
      case '/statistics/v1':
        assert.deepEqual(body.input.bounds.geometry, projected);
        assert.equal(body.aggregation.resx, 10);
        assert.equal(body.aggregation.resy, 10);
        assert.ok(body.aggregation.evalscript.includes('"B03"'));
        assert.equal(body.input.data[0].dataFilter.timeRange.from, '2026-11-12T13:59:59.000Z');
        return Response.json({ data: [{ outputs: {
          index: { bands: { B0: { stats: { sampleCount: 9, noDataCount: 4, min: 0.12, max: 0.71, mean: 0.5, stDev: 0.1 } } } },
          cloud: { bands: { B0: { stats: { sampleCount: 9, noDataCount: 2, mean: 2 / 7 } } } },
        } }] });
      case '/process/v1':
        downloads++;
        assert.deepEqual(body.input.bounds.geometry, projected);
        assert.equal(body.output.width, 3);
        assert.equal(body.output.height, 3);
        return new Response(new Uint8Array([137,80,78,71]), { headers: { 'content-type': 'image/png' } });
      default: throw new Error('Unexpected URL in test: ' + url.pathname);
    }
  };
  const call = (body: object, authorized = true) => handleSentinelRequest(new Request('http://localhost/precision-sentinel', {
    method: 'POST', headers: authorized ? { authorization: 'Bearer mock-session' } : {}, body: JSON.stringify(body),
  }));
  try {
    const listing = { action: 'catalog', area, from: '2026-11-10', to: '2026-11-15', clouds: 20 };
    assert.equal((await call(listing, false)).status, 401);
    assert.equal((await call({ ...listing, area: '00000000-0000-0000-0000-000000000002' })).status, 404);
    assert.equal(tokenRequests, 0);
    assert.deepEqual((await (await call({ ...listing, clouds: 0 })).json()).dates, []);
    const catalog = await call(listing);
    assert.equal(catalog.status, 200);
    assert.equal((await catalog.json()).dates.length, 1);
    const inspection = { action: 'inspect', area, index: 'GNDVI', time, clouds: 20 };
    const result = await call(inspection);
    assert.equal(result.status, 200);
    const first = await result.json();
    assert.equal(first.statistics.mean, 0.5);
    assert.equal(first.valid, 5);
    assert.equal(first.covered, 7);
    assert.deepEqual(first.imagery.corners, bounds.corners);
    assert.deepEqual(await (await call(inspection)).json(), first);
    assert.equal(tokenRequests, 1);
    assert.equal(downloads, 1);
  } finally {
    globalThis.fetch = previousFetch;
    for (const [key, value] of previousEnv) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
