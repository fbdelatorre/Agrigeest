import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMonitoringDates, latestMonitoringByArea, patchMonitoringMetadata } from '../src/utils/monitoringStages.ts';

test('growth stage follows observation date within the selected season, including backdated edits and deletion', () => {
  const first = { id:'1',area_id:'A',season_id:'current',observed_on:'2026-11-01',created_at:'2026-11-19T12:00:00Z',phenological_stage:'V2' };
  const second = { ...first,id:'2',observed_on:'2026-11-15',created_at:'2026-11-15T12:00:00Z',phenological_stage:'R1' };
  const previous = { ...first,id:'3',season_id:'past',observed_on:'2027-01-01',phenological_stage:'R9' };
  const rows = [first,second,previous];
  assert.equal(latestMonitoringByArea(rows,'current').get('A').phenological_stage,'R1');
  assert.equal(latestMonitoringByArea(rows,'new').size,0);
  assert.deepEqual([...rows].sort(compareMonitoringDates).map(row => row.id),['3','2','1']);
  assert.deepEqual([...rows].sort((a,b) => compareMonitoringDates(a,b,true)).map(row => row.id),['1','2','3']);
  const backdated = patchMonitoringMetadata(rows,'2',{observed_on:'2026-10-01',phenological_stage:'V1',report:'Do not duplicate the full report in metadata'});
  assert.equal(latestMonitoringByArea(backdated,'current').get('A').phenological_stage,'V2');
  assert.equal('report' in backdated.find(row => row.id==='2'),false);
  assert.equal(latestMonitoringByArea(patchMonitoringMetadata(rows,'2'),'current').get('A').phenological_stage,'V2');
  assert.equal(latestMonitoringByArea(patchMonitoringMetadata(patchMonitoringMetadata(rows,'2'),'1'),'current').size,0);
});
