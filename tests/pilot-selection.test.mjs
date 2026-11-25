import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {pilotInstitutionKey,readPilotInstitution,savePilotInstitution} from '../src/features/licensing/pilotSelection.ts';
test('farm preference stays per account and rejects invalid destinations without modifying other local data',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},a=randomUUID(),b=randomUUID(),first=randomUUID(),second=randomUUID();
 values.set('agrigest:v2:'+a+':'+first+':selectedSeasonId','original-season');savePilotInstitution(a,second,storage);
 assert.equal(readPilotInstitution(a,first,storage),second);assert.equal(readPilotInstitution(b,first,storage),first);assert.equal(values.get('agrigest:v2:'+a+':'+first+':selectedSeasonId'),'original-season');
 assert.throws(()=>savePilotInstitution(a,'https://example.com',storage));assert.throws(()=>pilotInstitutionKey(''));values.set(pilotInstitutionKey(a),'bad-id');assert.equal(readPilotInstitution(a,first,storage),first);
 assert.equal(readPilotInstitution(a,first,{getItem:()=>{throw Error('unavailable');}}),first);
});
