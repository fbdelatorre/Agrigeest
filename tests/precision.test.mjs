import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { utils, write } from 'xlsx';
import { locateSample } from '../src/utils/farmMap/sampleLocation.ts';
import { labNumber, parseLabSheet, readLabWorkbook } from '../src/lib/precisionSpreadsheet.ts';
import { acquisitions, calculateIndex, countFieldPixels, daysBetween, evalscript } from '../supabase/functions/precision-sentinel/processing.ts';
import { interpretLabels } from '../supabase/functions/precision-lab-assist/labels.ts';
import { precisionQrId } from '../src/utils/precisionQr.ts';

test('points respect holes, multipart fields, shared boundaries and GPS uncertainty', () => {
  const ring = (x, y, d) => [[x,y],[x+d,y],[x+d,y+d],[x,y+d],[x,y]];
  const field = { id: 'A', geometry: { type: 'MultiPolygon', coordinates: [
    [ring(-50,-20,0.01), ring(-49.996,-19.996,0.002)], [ring(-49.98,-20,0.01)]
  ] } };
  const neighbor = { id: 'B', geometry: { type: 'Polygon', coordinates: [ring(-49.99,-20,0.01)] } };
  assert.deepEqual(locateSample([-49.999,-19.999], [field,neighbor], 3), { matches: ['A'], uncertain: false });
  assert.deepEqual(locateSample([-49.995,-19.995], [field,neighbor], null), { matches: [], uncertain: true });
  assert.deepEqual(locateSample([-49.99,-19.998], [field,neighbor], 12), { matches: ['A','B'], uncertain: true });
  assert.deepEqual(locateSample([-49.99001,-19.998], [field,neighbor], 12), { matches: ['A'], uncertain: true });
  assert.deepEqual(locateSample([-49.979,-19.999], [field,neighbor], 4), { matches: ['A'], uncertain: false });
  assert.deepEqual(locateSample([-51,-20], [field,neighbor], null), { matches: [], uncertain: true });
});

test('lab extraction preserves units, methods, original values and detection limits', async () => {
  const soil = parseLabSheet([['Laudo'], ['Amostra','Fósforo (mg/dm³)','Matéria orgânica [g/kg]'], ['AG-01','2,5','<0,05']], 'Solo');
  assert.equal(soil[0].value, 2.5);
  assert.equal(soil[0].original_value, '2,5');
  assert.equal(soil[0].unit, 'mg/dm³');
  assert.equal(soil[1].value, null);
  assert.equal(soil[1].unit, 'g/kg');
  const leaf = parseLabSheet([['Amostra','Parâmetro','Resultado','Unidade','Método'], ['AG-01','Zinco','4.1','mg/kg','ICP']], 'Foliar');
  assert.deepEqual(leaf[0], { reported_code:'AG-01', parameter:'Zinco', value:4.1, original_value:'4.1',
    unit:'mg/kg', method:'ICP', material:'', source:'Foliar: linha 2' });
  const csv = await readLabWorkbook(new File(['Amostra;Parâmetro;Resultado;Unidade\nAG-01;Zinco;2,4;mg/kg'], 'laudo.csv'));
  assert.equal(csv.rows[0].value, 2.4);
  assert.equal(labNumber('1.234,50'), 1234.5);
  assert.equal(labNumber('1,234.50'), 1234.5);
  assert.equal(labNumber('7.0.01'), null);
  assert.equal(labNumber('3,'), null);
});

test('vegetation uses the correct visible band and masks invalid pixels', () => {
  assert.ok(Math.abs(calculateIndex(0.7, 0.1, 4) - 0.75) < 1e-10);
  assert.ok(Math.abs(calculateIndex(0.7, 0.3, 4) - 0.4) < 1e-10);
  for (const scl of [0,1,3,7,8,9,10,11]) assert.equal(calculateIndex(0.7,0.3,scl),null);
  assert.equal(calculateIndex(0,0,4),null);
  assert.equal(calculateIndex(1,1,4,0),null);
  assert.match(evalscript('NDVI', true), /"B04"/);
  assert.match(evalscript('GNDVI', false), /"B03"/);
  assert.match(evalscript('GNDVI', false), /bands:\["index","cloud"\]/);
  assert.equal(daysBetween('2026-11-08','2026-11-18'),10);
  assert.ok(Number.isNaN(daysBetween('2026-02-30','2026-03-08')));
  assert.deepEqual(acquisitions([{ id:'cloudy',properties:{ datetime:'2026-11-17T15:00:00Z','eo:cloud_cover':80 } }],20),[]);
  assert.equal(acquisitions([{ id:'clear',properties:{ datetime:'2026-11-17T15:00:00Z','eo:cloud_cover':10 } }],20)[0].scene,'clear');
  const ring = (x,y,w,h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
  assert.equal(countFieldPixels({ type:'Polygon', coordinates:[ring(0,0,40,30),ring(0,10,10,10)] },
    { bbox:[0,0,40,30], width:4,height:3 }),11);
});

test('XLS import uses all sheets and limits AI to approved parameters', async () => {
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([['Amostra','P (mg/dm³)'],['SJ-001',2.5]]), 'Solo');
  utils.book_append_sheet(workbook, utils.aoa_to_sheet([['Amostra','Phosphorus (mg/kg)'],['SJ-002',4.1]]), 'Foliar');
  const original = write(workbook, { type:'array', bookType:'biff8' });
  const parsed = await readLabWorkbook(new File([original], 'laudo.xls'));
  assert.equal(parsed.rows.length,2);
  assert.deepEqual(parsed.rows.map(({ parameter,value,unit }) => [parameter,value,unit]),[['Fósforo',2.5,'mg/dm³'],['Fósforo',4.1,'mg/kg']]);
  const output = { suggestions: [{ index:0,parameter:'Fósforo', value:99 }, { index:1,parameter:'Uma invenção' }, { index:5,parameter:'pH' }] };
  assert.deepEqual(interpretLabels(JSON.stringify(output),2),[{ index:0,parameter:'Fósforo' }]);
  const id = '00000000-0000-0000-0000-000000000007';
  assert.equal(precisionQrId('https://agrigest.example/precision?sample=' + id),id);
  assert.equal(precisionQrId('agrigest:amostra:' + id),id);
  assert.equal(precisionQrId('javascript:foo'),null);
});

test('database sync and lab import isolate institutions, preserve the original and prevent duplicates', async () => {
  const db = new PGlite({ extensions: { postgis } });
  try {
    const uuid = num => '00000000-0000-0000-0000-' + String(num).padStart(12, '0');
    const [user1,user2,tenant1,tenant2,area1,area2,season1,season2,sample1,sample2] = Array.from({length:10}, (_,i) => uuid(i+1));
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated, anon;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.user',true),'')::uuid $$;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE institutions(id uuid PRIMARY KEY);
      CREATE TABLE user_profiles(id uuid PRIMARY KEY, institution_id uuid);
      CREATE SCHEMA extensions;
      CREATE EXTENSION postgis WITH SCHEMA extensions;
      GRANT USAGE ON SCHEMA extensions TO authenticated;
      CREATE TABLE areas(id uuid PRIMARY KEY, institution_id uuid, geometry extensions.geometry);
      CREATE TABLE seasons(id uuid PRIMARY KEY, institution_id uuid);
      GRANT SELECT ON user_profiles,areas,seasons TO authenticated;
      INSERT INTO auth.users VALUES ('${user1}'),('${user2}');
      INSERT INTO institutions VALUES ('${tenant1}'),('${tenant2}');
      INSERT INTO user_profiles VALUES ('${user1}','${tenant1}'),('${user2}','${tenant2}');
      INSERT INTO areas VALUES
        ('${area1}','${tenant1}',extensions.ST_MakeEnvelope(-50,-20,-49.99,-19.99,4326)),
        ('${area2}','${tenant2}',extensions.ST_MakeEnvelope(-51,-20,-50.99,-19.99,4326));
      INSERT INTO seasons VALUES ('${season1}','${tenant1}'),('${season2}','${tenant2}');
    `);
    for (const file of ['20261118100000_precision_sampling.sql','20261118100100_precision_lab.sql',
      '20261118100200_precision_satellite_bounds.sql','20261118110000_precision_lab_codes_and_xls.sql',
      '20261118110100_precision_sampling_zones.sql']) {
      await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'));
    }
    await db.exec('SET ROLE authenticated');
    await db.query("SELECT set_config('test.user',$1,false)",[user1]);
    const insert = 'INSERT INTO precision_samples(id,institution_id,area_id,season_id,collected_at,sample_type,longitude,latitude,point_source,sample_mode,subsample_count,responsible,lab_code) VALUES ($1,$2,$3,$4,now(),\'soil\',-49.995,-19.995,\'gps\',\'composite\',5,\'Operador\',\'SJ-001\')';
    await assert.rejects(db.query(insert,[sample1,tenant1,area2,season1]), /row-level security/);
    await assert.rejects(db.query(insert,[sample1,tenant1,area1,season2]), /row-level security/);
    await db.query(insert,[sample1,tenant1,area1,season1]);
    await assert.rejects(db.query(insert,[sample1,tenant1,area1,season1]), /duplicate key/);
    await assert.rejects(db.query(insert,[sample2,tenant1,area1,season1]), /precision_samples_lab_code_unique/);
    const polygon = (west,south,east,north) => JSON.stringify({ type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]]] });
    const zoneInsert = "INSERT INTO precision_zones(institution_id,area_id,season_id,name,campaign,geometry) VALUES($1,$2,$3,'Z1','C1',$4) RETURNING id";
    await assert.rejects(db.query(zoneInsert,[tenant1,area1,season1,polygon(-50.1,-20,-49.99,-19.99)]), /ZONE_OUTSIDE_FIELD_OR_INVALID/);
    await assert.rejects(db.query(zoneInsert,[tenant1,area1,season2,polygon(-49.998,-19.998,-49.992,-19.992)]), /ZONE_SEASON_MISMATCH/);
    const zone = (await db.query(zoneInsert,[tenant1,area1,season1,polygon(-49.998,-19.998,-49.992,-19.992)])).rows[0].id;
    await db.query('UPDATE precision_samples SET zone_id=$1 WHERE id=$2',[zone,sample1]);
    await assert.rejects(db.query('UPDATE precision_zones SET geometry=$2 WHERE id=$1',[zone,polygon(-49.998,-19.998,-49.997,-19.997)]), /ZONE_WOULD_EXCLUDE_SAMPLE/);
    await db.query('UPDATE precision_zones SET geometry=$2 WHERE id=$1',[zone,polygon(-49.999,-19.999,-49.991,-19.991)]);
    const satellite = (await db.query('SELECT precision_satellite_bounds($1) AS bounds',[area1])).rows[0].bounds;
    assert.equal(satellite.srid,32722);
    assert.equal((satellite.bbox[2] - satellite.bbox[0]) / satellite.width,10);
    assert.equal((await db.query('SELECT precision_satellite_bounds($1) AS bounds',[area2])).rows[0].bounds,null);
    await assert.rejects(db.query('UPDATE precision_samples SET area_id=$1 WHERE id=$2',[area2,sample1]), /permission denied/);
    assert.match((await db.query('SELECT code FROM precision_samples')).rows[0].code,/^AG-[0-9A-F]{32}$/);
    const row = { sample_id:sample1, parameter:'Fósforo', original_parameter:'P', value:2.5, original_value:'2,5', unit:'mg/dm³', method:'Mehlich', source:'Aba 1', reported_code:'SJ-001' };
    const original = Buffer.from('Amostra;Fósforo\nSJ-001;2,5').toString('base64');
    const submit = entries => db.query('SELECT import_precision_lab($1,$2,$3) AS result',['solo.csv',original,JSON.stringify(entries)]);
    await assert.rejects(submit([row,{ ...row,sample_id:sample2 }]), /SAMPLE_NOT_FOUND_OR_FORBIDDEN/);
    assert.equal((await db.query('SELECT id FROM precision_lab_imports')).rows.length,0);
    assert.equal((await submit([row,row])).rows[0].result.saved,1);
    assert.equal((await submit([row])).rows[0].result.saved,0);
    assert.equal((await db.query('SELECT status FROM precision_samples')).rows[0].status,'received');
    assert.equal((await db.query('SELECT original_value FROM precision_lab_results')).rows[0].original_value,'2,5');
    assert.equal((await db.query('SELECT original_parameter FROM precision_lab_results')).rows[0].original_parameter,'P');
    assert.equal((await db.query('SELECT file_base64 FROM precision_lab_imports')).rows[0].file_base64,original);
    const xls = utils.book_new();
    utils.book_append_sheet(xls,utils.aoa_to_sheet([['Amostra','pH'],['SJ-001',6]]),'Solo');
    const binary = Buffer.from(write(xls, { type:'array', bookType:'biff8' })).toString('base64');
    const xlsResponse = await db.query('SELECT import_precision_lab($1,$2,$3) AS result',['solo.xls',binary,JSON.stringify([
      {...row,parameter:'pH',original_parameter:'pH',source:'Solo: linha 2',value:6,original_value:'6',unit:'',method:'CaCl2'},
    ])]);
    assert.equal(xlsResponse.rows[0].result.saved,1);
    await db.query("SELECT set_config('test.user',$1,false)",[user2]);
    assert.deepEqual((await db.query('SELECT * FROM precision_samples')).rows,[]);
    assert.deepEqual((await db.query('SELECT * FROM precision_lab_results')).rows,[]);
    assert.deepEqual((await db.query('SELECT * FROM precision_lab_imports')).rows,[]);
    assert.deepEqual((await db.query('SELECT * FROM precision_zones')).rows,[]);
    await assert.rejects(submit([{ ...row, manually_matched:true }]), /SAMPLE_NOT_FOUND_OR_FORBIDDEN/);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query('SELECT * FROM precision_samples'), /permission denied/);
  } finally { await db.close(); }
});
