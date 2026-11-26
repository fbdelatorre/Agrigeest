import {resolve,sep} from 'node:path';import {spawnSync} from 'node:child_process';import {readdirSync} from 'node:fs';
export function backupFolder(folder){const root=resolve('checks.local/production-backup-2026-11-26');const value=resolve(folder);if(!value.startsWith(root+sep)||!/^[a-f0-9]{12}$/.test(value.slice(root.length+1)))throw Error('PRIVATE_BACKUP_FOLDER_REQUIRED');return value;}
export function protectBackupFolder(folder){
 backupFolder(folder);if(process.platform!=='win32')return;
 const who=spawnSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}),sid=who.stdout?.match(/S-1-5-[0-9-]+/)?.[0];if(who.status!==0||!sid)throw Error('BACKUP_OWNER_REQUIRED');
 const r=spawnSync('icacls',[folder,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error('BACKUP_ACL_FAILED');
 // Os arquivos herdam os três acessos da pasta; não remover a herança de cada arquivo.
 if(readdirSync(folder).length){const children=spawnSync('icacls',[folder+sep+'*','/reset','/T','/C'],{encoding:'utf8',windowsHide:true});if(children.status!==0)throw Error('BACKUP_CHILD_ACL_FAILED');}
}
export function quote(value){return "'"+String(value).replace(/'/g,"''")+"'";}
export function identifier(value){return '"'+String(value).replace(/"/g,'""')+'"';}
export function qualified(value){const parts=value.split('.');if(parts.length!==2||parts.some(p=>!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(p)))throw Error('UNEXPECTED_DATABASE_IDENTIFIER');return parts.map(identifier).join('.');}
export function pg15WorkingCopy(sql){
 if(/^\\(?:restrict|unrestrict)\b/m.test(sql))throw Error('MATCHING_PSQL_VERSION_REQUIRED');
 const lines=sql.split('\n');let prelude=true,removed=0;
 const result=lines.map(line=>{if(/^(CREATE|ALTER|COPY|INSERT|DO)\b/i.test(line))prelude=false;if(prelude&&/^SET transaction_timeout = 0;\r?$/.test(line)){removed++;return '-- transaction_timeout: omitido apenas na cópia de trabalho PostgreSQL 15';}return line;}).join('\n');
 return {sql:result,sessionSettingsOmitted:removed};
}
export function copyBlocks(sql){
 const blocks=[];let current;
 for(const line of sql.split(/\r?\n/)){if(current){if(line==='\\.'){blocks.push(current);current=undefined;}else current.rows.push(line);continue;}const match=line.match(/^COPY "([^"]+)"\."([^"]+)" \([^\n]*\) FROM stdin;$/);if(match)current={table:match[1]+'.'+match[2],header:line,rows:[]};}
 if(current)throw Error('INCOMPLETE_COPY_BLOCK');return blocks;
}
export function copyTableNames(sql){return new Set(copyBlocks(sql).map(b=>b.table));}
export function restorePrivilegesSql(security,roles){
 const recipient=r=>r==='-'||r==='public'?'PUBLIC':identifier(r),types={r:'TABLES',S:'SEQUENCES',f:'FUNCTIONS',T:'TYPES'};let sql='BEGIN;';
 const grantees=new Set(['-',...roles.map(r=>r.rolname)]);
 for(const schema of security.schemas){
  for(const r of grantees)sql+='REVOKE ALL ON SCHEMA '+identifier(schema.name)+' FROM '+recipient(r)+';';
  for(const g of schema.grants??[]){if(g[1]!==schema.owner||!/^[A-Z ]+$/.test(g[2]))throw Error('GRANT_CHAIN_REVIEW_REQUIRED');sql+='GRANT '+g[2]+' ON SCHEMA '+identifier(schema.name)+' TO '+recipient(g[0])+(g[3]?' WITH GRANT OPTION':'')+';';}
 }
 for(const d of security.defaults){
  const type=types[d.type];if(!type)throw Error('DEFAULT_PRIVILEGE_TYPE_REQUIRES_REVIEW');const prefix='ALTER DEFAULT PRIVILEGES FOR ROLE '+identifier(d.owner)+(d.schema?' IN SCHEMA '+identifier(d.schema):'');
  for(const r of grantees)sql+=prefix+' REVOKE ALL ON '+type+' FROM '+recipient(r)+';';
  for(const g of d.grants??[]){if(g[1]!==d.owner||!/^[A-Z ]+$/.test(g[2]))throw Error('GRANT_CHAIN_REVIEW_REQUIRED');sql+=prefix+' GRANT '+g[2]+' ON '+type+' TO '+recipient(g[0])+(g[3]?' WITH GRANT OPTION':'')+';';}
 }
 return sql+'COMMIT;';
}
