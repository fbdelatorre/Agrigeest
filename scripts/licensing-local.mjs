import {spawnSync,spawn} from 'node:child_process';
import {localDockerPipe} from './licensing-docker-loopback.mjs';
import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname,delimiter,isAbsolute} from 'node:path';

const root=fileURLToPath(new URL('..',import.meta.url));
const workdir=join(root,'licensing-server-local');
const config=await readFile(join(workdir,'supabase/config.toml'),'utf8');
const action=process.argv[2]??'doctor';
if(!['doctor','start','status','stop'].includes(action))throw Error('Permitido somente doctor, start, status ou stop. Nenhum comando remoto ou reset é aceito.');
if(!config.includes('project_id = "agrigest-licensing-local"')||!config.includes('port = 46321'))throw Error('Configuração local inesperada.');
try{await access(join(workdir,'supabase/.temp/project-ref'));throw Error('Projeto local vinculado a nuvem: interrompido.');}catch(e){if(e.code!=='ENOENT')throw e;}
const env={...process.env};
for(const key of Object.keys(env))if(/^(SUPABASE_|VITE_|DATABASE_URL$|PGPASSWORD$|PGHOST$)|TOKEN|SECRET|PASSWORD|API_KEY|^SMTP_/i.test(key))delete env[key];
const cli=join(root,'node_modules/supabase/dist/supabase.js');
let docker='docker';
for(const candidate of [join(process.env.PROGRAMFILES??'C:/Program Files','Docker/Docker/resources/bin/docker.exe'),join(process.env.LOCALAPPDATA??'','Programs/DockerDesktop/resources/bin/docker.exe')]){
 try{await access(candidate);docker=candidate;break;}catch{ /* use PATH if not installed here */ }
}
// A primeira instalação pode não estar no PATH herdado pelo aplicativo aberto.
// A CLI do Supabase também precisa localizar docker nos seus subprocessos.
if(isAbsolute(docker)){
 const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path')??'PATH';
 env[pathKey]=`${dirname(docker)}${delimiter}${env[pathKey]??''}`;
}
const run=(file,args)=>spawnSync(file,args,{cwd:workdir,env,encoding:'utf8',windowsHide:true});
if(action==='doctor'){
 const version=run(process.execPath,[cli,'--version']);
 const engine=run(docker,['info','--format','{{.ServerVersion}}']);
 console.log(JSON.stringify({project:'agrigest-licensing-local',cliReady:version.status===0,dockerReady:engine.status===0,productionLinked:false,api:'http://127.0.0.1:46321',studio:'http://127.0.0.1:46323',mail:'http://127.0.0.1:46324',note:engine.status===0?'Pronto para iniciar.':'Instale/inicie Docker Desktop com WSL2. Nenhuma instalação ou reinício é feito por este script.'},null,2));
 process.exitCode=engine.status===0?0:2;
}else{
 const context=run(docker,['context','inspect','--format','{{json .Endpoints.docker.Host}}']);
 if(context.status!==0)throw Error('Docker não está disponível. Execute doctor.');
 const host=env.DOCKER_HOST??JSON.parse(context.stdout.trim());
 if(!/^(npipe:\/\/\/\/\.\/pipe\/|unix:\/\/\/|tcp:\/\/(127\.0\.0\.1|localhost):)/.test(host))throw Error('Docker remoto recusado.');
 const network='agrigest-licensing-loopback';
 let inspected=run(docker,['network','inspect',network]);
 if(inspected.status!==0){const made=run(docker,['network','create','--driver','bridge','--opt','com.docker.network.bridge.host_binding_ipv4=127.0.0.1',network]);if(made.status!==0)throw Error('Não foi possível criar a rede local.');inspected=run(docker,['network','inspect',network]);}
 const info=JSON.parse(inspected.stdout)[0];
 if(info.Options?.['com.docker.network.bridge.host_binding_ipv4']!=='127.0.0.1')throw Error('A rede não restringe portas ao computador local.');
 const args=[cli,action,'--workdir',workdir];
 if(action==='start')args.push('--network-id',network,'--exclude','realtime,storage-api,imgproxy,logflare,vector,supavisor');
 if(action==='status')args.push('--output','json');
 let result;
 if(action==='start'&&process.platform==='win32'){
  const proxy=await localDockerPipe(host);
  const localEnv={...env,...proxy.env};delete localEnv.DOCKER_CONTEXT;
  try{
   result=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd:workdir,env:localEnv,windowsHide:true});let stdout='',stderr='';
    child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
    child.once('error',reject);child.once('close',status=>resolve({status,stdout,stderr}));
   });
  }finally{await proxy.close();}
 }else result=run(process.execPath,args);
 if(action==='status'&&result.status===0){
  const state=JSON.parse(result.stdout);console.log(JSON.stringify({api:state.API_URL??state.api_url,studio:state.STUDIO_URL??state.studio_url,mail:state.INBUCKET_URL??state.MAILPIT_URL??state.mailpit_url,keys:'Ocultas; não exibidas no terminal.'},null,2));
 }else if(action==='start'&&result.status===0){
  const running=run(docker,['ps','--filter','name=agrigest-licensing-local','--format','{{.Names}}']);
  for(const name of running.stdout.trim().split(/\r?\n/).filter(Boolean)){
   const inspected=run(docker,['inspect',name]);if(inspected.status!==0)throw Error('Não foi possível validar portas locais.');
   for(const bindings of Object.values(JSON.parse(inspected.stdout)[0].NetworkSettings.Ports??{}))for(const binding of bindings??[]){
    if(!['127.0.0.1','::1'].includes(binding.HostIp)){
     run(process.execPath,[cli,'stop','--workdir',workdir]);throw Error('Serviços parados preservando volumes: porta fora de loopback.');
    }
   }
  }
  console.log('Supabase local iniciado; portas verificadas em 127.0.0.1. Execute status para consultar os endereços. Chaves não exibidas.');
 }else{process.stdout.write((result.stdout+result.stderr).replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[JWT OCULTO]').replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g,'[CHAVE OCULTA]').replace(/("(?:JWT_SECRET|DB_URL)"\s*:\s*")[^"]*/g,'$1[OCULTO]'));}
 process.exitCode=result.status??1;
}
