import {spawnSync} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
if(process.argv[2]!=='--local-only')throw Error('Use --local-only.');const c=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json','utf8'));
if(c.container!=='supabase_db_agrigest-compat15-local'||!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(c.database))throw Error('Destino inválido.');
const docker=join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),env={...process.env,PGPASSWORD:'postgres'},args=['exec','-i','-e','PGPASSWORD',c.container,'psql','-X','-w','-At','-U','supabase_admin','-d',c.database,'-v','ON_ERROR_STOP=1'];const run=sql=>spawnSync(docker,args,{env,input:sql,encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
const result=run("SELECT json_agg(json_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('write_operation_request','stock_write_request','mutate_business_record');");if(result.status!==0)throw Error('Leitura falhou.');const functions=JSON.parse(result.stdout);
let sql="BEGIN;DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;\n";
const core=await readFile('licensing-server-local/pilot/operational-guard.sql','utf8');
for(const name of ['active_institution','table_module','guard_operational_row']) {
 const start=core.indexOf('CREATE FUNCTION licensing_private.'+name+'('),end=core.indexOf('CREATE FUNCTION ',start+16);
 if(start<0||end<0)throw Error('Função piloto não encontrada: '+name);
 sql+=core.slice(start,end).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
}
for(const f of functions){let d=f.definition;if(d.includes('RECEIPT_FARM_SCOPE_MISMATCH'))continue;
 const module=f.name==='stock_write_request'?"'inventory'":f.name==='write_operation_request'?"'operations'":'licensing_private.table_module(p_table)';
 if(f.name==='mutate_business_record')d=d.replace(/\bBEGIN\b/i,`BEGIN\nPERFORM licensing.require_operational(${module},false);`);else d=d.replace(`PERFORM licensing.require_operational(${module},true);`,`PERFORM licensing.require_operational(${module},false);`);
 d=d.replace('IF FOUND THEN',"IF FOUND THEN\n    IF receipt.institution_id IS DISTINCT FROM institution THEN RAISE EXCEPTION 'RECEIPT_FARM_SCOPE_MISMATCH' USING ERRCODE='42501';END IF;");
 const marker=f.name==='stock_write_request'?'FOREACH key IN ARRAY':f.name==='write_operation_request'?'result:=public.save_atomic_operation(':'EXECUTE format(';
 if(!d.includes(marker))throw Error('Rotina exige revisão: '+f.name);d=d.replace(marker,`PERFORM licensing.require_operational(${module},true);\n  `+marker);sql+=d+';\n';
}
sql+='COMMIT;';await writeFile(join(c.folder,'receipt-refinements.private.sql'),sql);const applied=run(sql);await writeFile(join(c.folder,'receipt-refinements.log'),applied.stdout+applied.stderr);if(applied.status!==0)throw Error('Refinamento falhou; transação revertida.');console.log('PASS: consultas de recibos preservadas no modo de leitura e vinculadas à fazenda correta.');
