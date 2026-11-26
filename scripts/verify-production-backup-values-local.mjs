// Compara os valores COPY originais, sem usar arredondamento JSON de números/geometrias.
import {spawnSync} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';import {backupFolder,copyBlocks} from './production-backup-tools.mjs';
if(process.argv[2]!=='--isolated-only')throw Error('Use --isolated-only.');
const pointer=JSON.parse(await readFile('checks.local/latest-production-backup.local.json','utf8')),folder=backupFolder(pointer.folder),manifest=JSON.parse(await readFile(join(folder,'manifest.json'),'utf8')),restore=manifest.restore;
if(!manifest.restored||!/^agrigest_restore_prod_[a-f0-9]{12}$/.test(restore?.container??'')||restore.database!=='agrigest_cloud_restore')throw Error('Restauração isolada não confirmada.');
const data=await readFile(join(folder,'data.sql'),'utf8');if(createHash('sha256').update(data).digest('hex')!==manifest.files.find(f=>f.name==='data.sql')?.sha256)throw Error('Arquivo original divergente.');
const envFile=await readFile(join(restore.folder,'quarantine.env'),'utf8'),password=envFile.split(/\r?\n/).find(l=>l.startsWith('POSTGRES_PASSWORD='))?.slice(18);if(!password||!/^[a-f0-9]{64}$/.test(password))throw Error('Credencial local ausente.');
const docker=join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),env={...process.env,PGPASSWORD:password};
const run=(args,input,allowFailure=false)=>{const r=spawnSync(docker,args,{env,input,encoding:'utf8',windowsHide:true,maxBuffer:128*1024*1024});if(r.status!==0&&!allowFailure){writeFile(join(restore.folder,'copy-verify-error.private.log'),r.stderr);throw Error('Conferência local falhou.');}return r;};
const info=JSON.parse(run(['inspect','--format','{{json .}}',restore.container]).stdout);if(info.HostConfig.NetworkMode!=='none'||Object.keys(info.HostConfig.PortBindings??{}).length||info.Config.Labels?.['agrigest.restore.job']!==restore.container.slice(-12))throw Error('Contêiner divergente.');
const rowsHash=rows=>createHash('sha256').update(rows.slice().sort().join('\n')).digest('hex'),report={at:new Date().toISOString(),passed:false,tables:[],productionModified:false,container:restore.container};
try{
 run(['start',restore.container]);let ready=false;for(let i=0;i<100;i++){const r=run(['exec','-e','PGPASSWORD',restore.container,'psql','-X','-w','-qAt','-U','supabase_admin','-d',restore.database,'-c','SELECT 1;'],undefined,true);if(r.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}if(!ready)throw Error('Contêiner não respondeu.');
 for(const block of copyBlocks(data)){
  if(block.table==='public.spatial_ref_sys')continue;
  const sql="BEGIN READ ONLY;SET LOCAL TIME ZONE 'UTC';SET LOCAL DateStyle TO 'ISO';SET LOCAL extra_float_digits TO 3;SET LOCAL bytea_output TO 'hex';SET LOCAL intervalstyle TO 'postgres';"+block.header.replace(/ FROM stdin;$/,' TO STDOUT;')+'ROLLBACK;';
  const result=run(['exec','-i','-e','PGPASSWORD',restore.container,'psql','-X','-w','-qAt','-U','supabase_admin','-d',restore.database,'-v','ON_ERROR_STOP=1'],sql).stdout;
  const rows=result.length?result.replace(/\n$/,'').split('\n'):[];report.tables.push({name:block.table,sourceRows:block.rows.length,restoredRows:rows.length,matches:rowsHash(block.rows)===rowsHash(rows)});
 }
 report.passed=report.tables.every(t=>t.matches);manifest.nativeCopyValuesVerified=report.passed;manifest.nativeCopyTablesCompared=report.tables.length;await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
 if(!report.passed)throw Error('Existem valores divergentes; consulte o relatório privado.');console.log('PASS: valores originais de '+report.tables.length+' blocos COPY conferidos, incluindo precisão geográfica e dados de autenticação. Nenhuma alteração de dados.');
}catch(e){report.failure=e.message;console.error('FAIL: '+e.message);process.exitCode=1;}
finally{const stop=run(['stop',restore.container],undefined,true);report.stopped=stop.status===0;await writeFile(join(restore.folder,'copy-value-verification.json'),JSON.stringify(report,null,2));}
