import test from 'node:test';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {backupFolder,pg15WorkingCopy,copyBlocks,copyTableNames,restorePrivilegesSql} from '../scripts/production-backup-tools.mjs';
test('private backup ACL operations cannot target workspace, parent or arbitrary files',()=>{
 assert.equal(backupFolder('checks.local/production-backup-2026-11-26/abcdef123456'),resolve('checks.local/production-backup-2026-11-26/abcdef123456'));
 for(const path of ['.','checks.local','checks.local/production-backup-2026-11-26','checks.local/production-backup-2026-11-26/../outside','checks.local/production-backup-2026-11-26/abcdef123456/file'])assert.throws(()=>backupFolder(path),/PRIVATE_BACKUP_FOLDER/);
});

test('COPY comparison preserves empty field rows and escaped newlines',()=>{
 const blocks=copyBlocks('COPY "public"."t" ("body") FROM stdin;\n\nline\\ninside\n\\.\n');
 assert.deepEqual(blocks[0].rows,['','line\\ninside']);
});
test('PG15 compatibility changes only the unsupported session prelude, preserving SQL and COPY payload',()=>{
 const sql="SET transaction_timeout = 0;\nCREATE FUNCTION public.f() RETURNS text LANGUAGE sql AS $f$\nSET transaction_timeout = 0;\n$f$;\n";
 const converted=pg15WorkingCopy(sql);assert.equal(converted.sessionSettingsOmitted,1);assert.match(converted.sql,/\$f\$\nSET transaction_timeout = 0;/);
 assert.throws(()=>pg15WorkingCopy('\\restrict secret\nSELECT 1;'),/MATCHING_PSQL_VERSION_REQUIRED/);
 const dump='COPY "public"."records" ("body") FROM stdin;\nCOPY "public"."not_a_table" ("id") FROM stdin;\n\\.\nCOPY "auth"."users" ("id") FROM stdin;\n\\.\n';assert.deepEqual([...copyTableNames(dump)],['public.records','auth.users']);assert.throws(()=>copyTableNames('COPY "public"."t" ("id") FROM stdin;\n'),/INCOMPLETE_COPY_BLOCK/);
});
test('privilege recovery preserves owner, recipient and grant option and refuses unknown grant chains',()=>{
 const source={schemas:[{name:'public',owner:'postgres',grants:[['-','postgres','USAGE',false],['reader','postgres','CREATE',true]]}],defaults:[{owner:'postgres',schema:'public',type:'r',grants:[['reader','postgres','SELECT',false]]}]};
 const sql=restorePrivilegesSql(source,[{rolname:'postgres'},{rolname:'reader'}]);assert.match(sql,/GRANT USAGE ON SCHEMA "public" TO PUBLIC;/);assert.match(sql,/GRANT CREATE ON SCHEMA "public" TO "reader" WITH GRANT OPTION;/);assert.match(sql,/ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT SELECT ON TABLES TO "reader";/);
 assert.throws(()=>restorePrivilegesSql({schemas:[{name:'public',owner:'postgres',grants:[['reader','different','USAGE',false]]}],defaults:[]},[]),/GRANT_CHAIN_REVIEW_REQUIRED/);
});
