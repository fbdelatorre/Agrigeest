import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {loadEnv} from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url));
const env={...process.env};
const configured=loadEnv('production',fileURLToPath(new URL('../licensing-manager',import.meta.url)),'VITE_LICENSING_');
const publicKey=configured.VITE_LICENSING_PUBLIC_KEY??'';
if(publicKey){
 let valid=publicKey.startsWith('sb_publishable_');
 if(publicKey.startsWith('eyJ')){try{valid=JSON.parse(Buffer.from(publicKey.split('.')[1],'base64url').toString()).role==='anon';}catch{valid=false;}}
 if(!valid)throw Error('Build recusado: a chave de conexão deve ser pública, nunca administrativa.');
}
for(const key of Object.keys(env))if(!key.startsWith('VITE_LICENSING_')&&/SUPABASE_|VITE_|ASAAS_|SERVICE_ROLE|SECRET_KEY/.test(key))delete env[key];
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','licensing-manager/vite.config.ts'],{cwd:root,env,stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
const html=await readFile(new URL('../licensing-manager/dist.local/index.html',import.meta.url),'utf8');
if(!html.includes('Gestor de Licenças'))throw Error('Artefato de aplicativo inesperado.');
