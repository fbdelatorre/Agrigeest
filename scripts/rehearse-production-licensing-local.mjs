// Ensaio exclusivamente local a partir do backup real restaurado e verificado.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
import {backupFolder,quote} from './production-backup-tools.mjs';
import {buildOperationalMigration,buildReceiptRefinement,buildOptimizedMap} from './licensing-migration-builder.mjs';

if(process.argv[2]!=='--isolated-only')throw Error('Use --isolated-only. Nenhum acesso remoto é permitido.');
const pointer=JSON.parse(await readFile('checks.local/latest-production-backup.local.json','utf8'));
const folder=backupFolder(pointer.folder),manifest=JSON.parse(await readFile(join(folder,'manifest.json'),'utf8')),restore=manifest.restore;
if(!manifest.fullBackupComplete||!manifest.nativeCopyValuesVerified||!/^agrigest_restore_prod_[a-f0-9]{12}$/.test(restore?.container??'')||restore.database!=='agrigest_cloud_restore')throw Error('Backup e restauração verificados são obrigatórios.');
for(const f of manifest.files){if(!/^[a-z0-9.-]+$/.test(f.name)||createHash('sha256').update(await readFile(join(folder,f.name))).digest('hex')!==f.sha256)throw Error('Arquivo privado divergente.');}
const pilotFile='checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json',pilotRaw=await readFile(pilotFile,'utf8');
const confirmation=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/ownership-confirmation.local.json','utf8'));
if(!confirmation.localOnly||!confirmation.confirmedByUser||confirmation.otherMembersRole!=='administrator')throw Error('Titularidade confirmada necessária.');
const suffix=randomBytes(6).toString('hex'),database='agrigest_licensing_pilot_'+suffix,work=join(folder,'migration-'+suffix);await mkdir(work);
const secret=await readFile(join(restore.folder,'quarantine.env'),'utf8'),password=secret.split(/\r?\n/).find(l=>l.startsWith('POSTGRES_PASSWORD='))?.slice(18);
if(!/^[a-f0-9]{64}$/.test(password??''))throw Error('Credencial de quarentena inválida.');
const docker=join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),env={...process.env,PGPASSWORD:password,PGOPTIONS:'-c statement_timeout=45000 -c lock_timeout=5000'};
let phase='isolation',report={at:new Date().toISOString(),database,sourceDatabase:restore.database,container:restore.container,productionTouched:false,pilotChanged:false,completed:false,migrations:[],tests:[]};
const run=(args,input,encoding='utf8',allowFailure=false)=>{const r=spawnSync(docker,args,{env,input,encoding,windowsHide:true,timeout:120000,maxBuffer:256*1024*1024});if(r.status!==0&&!allowFailure){writeFile(join(work,'error.private.log'),r.stderr??'');throw Error('Falha na fase '+phase+'. Consulte o diagnóstico privado.');}return r;};
const dbCommand=(db,args,input,encoding='utf8',allowFailure=false)=>{assert.ok([database,restore.database].includes(db));return run(['exec','-i','-e','PGPASSWORD','-e','PGOPTIONS',restore.container,...args,'-U','supabase_admin','-d',db],input,encoding,allowFailure);};
const sql=(query,allowFailure=false)=>dbCommand(database,['psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1'],query,'utf8',allowFailure);
const json=query=>JSON.parse(sql(query).stdout.trim().split(/\r?\n/).at(-1));
const snapshotSql=await readFile('licensing-server-local/release/snapshot.sql','utf8'),context=JSON.parse(await readFile(join(folder,'source-query-context.private.json'),'utf8'));
const settings='BEGIN READ ONLY;'+[['search_path',context.search_path],['TimeZone',context.timezone],['DateStyle',context.date_style],['extra_float_digits',context.extra_float_digits]].map(([k,v])=>'SELECT set_config('+quote(k)+','+quote(v)+',true);').join('');
const inventory=db=>JSON.parse(dbCommand(db,['psql','-X','-w','-qAt','-v','ON_ERROR_STOP=1'],settings+snapshotSql+'ROLLBACK;').stdout.trim().split(/\r?\n/).at(-1));
const same=(a,b)=>JSON.stringify(a.data)===JSON.stringify(b.data)&&a.securitySha256===b.securitySha256;
const originalRecords=(baseline,current)=>baseline.data.every(s=>{const t=current.data.find(x=>x.name===s.name);return t&&t.rows===s.rows&&t.sha256===s.sha256;});
const body=s=>{assert.match(s,/^BEGIN;\s*$/m);assert.match(s,/COMMIT;\s*$/);return s.replace(/^BEGIN;\s*$/m,'').replace(/COMMIT;\s*$/,'');};
const runTest=async file=>{const before=inventory(database),test=await readFile(file,'utf8');assert.match(test,/ROLLBACK;\s*$/);const started=Date.now(),result=sql(test,true);await writeFile(join(work,file.split('/').at(-1)+'.private.log'),result.stdout+result.stderr);const passed=result.status===0;report.tests.push({file,passed,durationMs:Date.now()-started});if(!passed)throw Error('Teste '+file+' falhou; conexão encerrada sem COMMIT.');assert.ok(same(before,inventory(database)),'O teste deixou registros ou permissões.');};
try{
 const info=JSON.parse(run(['inspect','--format','{{json .}}',restore.container]).stdout);
 assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(Object.keys(info.HostConfig.PortBindings??{}).length,0);assert.equal(info.Config.Labels?.['agrigest.restore.job'],restore.container.slice(-12));
 run(['start',restore.container]);let ready=false;for(let n=0;n<120;n++){if(dbCommand(restore.database,['psql','-X','-w','-qAt','-c','SELECT 1;'],undefined,'utf8',true).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert.ok(ready);
 phase='source-check';const source=inventory(restore.database),saved=JSON.parse(await readFile(join(folder,'source-snapshot.private.json'),'utf8'));assert.ok(same(source,saved),'A cópia de origem diverge do backup.');
 phase='clone';const dump=dbCommand(restore.database,['pg_dump','-w','--format=custom'],undefined,null).stdout;assert.ok(dump.length>1000);await writeFile(join(work,'before-migration.dump'),dump,{flag:'wx'});report.archiveSha256=createHash('sha256').update(dump).digest('hex');
 run(['exec','-e','PGPASSWORD',restore.container,'createdb','-w','-U','supabase_admin','-T','template0','-O','supabase_admin',database]);
 dbCommand(database,['pg_restore','-w','--single-transaction','--exit-on-error'],dump);const baseline=inventory(database);assert.ok(same(source,baseline));report.originalTables=baseline.data.length;
 phase='migration-rollback';const migrationFolder='licensing-server-local/supabase/migrations';const files=(await readdir(migrationFolder)).filter(n=>/^\d+_[a-z_]+\.sql$/.test(n)).sort();assert.equal(files.length,18,'A lista de migrações mudou e exige revisão.');
 let base='';for(const name of files){const text=await readFile(join(migrationFolder,name),'utf8');base+=body(text)+'\n';report.migrations.push({name,sha256:createHash('sha256').update(text).digest('hex')});}
 const failed=sql('BEGIN;'+base+"DO $$ BEGIN RAISE EXCEPTION 'EXPECTED_PRODUCTION_COPY_REHEARSAL_FAILURE';END $$;COMMIT;",true);await writeFile(join(work,'expected-failure.private.log'),failed.stdout+failed.stderr);assert.notEqual(failed.status,0);assert.match(failed.stderr,/EXPECTED_PRODUCTION_COPY_REHEARSAL_FAILURE/);assert.ok(same(baseline,inventory(database)),'Falha deixou alteração parcial.');report.baseMigrationFailureRolledBack=true;
 phase='base-migrations';sql('BEGIN;'+base+'COMMIT;');
 phase='base-contract-tests';await runTest('tests/licensing-postgres15.sql');
 phase='operational-guard';
 const metadata=json("SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')),'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'columns',(SELECT jsonb_agg(a.attname ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname='public')); ");
 const selected=json(`SELECT jsonb_build_object('institution',(SELECT to_jsonb(i) FROM (SELECT id,name FROM public.institutions WHERE id=${quote(confirmation.institutionId)}::uuid)i),'owner',(SELECT to_jsonb(u) FROM (SELECT id,email,email_confirmed_at FROM auth.users WHERE lower(email)=lower(${quote(confirmation.ownerEmail)}))u),'members',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]') FROM public.user_profiles WHERE institution_id=${quote(confirmation.institutionId)}::uuid));`);
 assert.equal(selected.institution?.name,confirmation.institutionName);assert.ok(selected.owner?.email_confirmed_at);assert.ok(selected.members.some(m=>m.id===selected.owner.id),'O proprietário precisa estar vinculado à fazenda confirmada.');
 const core=await readFile('licensing-server-local/pilot/operational-guard.sql','utf8'),generated=buildOperationalMigration(metadata,selected,core);await writeFile(join(work,'operational-guard.generated.private.sql'),generated.sql);sql(generated.sql);report.guardedTables=generated.tables.length;report.rewrittenFunctions=generated.rewritten;report.preservedAdministrators=generated.preserved;
 const functions=json("SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('write_operation_request','stock_write_request','mutate_business_record');");sql(buildReceiptRefinement(functions,core));
 phase='scoped-map';sql(buildOptimizedMap(metadata.functions.find(f=>f.name==='get_area_map_summary')?.definition));report.scopedMapApplied=true;
 phase='pilot-adapters';for(const name of ['operational-context.sql','operational-device-context.sql','operational-farms.sql','operational-plans.sql','billing-integration.sql','manager-reactivations.sql','company-licenses.sql','offline-authorization.sql']){const text=await readFile('licensing-server-local/pilot/'+name,'utf8');sql(text);report.migrations.push({name,sha256:createHash('sha256').update(text).digest('hex')});}
 const migrated=inventory(database);assert.ok(originalRecords(baseline,migrated),'A migração alterou registros existentes.');report.originalRecordsUnchanged=true;report.migratedTables=migrated.data.length;
 phase='reapplication';for(const name of ['company-licenses.sql','offline-authorization.sql'])sql(await readFile('licensing-server-local/pilot/'+name,'utf8'));assert.ok(same(migrated,inventory(database)));report.finalAdaptersIdempotent=true;
 phase='contract-tests';await runTest('tests/licensing-operational-pilot.sql');
 phase='source-preservation';assert.ok(same(source,inventory(restore.database)));assert.equal(await readFile(pilotFile,'utf8'),pilotRaw);report.sourcePreserved=true;report.noTestUsersImported=true;report.completed=true;
 await writeFile(join(work,'migrated-snapshot.private.json'),JSON.stringify(inventory(database)));console.log('PASS: migração na cópia atual do banco real; '+report.originalTables+' tabelas originais preservadas, '+report.tests.length+' suítes SQL aprovadas, falha revertida e origem/piloto intactos.');
}catch(e){report.phase=phase;report.failure=e.message;console.error('FAIL: '+phase+'. Produção e piloto preservados; consulte o relatório privado.');process.exitCode=1;}
finally{const result=run(['stop',restore.container],undefined,'utf8',true);report.stopped=result.status===0;await writeFile(join(work,'result.json'),JSON.stringify(report,null,2));if(report.completed)await writeFile('checks.local/licensing-local/latest-production-migration-rehearsal.local.json',JSON.stringify({folder:work,database,container:restore.container,completed:true},null,2));}
