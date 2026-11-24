import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

if(process.argv[2]!=='--local-only') throw Error('Use --local-only.');
const context=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json','utf8'));
if(context.container!=='supabase_db_agrigest-compat15-local'||!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(context.database)||!context.restored) throw Error('Destino piloto não confirmado.');
const sql=await readFile('tests/licensing-operational-pilot.sql','utf8');
if(!sql.trim().endsWith('ROLLBACK;')) throw Error('O teste deve encerrar com ROLLBACK.');
const result=spawnSync(join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),['exec','-i','-e','PGPASSWORD',context.container,'psql','-X','-w','-U','supabase_admin','-d',context.database,'-v','ON_ERROR_STOP=1'],{env:{...process.env,PGPASSWORD:'postgres'},input:sql,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
await writeFile(join(context.folder,'operational-tests.private.log'),result.stdout+result.stderr);
const passed=result.status===0&&/ROLLBACK\s*$/.test(result.stdout);
await writeFile(join(context.folder,'operational-tests.json'),JSON.stringify({at:new Date().toISOString(),database:context.database,passed,transactionRolledBack:passed,productionTouched:false},null,2));
console.log(passed?'PASS: permissões, estoque, operações e licença cancelada; todas as gravações revertidas.':'FAIL: teste interrompido; conexão encerrada sem COMMIT. Consulte o log privado.');
if(!passed)process.exitCode=1;
