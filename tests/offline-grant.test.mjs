import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync,createHash,sign} from 'node:crypto';
import {verifyOfflineGrant} from '../src/features/licensing/offlineGrant.ts';
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=pair.publicKey.export({format:'jwk'}),key={kid:'test-key',jwk},secret='a'.repeat(64),expected={user:'user-test',institution:'farm-test',sessionId:'session-test',installation:'install-test',secret},issued=1800000000;
const base={version:1,aud:'agrigest-local-pilot-offline',sub:expected.user,institution_id:expected.institution,session_id:expected.sessionId,installation:expected.installation,proof_hash:createHash('sha256').update(secret).digest('hex'),source_license:'license-test',name:'Fictitious farm',license_id:'farm-license',role:'field_monitor',permissions:{monitoring:{read:true,write:true},rainfall:{read:true,write:true},recommendations:{read:false,write:false}},issued_at:issued,expires_at:issued+7*86400};
function token(payload=base){const encoded=Buffer.from(JSON.stringify(payload)).toString('base64url');return {kid:key.kid,payload:encoded,signature:sign('sha256',Buffer.from(encoded),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};}
test('signed grant is bound to user, farm, session, installation and local proof',async()=>{
 assert.equal((await verifyOfflineGrant(token(),key,expected,issued*1000+1000)).active,true);
 for(const field of ['user','institution','sessionId','installation','secret'])await assert.rejects(verifyOfflineGrant(token(),key,{...expected,[field]:'foreign'},issued*1000+1000),/SCOPE_MISMATCH/);
 const modified={...token(),payload:Buffer.from(JSON.stringify({...base,role:'owner'})).toString('base64url')};await assert.rejects(verifyOfflineGrant(modified,key,expected,issued*1000+1000),/SIGNATURE_REQUIRED/);
 await assert.rejects(verifyOfflineGrant({...token(),kid:'other-key'},key,expected,issued*1000+1000),/SIGNATURE_REQUIRED/);
});
test('seven-day maximum, expiry and clock rollback never grant new writes',async()=>{
 assert.equal((await verifyOfflineGrant(token(),key,expected,base.expires_at*1000)).active,false);
 assert.equal((await verifyOfflineGrant(token(),key,expected,base.expires_at*1000)).reason,'expired');
 assert.equal((await verifyOfflineGrant(token(),key,expected,(issued-600)*1000)).reason,'clock');
 assert.equal((await verifyOfflineGrant(token(),key,expected,(issued+600)*1000,(issued+1200)*1000)).reason,'clock');
 await assert.rejects(verifyOfflineGrant(token({...base,expires_at:base.expires_at+1}),key,expected,issued*1000),/SCOPE_MISMATCH/);
 assert.equal((await verifyOfflineGrant(token({...base,expires_at:issued+3600}),key,expected,(issued+3601)*1000)).active,false);
});
