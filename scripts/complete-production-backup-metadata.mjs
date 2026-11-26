// Completa metadados omitidos pela CLI usando exclusivamente consultas --read-only.
import {spawnSync} from 'node:child_process';import {readFile,writeFile} from 'node:fs/promises';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';import {backupFolder,protectBackupFolder,quote,identifier,qualified,copyTableNames} from './production-backup-tools.mjs';
if(process.argv[2]!=='--backup-only')throw Error('Use --backup-only.');
const index=JSON.parse(await readFile('checks.local/latest-production-backup.local.json','utf8')),folder=backupFolder(index.folder);protectBackupFolder(folder);const manifest=JSON.parse(await readFile(join(folder,'manifest.json'),'utf8'));
const previous=JSON.parse(await readFile('checks.local/cloud-backup-pg15-2026-11-21/restore-result.json','utf8'));if(manifest.sourceProject!==previous.sourceProject||!manifest.complete)throw Error('Exportação nativa incompleta ou projeto divergente.');
for(const f of manifest.files)if(!['schema-all.sql','data.sql','roles.sql','supplement-data.sql','role-metadata.private.json','sequence-values.sql','source-snapshot.private.json','source-query-context.private.json','permissions-restore.sql'].includes(f.name)||createHash('sha256').update(await readFile(join(folder,f.name))).digest('hex')!==f.sha256)throw Error('Backup original divergente.');
const cli=resolve('node_modules/supabase/dist/supabase.js');
const query=async(sql,name)=>{const file=join(folder,name+'.sql');await writeFile(file,sql);const r=spawnSync(process.execPath,[cli,'db','query','--remote='+manifest.sourceProject,'--read-only','--file',file,'--output','json','--log-level','error'],{windowsHide:true,encoding:'utf8',maxBuffer:64*1024*1024,timeout:60000});await writeFile(join(folder,name+'.response.private.json'),r.stdout??'');await writeFile(join(folder,name+'.errors.private.log'),r.stderr??'');if(r.status!==0)throw Error('Consulta de complemento falhou: '+name);return JSON.parse(r.stdout).rows;};
try{
 const contextName='source-query-context.private.json';
 if(!manifest.files.some(f=>f.name===contextName)){
  const context=(await query("SELECT current_setting('transaction_read_only')='on' AS read_only,current_setting('TimeZone') AS timezone,current_setting('search_path') AS search_path,current_setting('DateStyle') AS date_style,current_setting('extra_float_digits') AS extra_float_digits;",'query-context'))[0];if(context.read_only!==true)throw Error('Somente leitura não confirmado.');const content=Buffer.from(JSON.stringify(context));await writeFile(join(folder,contextName),content,{flag:'wx'});manifest.files.push({name:contextName,bytes:content.length,sha256:createHash('sha256').update(content).digest('hex')});await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));
 }
 if(manifest.metadataSupplementVerified){console.log('PASS: contexto de comparação registrado; complementos anteriores preservados.');process.exit(0);}
 const snapshotSql=await readFile('licensing-server-local/release/snapshot.sql','utf8'),before=(await query(snapshotSql,'snapshot-before-supplement'))[0].jsonb_build_object;await writeFile(join(folder,'source-snapshot.private.json'),JSON.stringify(before));
 const included=copyTableNames(await readFile(join(folder,'data.sql'),'utf8')),missing=before.data.filter(t=>!included.has(t.name));manifest.omittedByNativeDump=missing.map(t=>({name:t.name,rows:t.rows}));
 const definitions=(await query("SELECT n.nspname||'.'||c.relname AS name,c.relkind AS kind,jsonb_agg(a.attname ORDER BY a.attnum) AS columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' WHERE c.relkind IN('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' GROUP BY n.nspname,c.relname,c.relkind;",'columns'));
 let supplement="-- Dados administrativos omitidos pela exportação padrão. Somente para restauração isolada.\n";
 for(const t of missing){
  const definition=definitions.find(d=>d.name===t.name),columns=definition?.columns;if(!columns?.length)throw Error('Colunas do complemento ausentes.');if(definition.kind==='p'&&t.rows>0)throw Error('Partição com dados exige conferência de cobertura antes de complementar.');
  const prefix='INSERT INTO '+qualified(t.name)+' ('+columns.map(identifier).join(',')+') OVERRIDING SYSTEM VALUE VALUES (';
  const expression=columns.map(c=>'quote_nullable('+identifier(c)+'::text)').join("||','||");
  const rows=await query('SELECT '+quote(prefix)+'||'+expression+'||'+quote(');')+' AS statement FROM '+qualified(t.name)+';','supplement-'+t.name.replace('.','-'));
  for(const row of rows){if(typeof row.statement!=='string')throw Error('Complemento inválido.');supplement+=row.statement+'\n';}
 }
 await writeFile(join(folder,'supplement-data.sql'),supplement,{flag:'wx'});
 const roles=(await query("SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY rolname),'[]') AS roles FROM (SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil,rolconfig FROM pg_roles WHERE rolname NOT LIKE 'pg_%' AND rolname<>'cli_login_postgres') r;",'role-properties'))[0].roles;
 const memberships=await query("SELECT r.rolname AS role,m.rolname AS member,a.admin_option,g.rolname AS grantor FROM pg_auth_members a JOIN pg_roles r ON r.oid=a.roleid JOIN pg_roles m ON m.oid=a.member JOIN pg_roles g ON g.oid=a.grantor WHERE m.rolname<>'cli_login_postgres' ORDER BY r.rolname,m.rolname;",'role-memberships');
 await writeFile(join(folder,'role-metadata.private.json'),JSON.stringify({roles,memberships}));
 let sequences='';for(const sequence of before.sequenceFloors){
  const rows=await query('SELECT format('+quote('SELECT pg_catalog.setval(%L::regclass,%s,%L);')+','+quote(qualified(sequence.name))+',last_value::text,is_called::text) AS statement FROM '+qualified(sequence.name)+';','sequence-'+sequence.name.replace('.','-'));for(const row of rows)sequences+=row.statement+'\n';
 }
 await writeFile(join(folder,'sequence-values.sql'),sequences,{flag:'wx'});
 const after=(await query(snapshotSql,'snapshot-after-supplement'))[0].jsonb_build_object;await writeFile(join(folder,'source-after-supplement.private.json'),JSON.stringify(after));
 if(before.securitySha256!==after.securitySha256||missing.some(t=>after.data.find(a=>a.name===t.name)?.sha256!==t.sha256))throw Error('O esquema ou os metadados mudaram durante a exportação. Preserve esta tentativa e gere um novo backup.');
 manifest.metadataSupplementVerified=true;manifest.fullBackupComplete=false;manifest.storageFilesVerified=after.data.find(t=>t.name==='storage.objects')?.rows===0&&before.data.find(t=>t.name==='storage.objects')?.rows===0;
 for(const name of ['supplement-data.sql','role-metadata.private.json','sequence-values.sql','source-snapshot.private.json']){const b=await readFile(join(folder,name));manifest.files.push({name,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
 await writeFile(join(folder,'manifest.json'),JSON.stringify(manifest,null,2));console.log('PASS: '+missing.length+' tabelas administrativas complementadas, propriedades dos papéis e sequências preservadas. Nenhuma gravação de aplicação enviada à produção.');
}catch(e){await writeFile(join(folder,'metadata-completion-error.private.log'),e.stack);console.error('FAIL: complemento não validado. Arquivos originais preservados; consulte o diagnóstico privado.');process.exitCode=1;}
