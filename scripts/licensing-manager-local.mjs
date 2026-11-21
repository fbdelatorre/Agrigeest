// Abre o gestor com configuração automática e uma conta fictícia apenas no Supabase local.
import {spawnSync,spawn} from 'node:child_process';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {join,dirname,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {parseEnv} from 'node:util';

const root=fileURLToPath(new URL('..',import.meta.url));const workdir=join(root,'licensing-server-local');
await assertUnlinked();
async function assertUnlinked(){
 const config=await readFile(join(workdir,'supabase/config.toml'),'utf8');
 if(!config.includes('project_id = "agrigest-licensing-local"'))throw Error('Projeto local inesperado.');
 try{await access(join(workdir,'supabase/.temp/project-ref'));throw Error('Projeto vinculado à nuvem: recusado.');}catch(e){if(e.code!=='ENOENT')throw e;}
}
const env={...process.env};
for(const key of Object.keys(env))if(/^(SUPABASE_|VITE_|DATABASE_URL$|PGPASSWORD$|PGHOST$)|TOKEN|SECRET|PASSWORD|API_KEY|^SMTP_/i.test(key))delete env[key];
const docker=join(process.env.LOCALAPPDATA??'','Programs/DockerDesktop/resources/bin/docker.exe');
await access(docker);const pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')??'PATH';env[pathKey]=dirname(docker)+delimiter+(env[pathKey]??'');
const result=spawnSync(process.execPath,[join(root,'node_modules/supabase/dist/supabase.js'),'status','--workdir',workdir,'--output','json'],{cwd:root,env,encoding:'utf8',windowsHide:true});
if(result.status!==0)throw Error('Inicie o Supabase local antes de abrir o gestor.');
const config=JSON.parse(result.stdout);const url=config.API_URL;
if(url!=='http://127.0.0.1:46321'||!config.ANON_KEY||!config.SERVICE_ROLE_KEY)throw Error('Conexão local inesperada.');
const inspected=spawnSync(docker,['ps','--filter','name=agrigest-licensing-local','--format','{{.Ports}}'],{env,encoding:'utf8',windowsHide:true});
if(inspected.status!==0||/0\.0\.0\.0|\[::\]/.test(inspected.stdout))throw Error('A rede precisa estar restrita a localhost.');
const folder=join(root,'checks.local/licensing-local');await mkdir(folder,{recursive:true});const accountFile=join(folder,'demo-account.json');
const server=createClient(url,config.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let account;
try{account=JSON.parse(await readFile(accountFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!account){
 const email='gestor.local.'+randomBytes(5).toString('hex')+'@example.test';const password=randomBytes(24).toString('base64url');
 const created=await server.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw Error('Não foi possível criar a conta fictícia local.');
 const id=created.data.user.id;if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Identificador inesperado.');
 account={id,email,password,localOnly:true};
 // Salva antes do bootstrap para que falhas possam ser retomadas sem criar outra conta.
 await writeFile(accountFile,JSON.stringify(account,null,2)+'\n');
}
if(!account.localOnly||!/^[0-9a-f-]{36}$/.test(account.id)||!/@example\.test$/.test(account.email))throw Error('Conta de teste inesperada.');
const exists=await server.auth.admin.getUserById(account.id);if(exists.error||exists.data.user.email!==account.email)throw Error('Conta local não encontrada; não foi redefinida nenhuma senha.');
const bootstrap=spawnSync(docker,['exec','-i','supabase_db_agrigest-licensing-local','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{env,input:`INSERT INTO licensing_private.platform_admins(user_id) VALUES('${account.id}'::uuid) ON CONFLICT DO NOTHING;`,encoding:'utf8',windowsHide:true});
if(bootstrap.status!==0)throw Error('Bootstrap local falhou.');
const instructions=join(folder,'ACESSO-TESTE-LOCAL.txt');
await writeFile(instructions,`GESTOR DE LICENCAS - TESTE LOCAL\n\nConta ficticia deste computador. Nao existe no Supabase de producao.\n\nEndereco: http://127.0.0.1:4180\nServico: ${url}\nChave PUBLICA (somente se o instalador pedir): ${config.ANON_KEY}\nEmail: ${account.email}\nSenha inicial de teste: ${account.password}\n\nNo primeiro login, clique em Configurar ou usar autenticador e confirme o codigo no seu aplicativo autenticador. A segunda etapa continua obrigatoria.\n\nA pagina do navegador ja recebe endereco e chave publica automaticamente. Nao use sua senha real neste teste. Nao envie este arquivo ao GitHub. Somente Asaas Sandbox pode ser conectado neste teste. Nao ha cobranca real. Dados de producao NAO estao conectados.\n`);
try{
 const backendEnv=parseEnv(await readFile(join(root,'licensing-server-local/supabase/functions/.env.local'),'utf8'));
 if(backendEnv.ASAAS_ENV==='sandbox'&&backendEnv.ASAAS_ENABLE_PRODUCTION==='false'&&/^\S{32,255}$/.test(backendEnv.ASAAS_RECONCILE_TOKEN??''))spawn(process.execPath,[join(root,'scripts/licensing-reconcile-local.mjs'),'--watch'],{cwd:root,env,detached:true,stdio:'ignore',windowsHide:true}).unref();
}catch{ /* conexão privada pendente; painel continua disponível */ }
let alreadyRunning=false;
try{
 const response=await fetch('http://127.0.0.1:4180',{redirect:'error',signal:AbortSignal.timeout(1500)});
 if(!response.ok||!(await response.text()).includes('Gestor de Licenças'))throw Error('A porta 4180 está ocupada por outro programa.');
 alreadyRunning=true;
}catch(error){if(error.cause?.code!=='ECONNREFUSED')throw error;}
console.log('Gestor local: http://127.0.0.1:4180\nCredenciais fictícias em '+instructions+'\n'+(alreadyRunning?'O gestor já está aberto.':'Mantenha esta janela aberta durante o teste.'));
if(!alreadyRunning){
 const child=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'--config',join(root,'licensing-manager/vite.config.ts')],{cwd:root,env:{...env,VITE_LICENSING_URL:url,VITE_LICENSING_PUBLIC_KEY:config.ANON_KEY},stdio:'inherit',windowsHide:true});
 child.once('error',()=>{process.exitCode=1;});child.once('exit',code=>{process.exitCode=code??1;});
}
if(process.platform==='win32'){
 spawn('notepad.exe',[instructions],{detached:true,stdio:'ignore'}).unref();
 // Abre somente a interface local; não autentica nem aceita termos pelo usuário.
 setTimeout(()=>spawn('rundll32.exe',['url.dll,FileProtocolHandler','http://127.0.0.1:4180'],{stdio:'ignore',windowsHide:true}).unref(),2000);
}
