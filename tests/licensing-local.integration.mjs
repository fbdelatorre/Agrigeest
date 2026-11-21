// Integração opt-in exclusivamente contra o projeto Docker local. Nunca aceita URL/chaves externas.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash,createHmac,randomBytes,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {join,dirname,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';

const root=fileURLToPath(new URL('..',import.meta.url));
const workdir=join(root,'licensing-server-local');
const project='agrigest-licensing-local';
assert.equal(process.argv[2],'--local-only','Execute com --local-only; este teste cria registros fictícios locais.');
assert.match(await readFile(join(workdir,'supabase/config.toml'),'utf8'),/project_id = "agrigest-licensing-local"/);
await assert.rejects(access(join(workdir,'supabase/.temp/project-ref')),e=>e.code==='ENOENT');
const env={...process.env};
for(const key of Object.keys(env))if(/^(SUPABASE_|VITE_|DATABASE_URL$|PGPASSWORD$|PGHOST$)|TOKEN|SECRET|PASSWORD|API_KEY|^SMTP_/i.test(key))delete env[key];
let docker;
for(const path of [join(process.env.LOCALAPPDATA??'','Programs/DockerDesktop/resources/bin/docker.exe'),join(process.env.PROGRAMFILES??'C:/Program Files','Docker/Docker/resources/bin/docker.exe')]){
 try{await access(path);docker=path;break;}catch{ /* tenta próxima instalação */ }
}
docker??='docker';
const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')??'PATH';
if(docker!=='docker')env[pathKey]=dirname(docker)+delimiter+(env[pathKey]??'');
const run=(file,args,input)=>spawnSync(file,args,{cwd:workdir,env,input,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
const status=run(process.execPath,[join(root,'node_modules/supabase/dist/supabase.js'),'status','--workdir',workdir,'--output','json']);
assert.equal(status.status,0,'Supabase local precisa estar iniciado.');
const config=JSON.parse(status.stdout);
const api=config.API_URL??config.api_url;
assert.equal(api,'http://127.0.0.1:46321');
const anon=config.ANON_KEY??config.anon_key??config.PUBLISHABLE_KEY;
const service=config.SERVICE_ROLE_KEY??config.service_role_key??config.SECRET_KEY;
assert.ok(anon&&service,'Status local deve disponibilizar chaves para o teste, mantidas só em memória.');
const network=run(docker,['network','inspect','agrigest-licensing-loopback']);
assert.equal(network.status,0);
assert.equal(JSON.parse(network.stdout)[0].Options['com.docker.network.bridge.host_binding_ipv4'],'127.0.0.1');
const containers=run(docker,['ps','--filter',`name=${project}`,'--format','{{json .}}']);
assert.equal(containers.status,0);
const names=containers.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line).Names);
assert.ok(names.includes(`supabase_db_${project}`));
for(const name of names){
 const inspected=run(docker,['inspect',name]);assert.equal(inspected.status,0);
 const info=JSON.parse(inspected.stdout)[0];
 for(const bindings of Object.values(info.NetworkSettings.Ports??{}))for(const binding of bindings??[]){
  assert.ok(['127.0.0.1','::1'].includes(binding.HostIp),`Porta de ${name} não está restrita ao computador.`);
 }
}
const sql=text=>{
 const result=run(docker,['exec','-i',`supabase_db_${project}`,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],text);
 assert.equal(result.status,0,'Consulta de preparação local falhou.');return result.stdout.trim();
};
const localFetch=(url,options)=>{assert.equal(new URL(url).origin,api,'Teste recusou requisição externa.');return fetch(url,{...options,redirect:'error'});};
const client=key=>createClient(api,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:localFetch}});
const server=client(service);
const ok=result=>{assert.equal(result.error,null,result.error?.message);return result.data;};
const rpc=async(user,name,args={})=>ok(await user.schema('licensing').rpc(name,args));
const denied=async promise=>assert.ok((await promise).error,'Servidor deveria negar a ação.');
const stamp=randomUUID().replaceAll('-','');
const password=randomBytes(30).toString('base64url');
const users=[];
const checks=[];
async function account(label,confirmed=true){
 const email=`local-${label}-${stamp}@example.test`;
 const user=ok(await server.auth.admin.createUser({email,password,email_confirm:confirmed})).user;
 users.push(user.id);const app=client(anon);
 if(confirmed)ok(await app.auth.signInWithPassword({email,password}));
 return {app,user,email};
}
function totp(secret){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';
 for(const ch of secret.toUpperCase().replaceAll('=','')){const n=alphabet.indexOf(ch);assert.ok(n>=0);bits+=n.toString(2).padStart(5,'0');}
 const key=Buffer.from((bits.match(/.{8}/g)??[]).map(byte=>parseInt(byte,2)));
 const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const h=createHmac('sha1',key).update(counter).digest();const offset=h[19]&15;
 return String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}

try{
 const signupClient=client(anon),signupEmail=`local-email-${stamp}@example.test`;
 const signup=ok(await signupClient.auth.signUp({email:signupEmail,password}));
 assert.equal(signup.session,null,'Cadastro exige confirmação de email.');users.push(signup.user.id);
 let mail;
 for(let attempt=0;attempt<10&&!mail;attempt++){
  const response=await fetch('http://127.0.0.1:46324/api/v1/messages',{redirect:'error'});assert.equal(response.status,200);
  const mailbox=await response.json();mail=mailbox.messages.find(item=>item.To.some(to=>to.Address===signupEmail));
  if(!mail)await new Promise(resolve=>setTimeout(resolve,300));
 }
 assert.ok(mail,'Confirmação precisa chegar à caixa local, sem envio externo.');
 const messageResponse=await fetch('http://127.0.0.1:46324/api/v1/message/'+encodeURIComponent(mail.ID),{redirect:'error'});
 assert.equal(messageResponse.status,200);const message=await messageResponse.json();
 const hash=(message.HTML+' '+message.Text).match(/[?&]token=([^&"\s<>]+)/)?.[1];assert.ok(hash,'Email precisa conter o token de confirmação.');
 ok(await signupClient.auth.verifyOtp({token_hash:decodeURIComponent(hash),type:'signup'}));
 assert.ok(ok(await signupClient.auth.getUser()).user.email_confirmed_at);
 checks.push('Cadastro público exige confirmação; email recebido no Mailpit local e token validado pelo Auth');
 const admin=await account('admin'),owner=await account('owner'),other=await account('other'),unverified=await account('unverified',false);
 // Bootstrap só neste contêiner local. A conta real do proprietário do app não é modificada.
 assert.match(admin.user.id,/^[0-9a-f-]{36}$/);
 sql(`INSERT INTO licensing_private.platform_admins(user_id) VALUES('${admin.user.id}'::uuid);`);
 assert.deepEqual(await rpc(admin.app,'manager_access'),{authorized:true,can_manage:false});
 await denied(admin.app.schema('licensing').rpc('admin_accounts',{p_search:''}));
 const enrolled=ok(await admin.app.auth.mfa.enroll({factorType:'totp',friendlyName:'Teste local '+stamp}));
 ok(await admin.app.auth.mfa.challengeAndVerify({factorId:enrolled.id,code:totp(enrolled.totp.secret)}));
 assert.deepEqual(await rpc(admin.app,'manager_access'),{authorized:true,can_manage:true});
 checks.push('Login real e MFA/TOTP: administrador só gerencia em aal2');
 await denied(unverified.app.auth.signInWithPassword({email:unverified.email,password}));
 await denied(admin.app.schema('licensing').rpc('admin_create_license',{p_owner:unverified.user.id,p_label:'Não confirmado',p_kind:'farm',p_period:'monthly',p_amount:10000,p_extras:0,p_request:randomUUID()}));
 checks.push('Conta sem email confirmado não entra nem recebe licença');
 ok(await other.app.auth.updateUser({data:{is_admin:true,role:'owner'}}));
 assert.equal((await rpc(other.app,'manager_access')).authorized,false);
 await denied(other.app.schema('licensing').rpc('admin_accounts',{p_search:''}));
 checks.push('Metadados enviados pelo cliente não concedem privilégio');
 const args={p_owner:owner.user.id,p_label:'Fazenda teste local '+stamp,p_kind:'farm',p_period:'monthly',p_amount:10000,p_extras:1,p_request:randomUUID()};
 const license=await rpc(admin.app,'admin_create_license',args);
 assert.equal(await rpc(admin.app,'admin_create_license',args),license);
 await denied(admin.app.schema('licensing').rpc('admin_create_license',{...args,p_amount:20000}));
 const rows=async(app,table)=>ok(await app.schema('licensing').from(table).select('*').eq(table==='licenses'?'id':'license_id',license));
 assert.equal((await rows(owner.app,'licenses')).length,1);
 assert.equal((await rows(other.app,'licenses')).length,0);
 await denied(other.app.schema('licensing').from('licenses').update({status:'active'}).eq('id',license));
 await denied(owner.app.schema('licensing').rpc('admin_set_license',{p_id:license,p_action:'grant_free',p_until:null,p_reason:'Tentativa indevida',p_request:randomUUID()}));
 await rpc(admin.app,'admin_set_license',{p_id:license,p_action:'grant_free',p_until:null,p_reason:'Cortesia fictícia local',p_request:randomUUID()});
 assert.equal(await rpc(owner.app,'is_active',{p_id:license}),true);
 assert.equal(await rpc(other.app,'is_active',{p_id:license}),false);
 checks.push('RLS entre proprietários, escrita direta bloqueada e idempotência');
 const today=new Date().toISOString().slice(0,10);
 const payargs={p_license:license,p_amount:10000,p_due:today,p_paid:today,p_method:'pix',p_reference:'TESTE LOCAL SEM COBRANÇA',p_note:'Fictício',p_request:randomUUID()};
 const payment=await rpc(admin.app,'admin_record_payment',payargs);
 assert.equal(await rpc(admin.app,'admin_record_payment',payargs),payment);
 assert.equal((await rows(owner.app,'payments')).length,1);assert.equal((await rows(other.app,'payments')).length,0);
 await denied(owner.app.schema('licensing').from('payments').delete().eq('id',payment));
 await rpc(admin.app,'admin_void_payment',{p_id:payment,p_reason:'Anulação fictícia de teste',p_request:randomUUID()});
 assert.equal((await rows(owner.app,'payments'))[0].status,'void');
 await rpc(owner.app,'owner_license_action',{p_id:license,p_action:'cancel',p_request:randomUUID()});
 assert.equal(await rpc(owner.app,'is_active',{p_id:license}),false);
 assert.equal((await rows(owner.app,'licenses')).length,1);
 assert.ok((await rows(owner.app,'events')).length>=5);
 checks.push('Cancelamento preserva consulta; pagamentos e anulações mantêm auditoria');
 await denied(owner.app.schema('licensing').rpc('ingest_asaas_event',{p_environment:'sandbox',p_event:{id:'fake',event:'PAYMENT_RECEIVED'}}));
 const event={id:'evt_'+stamp,event:'PAYMENT_RECEIVED',payment:{id:'pay_'+stamp,value:100}};
 await rpc(server,'ingest_asaas_event',{p_environment:'sandbox',p_event:event});await rpc(server,'ingest_asaas_event',{p_environment:'sandbox',p_event:event});
 assert.equal(sql(`SELECT count(*) FROM licensing_private.asaas_inbox WHERE event_id='${event.id}';`),'1');
 assert.equal(await rpc(owner.app,'is_active',{p_id:license}),false);
 checks.push('Fila Asaas exclusiva do servidor, duplicata ignorada, ingresso não ativa licença');
 const session=ok(await owner.app.auth.getSession()).session;
 const chunks=session.access_token.split('.');
 chunks[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(chunks[1],'base64url')),sub:admin.user.id,aal:'aal2'})).toString('base64url');
 const response=await localFetch(api+'/rest/v1/rpc/manager_access',{method:'POST',headers:{apikey:anon,Authorization:'Bearer '+chunks.join('.'),'Content-Profile':'licensing','Content-Type':'application/json'},body:'{}'});
 assert.ok([401,403].includes(response.status));
 await denied(client(anon).schema('licensing').from('licenses').select('*'));
 checks.push('JWT adulterado e acesso anônimo recusados pelo serviço real');
 // Restaura uma cópia completa em OUTRO banco, preservando o banco de origem e os volumes.
 const dump=spawnSync(docker,['exec',`supabase_db_${project}`,'pg_dump','-U','supabase_admin','-d','postgres','-Fc'],{env,windowsHide:true,maxBuffer:64*1024*1024});
 assert.equal(dump.status,0,'Backup local falhou.');
 const backupDir=join(root,'checks.local/licensing-local/backups',stamp);
 await mkdir(backupDir,{recursive:true});await writeFile(join(backupDir,'local-full.dump'),dump.stdout);
 const restoreDb='license_restore_'+stamp;
 const created=run(docker,['exec',`supabase_db_${project}`,'createdb','-U','supabase_admin','-T','template0','-O','postgres',restoreDb]);
 assert.equal(created.status,0,'Criação do banco separado de restauração falhou.');
 const restored=spawnSync(docker,['exec','-i',`supabase_db_${project}`,'pg_restore','-U','supabase_admin','--exit-on-error','-d',restoreDb],{env,input:dump.stdout,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
 assert.equal(restored.status,0,'Restauração local falhou: '+restored.stderr);
 const fingerprintSql=`SELECT n.nspname,c.relname,c.relrowsecurity,COALESCE((SELECT string_agg(pg_get_expr(p.polqual,p.polrelid),'|' ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid),'') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('licensing','licensing_private') AND c.relkind='r' ORDER BY 1,2;
 SELECT 'licenses',md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM licensing.licenses t;
 SELECT 'payments',md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM licensing.payments t;
 SELECT 'events',md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM licensing.events t;
 SELECT 'users',md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM auth.users t;
 SELECT 'mfa',md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'')) FROM auth.mfa_factors t;
 SELECT 'admins',md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY user_id)::text,'')) FROM licensing_private.platform_admins t;
 SELECT 'functions',md5(COALESCE(string_agg(pg_get_functiondef(p.oid),'|' ORDER BY n.nspname,p.proname,p.oid::regprocedure::text),'')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('licensing','licensing_private');`;
 const fingerprint=database=>{const result=run(docker,['exec','-i',`supabase_db_${project}`,'psql','-X','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-At'],fingerprintSql);assert.equal(result.status,0);return result.stdout;};
 assert.equal(fingerprint(restoreDb),fingerprint('postgres'),'Conteúdo, funções ou RLS divergiram após restauração.');
 const backup={database:restoreDb,path:join(backupDir,'local-full.dump'),sha256:createHash('sha256').update(dump.stdout).digest('hex'),bytes:dump.stdout.length,restoredAndCompared:true,productionBackup:false};
 await writeFile(join(backupDir,'manifest.json'),JSON.stringify(backup,null,2)+'\n');
 checks.push('Backup completo local restaurado em outro banco; dados, MFA, funções e RLS conferidos');
 const report={completedAt:new Date().toISOString(),project,productionTouched:false,realAuth:true,realMfa:true,checks,backup,syntheticUserIds:users,syntheticLicenseId:license};
 await mkdir(join(root,'checks.local/licensing-local'),{recursive:true});
 await writeFile(join(root,'checks.local/licensing-local/integration-result.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:true,project,checks,productionTouched:false},null,2));
}finally{
 // Retém os registros fictícios para inspeção e validação de restauração. Sem reset/deleção.
 await server.auth.signOut({scope:'local'});
}
