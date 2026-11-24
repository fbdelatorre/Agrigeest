// Opt-in: somente Auth/API locais. Não chama Asaas nem modifica registros operacionais.
import assert from 'node:assert/strict';import {randomUUID,randomBytes} from 'node:crypto';import {spawnSync} from 'node:child_process';import {join,dirname,delimiter,resolve} from 'node:path';import {writeFile,mkdir} from 'node:fs/promises';import {createClient} from '@supabase/supabase-js';
assert.equal(process.argv[2],'--local-only');
const docker=join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),env={...process.env};const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')??'PATH';env[pathKey]=dirname(docker)+delimiter+(env[pathKey]??'');
const status=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir',resolve('licensing-server-local'),'--output','json'],{env,encoding:'utf8',windowsHide:true});assert.equal(status.status,0,'Servidor local indisponível');const cfg=JSON.parse(status.stdout);assert.equal(cfg.API_URL,'http://127.0.0.1:46321');
const make=key=>createClient(cfg.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>{assert.equal(new URL(url).origin,cfg.API_URL);return fetch(url,{...options,redirect:'error'});}}});
const server=make(cfg.SERVICE_ROLE_KEY),ok=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};const password=randomBytes(24).toString('base64url'),email='devices-test-'+randomUUID()+'@example.test';
const owner=ok(await server.auth.admin.createUser({email,password,email_confirm:true})).user;
const license=ok(await server.schema('licensing').from('licenses').insert({owner_id:owner.id,label:'TESTE LOCAL CONCORRENCIA DE APARELHOS',kind:'farm',period:'monthly',status:'active',complimentary:true,test_mode:true}).select('id').single()).id;
const sessions=[];const rpc=(client,fn,args={})=>client.schema('licensing').rpc(fn,{p_license:license,...args});let report;
try{
 for(let n=0;n<9;n++){const client=make(cfg.ANON_KEY);ok(await client.auth.signInWithPassword({email,password}));sessions.push({client,installation:randomUUID(),secret:randomBytes(32).toString('hex')});}
 const results=await Promise.all(sessions.map((s,n)=>rpc(s.client,'register_device',{p_installation:s.installation,p_secret:s.secret,p_label:'Instalação concorrente '+n})));
 const winners=sessions.filter((_,n)=>!results[n].error),losers=sessions.filter((_,n)=>results[n].error);
 assert.equal(winners.length,6);assert.equal(losers.length,3);assert.ok(results.filter(r=>r.error).every(r=>r.error.message==='DEVICE_LIMIT_REACHED'));
 const summary=ok(await rpc(winners[0].client,'owner_devices'));assert.equal(summary.used,6);assert.equal(summary.limit,6);
 for(const s of winners)assert.equal(ok(await rpc(s.client,'device_access',{p_installation:s.installation,p_secret:s.secret})),true);
 const first=sessions.indexOf(winners[0]),deviceId=results[first].data;ok(await rpc(winners[0].client,'revoke_device',{p_device:deviceId}));assert.equal(ok(await rpc(winners[0].client,'device_access',{p_installation:winners[0].installation,p_secret:winners[0].secret})),false);
 const next=losers[0];ok(await rpc(next.client,'register_device',{p_installation:next.installation,p_secret:next.secret,p_label:'Vaga liberada'}));const after=ok(await rpc(next.client,'owner_devices'));assert.equal(after.used,6);assert.equal(after.devices.length,7);
 const token=ok(await winners[0].client.auth.getSession()).session.access_token;ok(await winners[0].client.auth.signOut({scope:'local'}));
 const stale=await fetch(cfg.API_URL+'/rest/v1/rpc/owner_devices',{method:'POST',headers:{apikey:cfg.ANON_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json','Content-Profile':'licensing'},body:JSON.stringify({p_license:license})});assert.equal(stale.status,403);assert.equal((await stale.json()).message,'DEVICE_SESSION_REQUIRED');
 report={passed:true,realAuth:true,realSessionIds:true,concurrentAttempts:9,approved:6,blocked:3,revocationFreedSlot:true,revocationPreservedHistory:true,loggedOutTokenRejected:true,createdCharge:false,productionTouched:false};
}finally{
 if(sessions[0]){const cleanup=make(cfg.ANON_KEY);ok(await cleanup.auth.signInWithPassword({email,password}));const summary=ok(await rpc(cleanup,'owner_devices'));for(const d of summary.devices.filter(d=>!d.revoked_at))ok(await rpc(cleanup,'revoke_device',{p_device:d.id}));ok(await cleanup.schema('licensing').rpc('owner_license_action',{p_id:license,p_action:'cancel',p_request:randomUUID()}));await cleanup.auth.signOut({scope:'local'});}
 for(const s of sessions)await s.client.auth.signOut({scope:'local'});
}
await mkdir('checks.local/licensing-local',{recursive:true});await writeFile('checks.local/licensing-local/devices-concurrency-result.json',JSON.stringify(report,null,2)+'\n');console.log(report);
