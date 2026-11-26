import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {buildOperationalMigration,buildReceiptRefinement} from '../scripts/licensing-migration-builder.mjs';
const selected={owner:{id:'00000000-0000-4000-8000-000000000001'},institution:{id:'00000000-0000-4000-8000-000000000002',name:'Fazenda confirmada'},members:[]};
const metadata=functions=>({functions,tables:[],policies:[]});
test('SQL map RPC checks module permission before returning accessible areas',()=>{
 const f={name:'get_area_map_summary',definition:'CREATE OR REPLACE FUNCTION public.get_area_map_summary(p uuid) RETURNS TABLE(area_id uuid) LANGUAGE sql STABLE AS $f$ SELECT a.id FROM public.areas a; $f$;'};
 const r=buildOperationalMigration(metadata([f]),selected,'BEGIN;\nCOMMIT;');assert.match(r.sql,/LANGUAGE plpgsql STABLE/);assert.match(r.sql,/PERFORM licensing.require_operational\('maps',false\);\nRETURN QUERY\nSELECT a.id/);
});
test('scalar and void SQL RPCs retain their original statement after authorization',()=>{
 const r=buildOperationalMigration(metadata([{name:'create_operation_with_stock',definition:'CREATE FUNCTION public.create_operation_with_stock() RETURNS jsonb LANGUAGE sql AS $$ SELECT public.save_atomic_operation(); $$;'},{name:'save_area_geometry',definition:'CREATE FUNCTION public.save_area_geometry() RETURNS void LANGUAGE sql AS $$ UPDATE public.areas SET geometry=NULL; $$;'}]),selected,'BEGIN;\nCOMMIT;');
 assert.match(r.sql,/require_operational\('operations',true\);\nRETURN \(/);assert.match(r.sql,/require_operational\('areas',true\);\nUPDATE public.areas SET geometry=NULL;\nRETURN;/);
});
test('receipt edits call only the public mapping wrapper while private functions stay closed',async()=>{
 const core=await readFile('licensing-server-local/pilot/operational-guard.sql','utf8');
 const f={name:'mutate_business_record',definition:"CREATE FUNCTION public.mutate_business_record(p_table text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM licensing.require_operational(licensing_private.table_module(p_table),false);RAISE EXCEPTION 'RECEIPT_FARM_SCOPE_MISMATCH';END $$;"};
 const sql=buildReceiptRefinement([f],core);assert.match(sql,/CREATE OR REPLACE FUNCTION licensing.operational_module/);assert.match(sql,/GRANT EXECUTE ON FUNCTION licensing.operational_module\(text\) TO authenticated/);assert.match(sql,/require_operational\(licensing.operational_module\(p_table\),false\)/);assert.doesNotMatch(sql,/require_operational\(licensing_private.table_module\(p_table\)/);
 assert.match(core,/REVOKE ALL ON FUNCTION licensing_private.enrolled[\s\S]*licensing_private.table_module\(text\)/);
});
