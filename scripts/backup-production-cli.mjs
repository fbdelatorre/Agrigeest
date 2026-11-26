// Exporta o projeto confirmado; não executa push, reset, restore nem troca a senha principal.
import {spawnSync} from 'node:child_process';import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';import {join,resolve,dirname,delimiter} from 'node:path';import {randomBytes,createHash} from 'node:crypto';
import {protectBackupFolder} from './production-backup-tools.mjs';
if(process.argv[2]!=='--backup-only')throw Error('Use --backup-only. Nenhuma restauração remota é aceita.');
const previous=JSON.parse(await readFile('checks.local/cloud-backup-pg15-2026-11-21/restore-result.json','utf8'));if(!previous.success||!/^[a-z]{20}$/.test(previous.sourceProject??''))throw Error('Projeto de origem não confirmado.');
const folder=resolve('checks.local/production-backup-2026-11-26',randomBytes(6).toString('hex'));await mkdir(folder,{recursive:true});protectBackupFolder(folder);
const cli=resolve('node_modules/@supabase/cli-windows-x64/bin/supabase.exe'),docker=join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),env={...process.env},pathKey=Object.keys(env).find(k=>k.toLowerCase()==='path')??'PATH';env[pathKey]=dirname(docker)+delimiter+(env[pathKey]??'');
for(const key of Object.keys(env))if(/^SUPABASE_(YES|DB_PASSWORD|PROJECT_ID)$|^PG(PASSWORD|HOST|USER|PORT|DATABASE)$|^VITE_|ASAAS_/i.test(key))delete env[key];
env.PGOPTIONS='-c default_transaction_read_only=on';
const run=(args,timeout=90000)=>spawnSync(cli,args,{env,cwd:resolve('.'),windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:32*1024*1024,timeout});
const query=async(sql,name)=>{const file=join(folder,name+'.sql');await writeFile(file,sql);const r=run(['db','query','--remote='+previous.sourceProject,'--read-only','--file',file,'--output','json','--log-level','error']);await writeFile(join(folder,name+'.output.private.json'),r.stdout??'');await writeFile(join(folder,name+'.errors.private.log'),r.stderr??'');if(r.status!==0)throw Error('A leitura de controle falhou.');return JSON.parse(r.stdout).rows;};
const manifest={at:new Date().toISOString(),sourceProject:previous.sourceProject,method:'Supabase CLI pg_dump with temporary login role',applicationDataModified:false,productionRestore:false,complete:false,restored:false,files:[]};
try{
 const before=(await query("SELECT current_setting('transaction_read_only')='on' AS read_only,(SELECT count(*) FROM storage.objects) AS objects,(SELECT count(*) FROM storage.buckets) AS buckets,(SELECT count(*) FROM vault.secrets) AS vault_secrets;",'before-storage'))[0];if(before.read_only!==true)throw Error('Somente leitura não confirmado.');
 manifest.storageBefore=before;
 const parts=[['schema-all.sql',['--keep-comments','--schema','auth,extensions,graphql,graphql_public,pgbouncer,public,realtime,storage,supabase_migrations,vault']],['data.sql',['--data-only','--use-copy']],['roles.sql',['--role-only']]];
 for(const [name,flags] of parts){
  const file=join(folder,name),r=run(['db','dump','--remote='+previous.sourceProject,'--file',file,...flags,'--output-format','json','--log-level','error']);
  await writeFile(join(folder,name+'.output.private.log'),r.stdout??'');await writeFile(join(folder,name+'.errors.private.log'),r.stderr??'');
  if(r.status!==0)throw Error('Exportação não concluída: '+name+'. Consulte o log privado.');const info=await stat(file);if(info.size<10)throw Error('Exportação vazia.');manifest.files.push({name,bytes:info.size,sha256:createHash('sha256').update(await readFile(file)).digest('hex')});await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));console.log('Exportado: '+name+' ('+info.size+' bytes).');
 }
 const after=(await query("SELECT (SELECT count(*) FROM storage.objects) AS objects,(SELECT count(*) FROM storage.buckets) AS buckets;",'after-storage'))[0];manifest.storageAfter=after;
 manifest.storageFilesVerified=before.objects===0&&after.objects===0;manifest.storageFilesIncluded=manifest.storageFilesVerified;manifest.complete=manifest.files.length===3;await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));await writeFile('checks.local/latest-production-backup.local.json',JSON.stringify({folder,complete:manifest.complete,restored:false},null,2));console.log('PASS: exportação privada concluída; restauração e abrangência ainda precisam ser verificadas.');
}catch(e){manifest.error=e.message;await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));await writeFile('checks.local/latest-production-backup.local.json',JSON.stringify({folder,complete:false,restored:false},null,2));console.error('FAIL: '+e.message+' Nenhum lançamento foi alterado.');process.exitCode=1;}
