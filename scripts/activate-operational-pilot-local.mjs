import {readFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import {join} from 'node:path';
if(process.argv[2]!=='--local-only')throw Error('Use --local-only.');
const c=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json','utf8'));
if(c.container!=='supabase_db_agrigest-compat15-local'||!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(c.database))throw Error('Destino inválido.');
const tests=JSON.parse(await readFile(join(c.folder,'operational-tests.json'),'utf8')),records=JSON.parse(await readFile(join(c.folder,'records-verification.json'),'utf8'));
if(tests.database!==c.database||!tests.passed||!tests.transactionRolledBack||records.database!==c.database||!records.allOriginalRecordsUnchanged)throw Error('Validação prévia obrigatória.');
const sql=(await readFile('licensing-server-local/pilot/operational-context.sql','utf8'))+`\nBEGIN;DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_ONLY';END IF;END $$;UPDATE licensing_private.operational_enrollments SET enforce=true;NOTIFY pgrst,'reload schema';COMMIT;`;
const r=spawnSync(join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),['exec','-i','-e','PGPASSWORD',c.container,'psql','-X','-w','-q','-U','supabase_admin','-d',c.database,'-v','ON_ERROR_STOP=1'],{input:sql,env:{...process.env,PGPASSWORD:'postgres'},encoding:'utf8',windowsHide:true});
if(r.status!==0)throw Error('Ativação local falhou.');console.log('PASS: piloto ativado somente no banco local isolado, após testes e comparação dos registros.');
