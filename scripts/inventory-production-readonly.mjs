// Usa a autenticação normal da CLI e sempre --read-only. Não recebe nem imprime chaves.
import {spawnSync} from 'node:child_process';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve,join} from 'node:path';import {randomBytes} from 'node:crypto';
import {comparePublicFunctions,comparePublicPolicies} from './release-sql-comparison.mjs';
if(process.argv[2]!=='--read-only')throw Error('Use --read-only. Este script nunca publica SQL.');
const previous=JSON.parse(await readFile('checks.local/cloud-backup-pg15-2026-11-21/restore-result.json','utf8'));
if(!previous.success||!/^[a-z]{20}$/.test(previous.sourceProject??''))throw Error('Projeto de origem não confirmado.');
const folder=resolve('checks.local/licensing-local/production-inventory-2026-11-26',randomBytes(6).toString('hex'));await mkdir(folder,{recursive:true});
const sql=`SELECT current_database() AS database, current_setting('server_version') AS version, current_setting('transaction_read_only')='on' AS read_only, current_setting('TimeZone') AS timezone, current_setting('DateStyle') AS date_style, current_setting('search_path') AS search_path, now() AT TIME ZONE 'UTC' AS inspected_at,
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname<>'spatial_ref_sys') AS public_tables,
 (SELECT count(*) FROM pg_policies WHERE schemaname='public') AS public_policies,
 to_regnamespace('licensing') IS NOT NULL AS licensing_exists,
 to_regclass('public.institutions') IS NOT NULL AS institutions_exists;
`;
const file=join(folder,'probe.sql');await writeFile(file,sql);
const cli=resolve('node_modules/supabase/dist/supabase.js'),run=(filename)=>spawnSync(process.execPath,[cli,'db','query','--remote='+previous.sourceProject,'--read-only','--file',filename,'--output','json','--log-level','error'],{windowsHide:true,encoding:'utf8',maxBuffer:32*1024*1024,timeout:60000});
const probe=run(file);await writeFile(join(folder,'probe-output.private.json'),probe.stdout??'');await writeFile(join(folder,'probe-errors.private.log'),probe.stderr??'');
if(probe.status!==0){await writeFile(join(folder,'result.json'),JSON.stringify({at:new Date().toISOString(),completed:false,readOnly:true,productionModified:false,requiresCliAuthentication:/login|token|authenticat/i.test(probe.stderr??'')},null,2));console.log('A consulta somente leitura não foi concluída. Diagnóstico salvo em arquivo privado; nenhuma alteração enviada.');process.exitCode=1;}
else{
 const probeData=JSON.parse(probe.stdout);if(probeData.rows?.[0]?.read_only!==true)throw Error('O servidor não confirmou transação somente leitura.');
 const snapshotFile=join(folder,'inventory.sql');await writeFile(snapshotFile,await readFile('licensing-server-local/release/snapshot.sql','utf8'));
 const snapshot=run(snapshotFile);await writeFile(join(folder,'snapshot-output.private.json'),snapshot.stdout??'');await writeFile(join(folder,'snapshot-errors.private.log'),snapshot.stderr??'');if(snapshot.status!==0)throw Error('Inventário completo não concluído; consulte o diagnóstico privado.');
 const envelope=JSON.parse(snapshot.stdout),inventory=envelope.rows?.[0]?.jsonb_build_object;if(!Array.isArray(inventory?.data)||!/^[a-f0-9]{64}$/.test(inventory?.securitySha256??''))throw Error('Inventário inválido.');
 await writeFile(join(folder,'inventory.private.json'),JSON.stringify(inventory));
 const baseline=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/inventory.private.json','utf8'));
 const liveFunctions=inventory.security.functions.filter(f=>f.name.startsWith('public.'));
 const functionDrift=comparePublicFunctions(baseline.functions,liveFunctions);
 const result={at:new Date().toISOString(),completed:true,readOnly:true,serverReadOnlyConfirmed:true,productionModified:false,fullBackupCreated:false,tablesInventoried:inventory.data.length,publicTables:probeData.rows[0].public_tables,publicPolicies:probeData.rows[0].public_policies,licensingExists:probeData.rows[0].licensing_exists,serverVersion:probeData.rows[0].version,publicFunctionsDifferentFromPreviousCopy:functionDrift};
 // pg_policies qualifica nomes conforme search_path. Compara a cópia anterior
 // com a mesma configuração de exibição, sem remover qualificadores do SQL.
 if(previous.container!=='supabase_db_agrigest-compat15-local'||!/^agrigest_cloud_restore_[a-f0-9]+$/.test(previous.database))throw Error('Base anterior não confirmada.');
 const quote=value=>"'"+String(value).replace(/'/g,"''")+"'",previousSql=`BEGIN READ ONLY;SELECT set_config('search_path',${quote(probeData.rows[0].search_path)},true);SELECT set_config('TimeZone',${quote(probeData.rows[0].timezone)},true);SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname),'[]') FROM pg_policies p WHERE schemaname='public';ROLLBACK;`;
 const previousPolicies=spawnSync(join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),['exec','-i','-e','PGPASSWORD',previous.container,'psql','-X','-w','-qAt','-U','supabase_admin','-d',previous.database,'-v','ON_ERROR_STOP=1'],{input:previousSql,env:{...process.env,PGPASSWORD:'postgres'},encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
 await writeFile(join(folder,'previous-policies-errors.private.log'),previousPolicies.stderr??'');if(previousPolicies.status!==0)throw Error('Não foi possível conferir as políticas da cópia anterior.');
 const policyBaseline=JSON.parse(previousPolicies.stdout.trim().split(/\r?\n/).at(-1));await writeFile(join(folder,'previous-policies.private.json'),JSON.stringify(policyBaseline));result.publicPolicyDifferences=comparePublicPolicies(policyBaseline,inventory.security.policies);
 const ownership=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/ownership-confirmation.local.json','utf8'));
 if(ownership.confirmedByUser===true&&/^[a-f0-9-]{36}$/i.test(ownership.institutionId??'')&&typeof ownership.ownerEmail==='string'){
  const literal=value=>"'"+value.replace(/'/g,"''")+"'",institution=literal(ownership.institutionId),email=literal(ownership.ownerEmail),ownerFile=join(folder,'confirmed-ownership.sql');
  await writeFile(ownerFile,`SELECT EXISTS(SELECT 1 FROM public.institutions WHERE id=${institution}::uuid) AS institution_found,EXISTS(SELECT 1 FROM auth.users WHERE lower(email)=lower(${email}) AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL) AS owner_account_confirmed,EXISTS(SELECT 1 FROM auth.users u JOIN public.user_profiles p ON p.id=u.id WHERE lower(u.email)=lower(${email}) AND p.institution_id=${institution}::uuid) AS owner_currently_linked,(SELECT count(*) FROM public.user_profiles WHERE institution_id=${institution}::uuid) AS current_members,(SELECT count(*) FROM public.institutions) AS total_institutions;`);
  const verified=run(ownerFile);await writeFile(join(folder,'ownership-output.private.json'),verified.stdout??'');await writeFile(join(folder,'ownership-errors.private.log'),verified.stderr??'');if(verified.status!==0)throw Error('Conferência de titularidade não concluída.');result.confirmedScopeVerification=JSON.parse(verified.stdout).rows?.[0]??null;
 }
 await writeFile(join(folder,'result.json'),JSON.stringify(result,null,2));await writeFile('checks.local/licensing-local/latest-production-inventory.local.json',JSON.stringify({folder,completed:true,readOnly:true,fullBackupCreated:false},null,2));console.log('PASS: '+result.tablesInventoried+' tabelas e controles de acesso inventariados em transação somente leitura no projeto real. Nenhuma alteração publicada. Este inventário não substitui um backup.');
}
