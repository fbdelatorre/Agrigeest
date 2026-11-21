import test from 'node:test';
import assert from 'node:assert/strict';
import {restrictPublishedPorts} from '../scripts/licensing-docker-loopback.mjs';
test('publicação local exige o projeto e a rede corretos e fixa todas as portas em loopback',()=>{
 const config={HostConfig:{NetworkMode:'agrigest-licensing-loopback',PortBindings:{'5432/tcp':[{HostIp:'0.0.0.0',HostPort:'46322'},{HostIp:'::',HostPort:'46322'}]}}};
 restrictPublishedPorts(config,'supabase_db_agrigest-licensing-local');
 assert.deepEqual(config.HostConfig.PortBindings['5432/tcp'].map(p=>p.HostIp),['127.0.0.1','127.0.0.1']);
 assert.throws(()=>restrictPublishedPorts(config,'unrelated'),/fora do projeto/);
 assert.throws(()=>restrictPublishedPorts({HostConfig:{NetworkMode:'host'}},'supabase_db_agrigest-licensing-local'),/Rede/);
 assert.throws(()=>restrictPublishedPorts({HostConfig:{NetworkMode:'agrigest-licensing-loopback',PublishAllPorts:true}},'supabase_db_agrigest-licensing-local'),/automática/);
 const compat={Image:'public.ecr.aws/supabase/gotrue:v2.198.0',HostConfig:{NetworkMode:'agrigest-compat15-loopback'}};
 assert.equal(restrictPublishedPorts(compat,null,'agrigest-compat15-local'),compat);
 assert.throws(()=>restrictPublishedPorts({...compat,Image:'untrusted/image'},null,'agrigest-compat15-local'),/fora do projeto/);
 assert.throws(()=>restrictPublishedPorts({...compat,HostConfig:{NetworkMode:'agrigest-licensing-loopback'}},null,'agrigest-compat15-local'),/Rede/);
});
