import {spawnSync} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
if(process.argv[2]!=='--local-only')throw Error('Use --local-only.');
const c=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json','utf8'));
if(c.container!=='supabase_db_agrigest-compat15-local'||!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(c.database))throw Error('Destino inválido.');
const input=await readFile('licensing-server-local/pilot/operational-device-context.sql','utf8');
const r=spawnSync(join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),['exec','-i','-e','PGPASSWORD',c.container,'psql','-X','-w','-qAt','-U','supabase_admin','-d',c.database,'-v','ON_ERROR_STOP=1'],{env:{...process.env,PGPASSWORD:'postgres'},input,encoding:'utf8',windowsHide:true});
await writeFile(join(c.folder,'consultant-device-context-apply.log'),r.stdout+r.stderr);if(r.status!==0)throw Error('Consulta local não publicada; consulte o log privado.');console.log('PASS: consulta de licenças de aparelhos vinculadas à fazenda publicada somente no piloto; nenhum registro alterado.');
