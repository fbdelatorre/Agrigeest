// O dump da CLI omite dados de auth.schema_migrations. Nunca inferir versões só pela data.
import {spawnSync} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
if(process.argv[2]!=='--local-only')throw Error('Use --local-only.');
const c=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json','utf8'));
if(c.container!=='supabase_db_agrigest-compat15-local'||!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(c.database))throw Error('Destino inválido.');
const docker=join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe');
function run(container,database,sql){const r=spawnSync(docker,['exec','-i','-e','PGPASSWORD',container,'psql','-X','-w','-qAt','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1'],{env:{...process.env,PGPASSWORD:'postgres'},input:sql,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});if(r.status!==0)throw Error('Consulta estrutural local falhou.');return r.stdout;}
const metadata=`SELECT json_build_object('columns',(SELECT json_agg(v ORDER BY v.table_name,v.column_name) FROM(SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='auth' AND table_name<>'schema_migrations')v),'constraints',(SELECT json_agg(v ORDER BY v.tab,v.definition) FROM(SELECT c.relname tab,pg_get_constraintdef(p.oid) definition FROM pg_constraint p JOIN pg_class c ON c.oid=p.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname<>'schema_migrations')v),'enums',(SELECT json_agg(v ORDER BY v.typ,v.sort) FROM(SELECT t.typname typ,e.enumlabel label,e.enumsortorder sort FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='auth')v));`;
// Uma tentativa anterior de migração antiga remove a PK antes de falhar na tabela OAuth moderna.
// Repor somente a restrição que já existia no dump, sem atualizar/excluir identidades.
const originalSchema=await readFile('checks.local/cloud-backup-pg15-2026-11-21/schema-all.sql','utf8');
if(!originalSchema.includes('ADD CONSTRAINT "identities_pkey" PRIMARY KEY ("id")'))throw Error('Chave original não confirmada.');
run(c.container,c.database,`DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_ONLY';END IF;IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='auth.identities'::regclass AND contype='p') THEN ALTER TABLE auth.identities ADD CONSTRAINT identities_pkey PRIMARY KEY(id);END IF;END $$;`);
const expected=JSON.parse(run('supabase_db_agrigest-licensing-local','postgres',metadata)),actual=JSON.parse(run(c.container,c.database,metadata));
const differences=[];for(const kind of Object.keys(expected)){const found=new Set(actual[kind].map(v=>JSON.stringify(v)));for(const item of expected[kind])if(!found.has(JSON.stringify(item)))differences.push({kind,...item});}
await writeFile(join(c.folder,'auth-schema-comparison.json'),JSON.stringify({at:new Date().toISOString(),compatible:differences.length===0,differences},null,2));
if(differences.length){console.log('Estrutura Auth exige revisão:',differences.length,'diferenças; versões não foram marcadas.');process.exit(1);}
const versions=run('supabase_db_agrigest-licensing-local','postgres','SELECT version FROM auth.schema_migrations ORDER BY version;').trim().split('\n');
if(!versions.length||versions.some(v=>!/^(?:00|\d{14})$/.test(v)))throw Error('Versões oficiais locais inválidas.');
run(c.container,c.database,`BEGIN;DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_ONLY';END IF;END $$;INSERT INTO auth.schema_migrations(version) VALUES ${versions.map(v=>"('"+v+"')").join(',')} ON CONFLICT DO NOTHING;COMMIT;`);
console.log('PASS: estrutura Auth compatível com o serviço local; metadados de migração recuperados somente no piloto.');
