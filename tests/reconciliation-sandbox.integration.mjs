// Opt-in. Assinatura PIX fictícia no Sandbox, vinculada pela referência criada
// no servidor. Webhooks são entregues localmente pelo harness, não pela Internet.
import assert from 'node:assert/strict';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {parseEnv} from 'node:util';import {randomUUID,randomBytes,randomInt} from 'node:crypto';import {spawnSync} from 'node:child_process';import {join,dirname,delimiter,resolve} from 'node:path';import {createClient} from '@supabase/supabase-js';
assert.equal(process.argv[2],'--sandbox-local-only');
const settings=parseEnv(await readFile('licensing-server-local/supabase/functions/.env.local','utf8'));
assert.equal(settings.ASAAS_ENV,'sandbox');assert.equal(settings.ASAAS_ENABLE_PRODUCTION,'false');assert.ok(settings.ASAAS_RECONCILE_TOKEN);
const docker=join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');const env={...process.env};const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')??'PATH';env[pathKey]=dirname(docker)+delimiter+(env[pathKey]??'');
const status=spawnSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir',resolve('licensing-server-local'),'--output','json'],{env,encoding:'utf8',windowsHide:true});assert.equal(status.status,0);const cfg=JSON.parse(status.stdout);assert.equal(cfg.API_URL,'http://127.0.0.1:46321');
const make=key=>createClient(cfg.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>{assert.equal(new URL(url).origin,cfg.API_URL);return fetch(url,{...options,redirect:'error'});}}});
const server=make(cfg.SERVICE_ROLE_KEY),ownerClient=make(cfg.ANON_KEY);const ok=r=>{assert.equal(r.error,null,r.error?.message);return r.data;};
const email='payment-test-'+randomUUID()+'@example.test',password=randomBytes(24).toString('base64url');const owner=ok(await server.auth.admin.createUser({email,password,email_confirm:true})).user;const session=ok(await ownerClient.auth.signInWithPassword({email,password})).session;
const license=ok(await server.schema('licensing').from('licenses').insert({owner_id:owner.id,label:'Teste conciliação Sandbox',kind:'farm',period:'monthly',amount_minor:1000,test_mode:true}).select('id').single()).id;
const requestId=randomUUID();const report={startedAt:new Date().toISOString(),productionTouched:false,environment:'sandbox',license,requestId,webhookDelivery:'local test harness',cardSubmitted:false};
const folder='checks.local/licensing-local';await mkdir(join(folder,'reconciliation-history'),{recursive:true});const save=async()=>{const text=JSON.stringify(report,null,2)+'\n';await writeFile(join(folder,'reconciliation-history',requestId+'.json'),text);await writeFile(join(folder,'reconciliation-sandbox-result.json'),text);};await save();
async function provider(method,path,body){
 const r=await fetch('https://api-sandbox.asaas.com/v3'+path,{method,headers:{access_token:settings.ASAAS_API_KEY,'User-Agent':'AgriGest-Sandbox-Test/1.0','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('Sandbox '+method+' '+path.split('/').slice(0,2).join('/')+' HTTP '+r.status);const text=await r.text();return text?JSON.parse(text):null;
}
function cpf(){const digits=Array.from({length:9},()=>randomInt(10));for(const length of [9,10]){const sum=digits.reduce((s,d,i)=>s+d*(length+1-i),0);const rest=(sum*10)%11;digits.push(rest===10?0:rest);}return digits.join('');}
async function localFunction(name,body,headers={}){const r=await fetch(cfg.API_URL+'/functions/v1/'+name,{method:'POST',headers:{'Content-Type':'application/json','x-agrigest-expected-environment':'sandbox',...headers},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});return {status:r.status,data:await r.json()};}
async function worker(event){return localFunction('asaas-reconcile',{event_id:event},{'x-agrigest-worker-token':settings.ASAAS_RECONCILE_TOKEN});}
const licenseRow=async()=>ok(await server.schema('licensing').from('licenses').select('status,valid_until,billing_revision').eq('id',license).single());
const ledger=async()=>ok(await server.schema('licensing').from('provider_payments').select('*').eq('license_id',license));
async function send(eventType,paymentId){const id='evt_local_'+randomUUID().replaceAll('-','');const body={id,event:eventType,payment:{id:paymentId,status:'RECEIVED',value:999999,subscription:'sub_FORGED_HINT'}};const r=await localFunction('asaas-webhook',body,{'asaas-access-token':settings.ASAAS_WEBHOOK_TOKEN});assert.equal(r.status,200);return {id,body};}
async function waitLedger(paymentId,eligible,event){for(let i=0;i<30;i++){const record=(await ledger()).find(p=>p.payment_id===paymentId);if(record&&record.eligible===eligible)return record;await worker(event);await new Promise(r=>setTimeout(r,300));}throw Error('Conciliação não concluiu no prazo; consulte o relatório e a fila local.');}
let checkout,subscription;
try{
 const access=await localFunction('asaas-reconcile',{}, {apikey:cfg.ANON_KEY,Authorization:'Bearer '+session.access_token});assert.equal(access.status,403,'Proprietário comum não pode executar o processador');
 const created=await localFunction('asaas-checkout',{license_id:license,request_id:requestId},{apikey:cfg.ANON_KEY,Authorization:'Bearer '+session.access_token});assert.equal(created.status,200);checkout=new URL(created.data.url).searchParams.get('id');assert.match(checkout,/^[a-zA-Z0-9_-]+$/);report.checkout=checkout;await save();
 const customer=await provider('POST','/customers',{name:'TESTE AUTOMATICO AGRIGEST',cpfCnpj:cpf(),notificationDisabled:true});report.customerId=customer.id;await save();
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 subscription=await provider('POST','/subscriptions',{customer:customer.id,billingType:'PIX',value:10,nextDueDate:today,cycle:'MONTHLY',externalReference:license+':'+requestId,description:'TESTE SEM VALOR REAL'});assert.match(subscription.id,/^[a-zA-Z0-9_-]+$/);report.subscription=subscription.id;await save();
 const listed=await provider('GET','/subscriptions/'+subscription.id+'/payments');const payment=listed.data.find(p=>p.subscription===subscription.id);assert.ok(payment);report.payment=payment.id;await save();
 const pending=await send('PAYMENT_RECEIVED',payment.id);const before=await waitLedger(payment.id,false,pending.id);assert.equal(before.eligible,false);assert.equal((await licenseRow()).status,'pending');report.forgedWebhookDidNotActivate=true;await save();
 await provider('POST','/sandbox/payment/'+payment.id+'/confirm');
 const paid=await send('PAYMENT_CONFIRMED',payment.id);const received=await waitLedger(payment.id,true,paid.id);assert.ok(received.eligible);const active=await licenseRow();assert.equal(active.status,'active');assert.ok(new Date(active.valid_until)>new Date());report.activatedFromCanonicalPayment=true;report.validUntil=active.valid_until;await save();
 const duplicate=await localFunction('asaas-webhook',paid.body,{'asaas-access-token':settings.ASAAS_WEBHOOK_TOKEN});assert.equal(duplicate.status,200);await worker(paid.id);
 const repeat=await send('PAYMENT_RECEIVED',payment.id);await worker(repeat.id);await new Promise(r=>setTimeout(r,300));const after=await licenseRow();assert.equal(after.valid_until,active.valid_until);assert.equal(after.billing_revision,active.billing_revision);assert.equal((await ledger()).length,1);report.duplicateDidNotRenew=true;await save();
 ok(await ownerClient.schema('licensing').rpc('owner_license_action',{p_id:license,p_action:'cancel',p_request:randomUUID()}));const cancelled=await send('PAYMENT_RECEIVED',payment.id);await worker(cancelled.id);await new Promise(r=>setTimeout(r,300));assert.equal((await licenseRow()).status,'cancelled');report.lateEventPreservedOwnerCancellation=true;await save();
 report.passed=true;report.completedAt=new Date().toISOString();await save();
}finally{
 if(subscription?.id){await provider('DELETE','/subscriptions/'+subscription.id);report.testSubscriptionCancelled=true;}
 if(checkout){try{await provider('POST','/checkouts/'+checkout+'/cancel');report.testCheckoutCancelled=true;}catch{report.testCheckoutCleanupRequiresReview=true;}}
 await save();
}
console.log('PASS: pagamento PIX simulado na API real Sandbox ativou a licença de teste via conferência canônica; payload forjado, duplicatas e evento posterior ao cancelamento não liberaram acesso indevido. Assinatura de teste cancelada, sem cartão ou dinheiro real.');
