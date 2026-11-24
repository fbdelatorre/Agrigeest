// Restaura um novo banco de teste; não altera a cópia de origem ou produção.
import {spawnSync} from 'node:child_process';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {join,resolve} from 'node:path';import {randomBytes,createHash} from 'node:crypto';
if(process.argv[2]!=='--local-only')throw Error('Use --local-only.');
// Um piloto existente pode conter testes do usuário: nunca substituir seu contexto.
try { await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json'); throw Error('Já existe um piloto local. Preserve-o antes de preparar outro.'); }
catch(error) { if(error.code!=='ENOENT') throw error; }
const folder=resolve('checks.local/licensing-local/operational-bridge-2026-11-24'),manifest=JSON.parse(await readFile(join(folder,'manifest.json'),'utf8')),backup=await readFile(join(folder,'before-operational-bridge.dump'));
if(manifest.source!=='restored-local-copy'||manifest.productionTouched!==false||manifest.sha256!==createHash('sha256').update(backup).digest('hex'))throw Error('Backup local não confirmado.');
const source=JSON.parse(await readFile('checks.local/cloud-backup-pg15-2026-11-21/restore-result.json','utf8'));if(source.container!=='supabase_db_agrigest-compat15-local'||!source.success)throw Error('Contêiner local não confirmado.');
const docker=join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),database='agrigest_licensing_pilot_'+randomBytes(6).toString('hex'),env={...process.env,PGPASSWORD:'postgres'},base=['exec','-i','-e','PGPASSWORD',source.container];
const child=(args,input)=>spawnSync(docker,[...base,...args],{env,input,windowsHide:true,maxBuffer:64*1024*1024});
const created=child(['createdb','-w','-U','supabase_admin','-T','template0','-O','supabase_admin',database]);if(created.status!==0)throw Error('Não foi possível criar o novo banco local.');
// --clean só é permitido depois de CREATE DATABASE novo com nome gerado e validado.
if(!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(database)||database===source.database)throw Error('Destino não permitido.');
const restored=child(['pg_restore','-w','-U','supabase_admin','-d',database,'--no-owner','--clean','--if-exists','--single-transaction','--exit-on-error'],backup);
const target=join(folder,database);await mkdir(target);await writeFile(join(target,'restore.log'),Buffer.concat([restored.stdout,restored.stderr]));
const context={container:source.container,database,sourceDatabase:source.database,sourceBackupSha256:manifest.sha256,at:new Date().toISOString(),restored:restored.status===0,sourceModified:false,productionTouched:false};await writeFile(join(target,'context.json'),JSON.stringify(context,null,2));if(!context.restored)throw Error('Restauração no novo banco falhou. O banco de origem permanece intacto; consulte o log privado.');
await writeFile(join(folder,'pilot-context.local.json'),JSON.stringify({...context,folder:target},null,2));console.log(context);
