// Opt-in: cria e cancela um checkout fictício no Sandbox. Nunca envia cartão.
import assert from 'node:assert/strict';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {parseEnv} from 'node:util';import {spawnSync} from 'node:child_process';import {randomUUID,randomBytes} from 'node:crypto';import {join,dirname,delimiter,resolve} from 'node:path';
import {createClient} from '@supabase/supabase-js';import {createAsaasClient} from '../licensing-server-local/supabase/functions/_shared/asaas.mjs';
assert.equal(process.argv[2],'--sandbox-local-only');
const settings=parseEnv(await readFile('licensing-server-local/supabase/functions/.env.local','utf8'));
assert.equal(settings.ASAAS_ENV,'sandbox');assert.equal(settings.ASAAS_ENABLE_PRODUCTION,'false');assert.ok(settings.ASAAS_API_KEY);
const docker=join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
const env={...process.env};const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')??'PATH';env[pathKey]=dirname(docker)+delimiter+(env[pathKey]??'');
const status=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir',resolve('licensing-server-local'),'--output','json'],{env,encoding:'utf8',windowsHide:true});assert.equal(status.status,0);
const cfg=JSON.parse(status.stdout);assert.equal(cfg.API_URL,'http://127.0.0.1:46321');
const localFetch=(url,options)=>{assert.equal(new URL(url).origin,cfg.API_URL);return fetch(url,{...options,redirect:'error'});};
const make=key=>createClient(cfg.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:localFetch}});
const server=make(cfg.SERVICE_ROLE_KEY),password=randomBytes(24).toString('base64url'),stamp=randomUUID().replaceAll('-','');
const ok=result=>{assert.equal(result.error,null,result.error?.message);return result.data;};
async function user(label){const email=`sandbox-${label}-${stamp}@example.test`;const account=ok(await server.auth.admin.createUser({email,password,email_confirm:true})).user;const app=make(cfg.ANON_KEY);const session=ok(await app.auth.signInWithPassword({email,password})).session;return {id:account.id,token:session.access_token};}
const owner=await user('owner'),other=await user('other');
const license=ok(await server.schema('licensing').from('licenses').insert({owner_id:owner.id,label:'TESTE SANDBOX - sem cobrança real',kind:'farm',period:'monthly',amount_minor:1000}).select('id').single()).id;
const requestId=randomUUID();let providerId;
const folder='checks.local/licensing-local';await mkdir(folder,{recursive:true});
const report={startedAt:new Date().toISOString(),environment:'sandbox',database:'local',license,requestId,productionTouched:false,confirmed:false};
await mkdir(join(folder,'checkout-history'),{recursive:true});
const save=async()=>{const text=JSON.stringify(report,null,2)+'\n';await writeFile(join(folder,'checkout-history',requestId+'.json'),text);await writeFile(join(folder,'checkout-sandbox-result.json'),text);};await save();
const call=(actor,body)=>fetch(cfg.API_URL+'/functions/v1/asaas-checkout',{method:'POST',headers:{apikey:cfg.ANON_KEY,Authorization:'Bearer '+actor.token,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(45000)});
try{
 const body={license_id:license,request_id:requestId};
 assert.equal((await call(other,body)).status,409);
 assert.equal((await call(owner,{...body,amount_minor:1})).status,400);
 const simultaneous=await Promise.all([call(owner,body),call(owner,body)]);
 const payloads=await Promise.all(simultaneous.map(async r=>({status:r.status,body:await r.json()})));
 report.initialResponses=payloads;await save();
 assert.ok(payloads.every(r=>[200,202].includes(r.status)),'Checkout real não retornou pronto/em processamento. Veja o relatório privado.');
 let ready=payloads.find(r=>r.status===200)?.body;
 for(let i=0;i<20&&!ready;i++){await new Promise(resolve=>setTimeout(resolve,300));const response=await call(owner,body);const data=await response.json();if(response.status===200)ready=data;else assert.equal(response.status,202);}
 assert.ok(ready?.url);assert.equal(ready.confirmed,false);assert.equal(new URL(ready.url).origin,'https://sandbox.asaas.com');providerId=new URL(ready.url).searchParams.get('id');assert.match(providerId,/^[a-zA-Z0-9_-]+$/);
 const retry=await call(owner,body);assert.equal(retry.status,200);assert.equal((await retry.json()).url,ready.url);
 const current=ok(await server.schema('licensing').from('licenses').select('status,complimentary').eq('id',license).single());assert.equal(current.status,'pending');assert.equal(current.complimentary,false);
 report.providerId=providerId;report.singleCheckoutReused=true;report.noActivationWithoutPayment=true;await save();
}finally{
 if(providerId){
  const provider=createAsaasClient({environment:'sandbox',apiKey:settings.ASAAS_API_KEY});await provider.cancelCheckout(providerId);
  const result=spawnSync(docker,['exec','-i','supabase_db_agrigest-licensing-local','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:`UPDATE licensing_private.checkout_requests SET state='cancelled',updated_at=now() WHERE id='${requestId}' AND environment='sandbox' AND provider_id='${providerId}';`,encoding:'utf8',windowsHide:true});assert.equal(result.status,0);
  report.sandboxCheckoutCancelled=true;await save();
 }
}
report.passed=true;report.completedAt=new Date().toISOString();await save();
console.log('PASS: Auth real + checkout Asaas Sandbox, preço controlado no banco, outro proprietário bloqueado, chamadas concorrentes/repetidas reutilizaram um checkout e licença permaneceu pendente. Checkout de teste cancelado.');
