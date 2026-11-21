// O laço consulta a fila local, não o Asaas quando não há eventos para processar.
import {readFile,mkdir,open,unlink} from 'node:fs/promises';import {existsSync,readFileSync,unlinkSync} from 'node:fs';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {parseEnv} from 'node:util';
const root=fileURLToPath(new URL('..',import.meta.url));const action=process.argv[2]??'--once';if(!['--once','--watch'].includes(action))throw Error('Use --once ou --watch.');
const settings=parseEnv(await readFile(join(root,'licensing-server-local/supabase/functions/.env.local'),'utf8'));
if(settings.ASAAS_ENV!=='sandbox'||settings.ASAAS_ENABLE_PRODUCTION!=='false'||!/^\S{32,255}$/.test(settings.ASAAS_RECONCILE_TOKEN??''))throw Error('Configure o token do processador local, somente Sandbox.');
const folder=join(root,'checks.local/licensing-local');const lock=join(folder,'processor.lock');await mkdir(folder,{recursive:true});
if(action==='--watch'){
 try{const handle=await open(lock,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,local:true}));await handle.close();}
 catch(error){if(error.code!=='EEXIST')throw error;const old=JSON.parse(await readFile(lock,'utf8'));let alive=true;try{process.kill(old.pid,0);}catch{alive=false;}if(alive){console.log('Processador local já está ativo.');process.exit(0);}await unlink(lock);const handle=await open(lock,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,local:true}));await handle.close();}
 process.once('exit',()=>{try{if(existsSync(lock)&&JSON.parse(readFileSync(lock,'utf8')).pid===process.pid)unlinkSync(lock);}catch{ /* lock será verificado na próxima inicialização */ }});
 process.once('SIGTERM',()=>process.exit(0));process.once('SIGINT',()=>process.exit(0));
}
async function run(){try{
 const response=await fetch('http://127.0.0.1:46321/functions/v1/asaas-reconcile',{method:'POST',headers:{'x-agrigest-worker-token':settings.ASAAS_RECONCILE_TOKEN,'x-agrigest-expected-environment':'sandbox','Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!response.ok)return {state:'unavailable'};const result=await response.json();if(result.state!=='idle')console.log(JSON.stringify({state:result.state,event_id:result.event_id}));return result;
}catch{return {state:'unavailable'};}}
if(action==='--once')console.log(JSON.stringify(await run()));
else{console.log('Processador de fila local iniciado.');for(;;){const result=await run();await new Promise(resolve=>setTimeout(resolve,['processed','review','failed'].includes(result.state)?1500:30000));}}
