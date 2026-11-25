// Inicialização exclusiva do piloto local; não usa CLI nem credenciais da nuvem.
import {spawnSync,spawn} from 'node:child_process';
import {readFile,writeFile,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomBytes,createHmac} from 'node:crypto';
if(process.argv[2]!=='--local-only')throw Error('Use --local-only.');
const context=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json','utf8'));
if(context.container!=='supabase_db_agrigest-compat15-local'||!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(context.database)||!context.restored)throw Error('Destino não permitido.');
const docker=join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
function call(args,input){const r=spawnSync(docker,args,{env:{...process.env,PGPASSWORD:'postgres'},input,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});if(r.status!==0)throw Error('Comando local falhou; consulte o log privado do piloto.');return r.stdout;}
const inspect=name=>JSON.parse(call(['inspect',name]))[0];
const names={auth:'agrigest_pilot_auth',rest:'agrigest_pilot_rest',mail:'agrigest_pilot_mail'};
let config;
try{config=JSON.parse(await readFile(join(context.folder,'api.private.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;
 const secret=randomBytes(48).toString('hex'),password=randomBytes(32).toString('hex');
 const jwt=role=>{const now=Math.floor(Date.now()/1000),header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({role,iss:'agrigest-local-pilot',iat:now,exp:now+31536000})).toString('base64url'),value=header+'.'+body;return value+'.'+createHmac('sha256',secret).update(value).digest('base64url');};
 config={database:context.database,jwtSecret:secret,authPassword:password,authRole:'agrigest_pilot_auth_'+context.database.slice(-12),anonKey:jwt('anon'),serviceKey:jwt('service_role'),apiUrl:'http://127.0.0.1:48721',institutionId:JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/ownership-confirmation.local.json','utf8')).institutionId};
 await writeFile(join(context.folder,'api.private.json'),JSON.stringify(config,null,2),{flag:'wx'});
}
if(config.database!==context.database||!/^agrigest_pilot_auth_[a-f0-9]{12}$/.test(config.authRole)||!/^[a-f0-9]{64}$/.test(config.authPassword))throw Error('Configuração privada inválida.');
const role=config.authRole;
call(['start',context.container]);
const sql=`BEGIN;
DO $b$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_ONLY';END IF;
IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role} LOGIN PASSWORD '${config.authPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;END IF;END $b$;
GRANT CONNECT ON DATABASE ${context.database} TO ${role};
ALTER ROLE ${role} IN DATABASE ${context.database} SET search_path TO auth;
ALTER SCHEMA auth OWNER TO ${role};GRANT USAGE ON SCHEMA public,extensions TO ${role};
DO $b$ DECLARE r record;BEGIN
 FOR r IN SELECT c.oid::regclass AS name,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relkind IN ('r','p','S','v','m') LOOP
 EXECUTE format('ALTER %s %s OWNER TO ${role}',CASE r.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END,r.name);END LOOP;
 FOR r IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='auth' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO ${role}',r.name);END LOOP;
 FOR r IN SELECT t.oid::regtype AS name FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth' AND t.typtype IN ('e','d') LOOP EXECUTE format('ALTER TYPE %s OWNER TO ${role}',r.name);END LOOP;
END $b$;
COMMIT;`;
call(['exec','-i','-e','PGPASSWORD',context.container,'psql','-X','-w','-q','-U','supabase_admin','-d',context.database,'-v','ON_ERROR_STOP=1'],sql);
const primaryAuth=inspect('supabase_auth_agrigest-licensing-local'),primaryRest=inspect('supabase_rest_agrigest-licensing-local'),primaryMail=inspect('supabase_inbucket_agrigest-licensing-local');
const authEnv={};for(const line of primaryAuth.Config.Env){const i=line.indexOf('='),key=line.slice(0,i);if(/^GOTRUE_/.test(key)&&!/(SECRET|KEYS|DATABASE_URL|EXTERNAL_|SMTP_|JWT_ISSUER|URI_ALLOW_LIST)/.test(key))authEnv[key]=line.slice(i+1);}
Object.assign(authEnv,{GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgresql://${role}:${config.authPassword}@${context.container}:5432/${context.database}`,GOTRUE_JWT_SECRET:config.jwtSecret,GOTRUE_JWT_VALID_METHODS:'HS256',GOTRUE_JWT_VALIDMETHODS:'HS256',GOTRUE_JWT_ISSUER:config.apiUrl+'/auth/v1',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_SITE_URL:'http://127.0.0.1:48780',GOTRUE_URI_ALLOW_LIST:'http://127.0.0.1:48780/**',API_EXTERNAL_URL:config.apiUrl,GOTRUE_SMTP_HOST:names.mail,GOTRUE_SMTP_PORT:'1025',GOTRUE_SMTP_ADMIN_EMAIL:'piloto@agrigest.local',GOTRUE_SMTP_SENDER_NAME:'AgriGest — teste local',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_PASSWORD_MIN_LENGTH:'12',GOTRUE_DISABLE_SIGNUP:'false'});
async function start(name,image,port,internal,env){
 let existing;try{existing=inspect(name);}catch{}
 if(existing){if(existing.Config.Labels?.['agrigest.pilot.database']!==context.database)throw Error('Contêiner pertence a outro piloto.');for(const bindings of Object.values(existing.HostConfig.PortBindings??{}))for(const b of bindings??[])if(b.HostIp!=='127.0.0.1')throw Error('Porta exposta fora do computador.');const actual=new Map(existing.Config.Env.map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));const drift=Object.entries(env).some(([k,v])=>actual.get(k)!==v);if(!drift){call(['start',name]);return;}if(name!==names.auth)throw Error('Configuração local divergente exige revisão.');await writeFile(join(context.folder,'auth-before-update.private.log'),call(['logs',name]));call(['rm','-f',name]);}
 const path=join(context.folder,name+'.env');await writeFile(path,Object.entries(env).map(([k,v])=>k+'='+v).join('\n'));
 call(['run','-d','--pull=never','--name',name,'--label','agrigest.pilot.database='+context.database,'--network','agrigest-compat15-loopback','-p',`127.0.0.1:${port}:${internal}`,'--env-file',path,image]);
}
// A configuração da CLI de origem pode conter caminhos absolutos para a outra cópia local.
// Todos os emails deste piloto devem verificar tokens exclusivamente no seu próprio Auth.
for(const kind of ['INVITE','CONFIRMATION','RECOVERY','EMAIL_CHANGE'])authEnv['GOTRUE_MAILER_URLPATHS_'+kind]=config.apiUrl+'/auth/v1/verify';
await start(names.mail,primaryMail.Image,48724,8025,{MP_SMTP_DISABLE_RDNS:'true'});
await start(names.auth,primaryAuth.Image,48722,9999,authEnv);
await start(names.rest,primaryRest.Image,48723,3000,{PGRST_DB_URI:`postgresql://authenticator:postgres@${context.container}:5432/${context.database}`,PGRST_DB_SCHEMAS:'public,licensing',PGRST_DB_ANON_ROLE:'anon',PGRST_DB_EXTRA_SEARCH_PATH:'public,extensions',PGRST_JWT_SECRET:config.jwtSecret,PGRST_DB_MAX_ROWS:'1000'});
const healthy=await fetch(config.apiUrl+'/pilot/health').then(r=>r.ok).catch(()=>false);
if(!healthy){const log=await open(join(context.folder,'api-proxy.log'),'a');const child=spawn(process.execPath,['scripts/serve-operational-pilot-api.mjs','--local-only'],{cwd:resolve('.'),detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]});child.unref();await log.close();}
let authReady=false;for(let n=0;n<40;n++){if(await fetch('http://127.0.0.1:48722/health').then(r=>r.ok).catch(()=>false)){authReady=true;break;}await new Promise(done=>setTimeout(done,250));}
if(!authReady)throw Error('A autenticação do piloto ainda não respondeu; confira o Docker.');
console.log('Serviços piloto iniciados em portas locais. Cadastros exigem confirmação na caixa local; cobranças externas permanecem desativadas.');
