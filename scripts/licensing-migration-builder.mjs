// Geradores SQL locais compartilhados pelo piloto e pelo ensaio da cópia real.
import {quote as literal,identifier} from './production-backup-tools.mjs';
export function buildOperationalMigration(metadata,selected,guardSql){
let sql=guardSql.replace(/^COMMIT;\s*$/m,'');const rewritten=[];
const modules={};for(const n of ['add_inventory_stock','adjust_inventory_stock','archive_product_lot','classify_untracked_stock','correct_stock_entry','create_product_lot','create_product_with_lots','create_product_with_crop','delete_product_lot','receive_product_lot','stock_write_request','update_product_details','update_product_lot','update_product_with_crop'])modules[n]=['inventory',true];
for(const n of ['save_atomic_operation','write_operation_request','create_operation_with_stock','update_operation_with_stock','delete_operation_with_stock','execute_field_recommendation'])modules[n]=['operations',true];
Object.assign(modules,{check_inventory_reconciliation:['inventory',false],get_write_audit_report:['maintenance',false],list_institution_users:['maintenance',false],list_active_invitations:['maintenance',false],import_precision_lab:['precision',true],copy_areas_to_new_season:['areas',true],save_area_geometry:['areas',true],update_season_status:['areas',true],get_area_map_summary:['maps',false],get_field_rainfall_totals:['rainfall',false],precision_satellite_bounds:['precision',false]});
const profileSelectors=new Set(['add_inventory_stock','adjust_inventory_stock','archive_product_lot','check_inventory_reconciliation','classify_untracked_stock','correct_stock_entry','create_product_lot','create_product_with_lots','delete_product_lot','execute_field_recommendation','get_write_audit_report','import_precision_lab','mutate_business_record','receive_product_lot','save_atomic_operation','stock_write_request','update_product_details','update_product_lot','update_season_status','write_operation_request','precision_satellite_bounds']);
for(const f of metadata.functions){let def=f.definition;
 if(profileSelectors.has(f.name)){
  def=def.replace(/SELECT\s+(?:p\.)?institution_id\s*,\s*(?:p\.)?is_admin\s+INTO\s+(\w+)\s*,\s*(\w+)\s+FROM\s+public\.user_profiles(?:\s+p)?\s+WHERE\s+(?:p\.)?id\s*=\s*(?:auth\.uid\(\)|v_user_id)\s*;/gi,(_,a,b)=>`SELECT licensing.current_institution(),licensing.current_institution_admin() INTO ${a},${b};`);
  def=def.replace(/SELECT\s+(?:p\.)?institution_id\s+INTO\s+(\w+)\s+FROM\s+public\.user_profiles(?:\s+p)?\s+WHERE\s+(?:p\.)?id\s*=\s*(?:auth\.uid\(\)|v_user_id|user_id|actor)(\s+AND\s+is_admin)?\s*;/gi,(_,a,admin)=>`SELECT licensing.current_institution() INTO ${a}${admin?' WHERE licensing.current_institution_admin()':''};`);
  def=def.replace(/SELECT\s+institution_id\s+FROM\s+public\.user_profiles\s+WHERE\s+id\s*=\s*auth\.uid\(\)/gi,'SELECT licensing.current_institution()');
 }
 if(f.name==='can_record_field_data')def=`CREATE OR REPLACE FUNCTION public.can_record_field_data(p_institution_id uuid,p_season_id uuid,p_area_id uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $b$ SELECT licensing.current_institution()=p_institution_id AND EXISTS(SELECT 1 FROM public.seasons WHERE id=p_season_id AND institution_id=p_institution_id) AND EXISTS(SELECT 1 FROM public.areas WHERE id=p_area_id AND institution_id=p_institution_id) $b$`;
 const rule=modules[f.name];if(rule&&/LANGUAGE plpgsql/i.test(def))def=def.replace(/\bBEGIN\b/i,`BEGIN\nPERFORM licensing.require_operational(${literal(rule[0])},${rule[1]});`);
 else if(rule&&/LANGUAGE sql\b/i.test(def)){
  const match=def.match(/\bAS\s+(\$[a-zA-Z_0-9]*\$)([\s\S]*)\1\s*;?\s*$/i);if(!match)throw Error('Corpo SQL não reconhecido: '+f.name);
  const query=match[2].trim().replace(/;\s*$/,''),setReturning=/RETURNS\s+(TABLE\b|SETOF\b)/i.test(def),voidResult=/RETURNS\s+void\b/i.test(def);
  if(voidResult){if(!/^UPDATE\b/i.test(query)||/\bRETURNING\b/i.test(query))throw Error('RPC SQL void exige revisão explícita: '+f.name);}
  else if(!setReturning&&!/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*(?:SELECT|WITH)\b/i.test(query))throw Error('RPC SQL escalar exige revisão explícita: '+f.name);
  const result=voidResult?query+';\nRETURN;':setReturning?'RETURN QUERY\n'+query+';':'RETURN (\n'+query+'\n);';
  const guarded=`AS ${match[1]}\nBEGIN\nPERFORM licensing.require_operational(${literal(rule[0])},${rule[1]});\n${result}\nEND\n${match[1]}`;
  def=def.slice(0,match.index).replace(/LANGUAGE sql\b/i,'LANGUAGE plpgsql')+guarded;
 }
 if(def!==f.definition){sql+='\n'+def+';\n';rewritten.push(f.name);}
}
const tables=metadata.tables.filter(t=>t.name!=='user_profiles'&&(t.columns.includes('institution_id')||['institutions','operation_products','product_lots','precision_lab_results'].includes(t.name)));
for(const t of tables){
 if(t.forced)throw Error('Tabela com FORCE RLS exige revisão explícita: '+t.name);
 const table='public.'+identifier(t.name),row=`to_jsonb(${identifier(t.name)})`,check=`licensing.operational_row_can(${literal(t.name)},${row},false)`,write=`licensing.operational_row_can(${literal(t.name)},${row},true)`;
 sql+=`\nCREATE TRIGGER agrigest_licensed_row_guard BEFORE INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION licensing_private.guard_operational_row();\nALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\n`;
 if(!t.rls)sql+=`CREATE POLICY licensed_legacy_surface ON ${table} TO authenticated USING(NOT licensing.operational_enrolled_row(${literal(t.name)},${row})) WITH CHECK(NOT licensing.operational_enrolled_row(${literal(t.name)},${row}));\n`;
 // Não amplia superfícies de UPDATE/DELETE que antes só existiam por RPC auditada.
 const commands=t.rls?new Set(metadata.policies.filter(p=>p.tablename===t.name).flatMap(p=>p.cmd==='ALL'?['SELECT','INSERT','UPDATE','DELETE']:[p.cmd])):new Set(['SELECT','INSERT','UPDATE','DELETE']);
 for(const [cmd,suffix] of [['SELECT','read'],['INSERT','insert'],['UPDATE','update'],['DELETE','delete']]){
  const expression=cmd==='SELECT'?check:write;sql+=`CREATE POLICY ${identifier('licensed_pilot_restrict_'+suffix)} ON ${table} AS RESTRICTIVE FOR ${cmd} TO authenticated `+(cmd==='INSERT'?`WITH CHECK(${expression})`:cmd==='UPDATE'?`USING(${expression}) WITH CHECK(${expression})`:`USING(${expression})`)+';\n';
  if(commands.has(cmd)){
   const enrolled=`licensing.operational_enrolled_row(${literal(t.name)},${row})`;
   sql+=`CREATE POLICY ${identifier('licensed_pilot_allow_'+suffix)} ON ${table} FOR ${cmd} TO authenticated `+(cmd==='INSERT'?`WITH CHECK(${enrolled} AND ${expression})`:cmd==='UPDATE'?`USING(${enrolled} AND ${expression}) WITH CHECK(${enrolled} AND ${expression})`:`USING(${enrolled} AND ${expression})`)+';\n';
  }
 }
}
const preserved=selected.members.filter(m=>m.id!==selected.owner.id).length,extras=Math.max(0,preserved-3);if(extras>100)throw Error('Capacidade legada exige revisão.');
sql+=`DO $seed$ DECLARE license uuid; organization uuid; BEGIN
 INSERT INTO licensing.licenses(owner_id,label,kind,period,status,extras,amount_minor,complimentary,test_mode) VALUES(${literal(selected.owner.id)}::uuid,${literal('PILOTO LOCAL / '+selected.institution.name)},'farm','monthly','active',${extras},0,true,true) RETURNING id INTO license;
 INSERT INTO licensing_private.organizations(license_id,name,kind,owner_id,operational_institution_id) VALUES(license,${literal(selected.institution.name)},'farm',${literal(selected.owner.id)}::uuid,${literal(selected.institution.id)}::uuid) RETURNING id INTO organization;
 INSERT INTO licensing_private.memberships(organization_id,user_id,role) SELECT organization,id,'administrator' FROM public.user_profiles WHERE institution_id=${literal(selected.institution.id)}::uuid AND id<>${literal(selected.owner.id)}::uuid;
 INSERT INTO licensing_private.operational_enrollments(institution_id,organization_id,enforce) VALUES(${literal(selected.institution.id)}::uuid,organization,false);
 INSERT INTO licensing.events(license_id,actor_id,action,details) VALUES(license,${literal(selected.owner.id)}::uuid,'pilot_ownership_confirmed',jsonb_build_object('institution_id',${literal(selected.institution.id)},'preserved_administrators',${preserved},'test_only',true,'courtesy_extras',${extras}));
END $seed$;\nCOMMIT;\n`;

return {sql,tables,rewritten,preserved,extras};
}

export function buildReceiptRefinement(functions,core){
let sql="BEGIN;DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;\n";

for(const name of ['licensing_private.active_institution','licensing_private.table_module','licensing_private.guard_operational_row','licensing.operational_module']) {
 const start=core.indexOf('CREATE FUNCTION '+name+'('),end=core.indexOf('CREATE FUNCTION ',start+16);
 if(start<0||end<0)throw Error('Função piloto não encontrada: '+name);
 sql+=core.slice(start,end).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
}
for(const f of functions){let d=f.definition.replaceAll('licensing_private.table_module(p_table)','licensing.operational_module(p_table)');if(d.includes('RECEIPT_FARM_SCOPE_MISMATCH')){if(d!==f.definition)sql+=d+';\n';continue;}
 const module=f.name==='stock_write_request'?"'inventory'":f.name==='write_operation_request'?"'operations'":'licensing.operational_module(p_table)';
 if(f.name==='mutate_business_record')d=d.replace(/\bBEGIN\b/i,`BEGIN\nPERFORM licensing.require_operational(${module},false);`);else d=d.replace(`PERFORM licensing.require_operational(${module},true);`,`PERFORM licensing.require_operational(${module},false);`);
 d=d.replace('IF FOUND THEN',"IF FOUND THEN\n    IF receipt.institution_id IS DISTINCT FROM institution THEN RAISE EXCEPTION 'RECEIPT_FARM_SCOPE_MISMATCH' USING ERRCODE='42501';END IF;");
 const marker=f.name==='stock_write_request'?'FOREACH key IN ARRAY':f.name==='write_operation_request'?'result:=public.save_atomic_operation(':'EXECUTE format(';
 if(!d.includes(marker))throw Error('Rotina exige revisão: '+f.name);d=d.replace(marker,`PERFORM licensing.require_operational(${module},true);\n  `+marker);sql+=d+';\n';
}
sql+='COMMIT;';
return sql;
}

export function buildOptimizedMap(original){
const match=original?.match(/AS \$function\$([\s\S]*)\$function\$/);if(!match||!/LANGUAGE sql/.test(original))throw Error('Consulta original inesperada.');
let query=match[1].trim();
for(const [before,after] of [['FROM operations o','FROM scoped_operations o'],['JOIN products p','JOIN scoped_products p'],['FROM areas a','FROM scoped_areas a'],['ST_AsGeoJSON(','public.ST_AsGeoJSON('],['ST_GeometryN(','public.ST_GeometryN(']]){
 if(!query.includes(before))throw Error('Trecho esperado ausente no mapa.');query=query.replaceAll(before,after);
}
const header=original.slice(0,original.indexOf('LANGUAGE sql'));
const sql=`BEGIN;DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_ONLY';END IF;END $$;
${header} LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $map$
DECLARE selected_farm uuid;BEGIN
 PERFORM licensing.require_operational('maps',false);selected_farm:=licensing.current_institution();
 IF selected_farm IS NULL OR NOT EXISTS(SELECT 1 FROM licensing_private.operational_enrollments WHERE institution_id=selected_farm AND enforce) THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.seasons s WHERE s.id=season_id_param AND s.institution_id=selected_farm) THEN RAISE EXCEPTION 'FARM_SCOPE_MISMATCH' USING ERRCODE='42501';END IF;
 RETURN QUERY WITH scoped_areas AS MATERIALIZED(SELECT a.* FROM public.areas a WHERE a.institution_id=selected_farm),
 scoped_operations AS MATERIALIZED(SELECT o.* FROM public.operations o WHERE o.institution_id=selected_farm AND o.season_id=season_id_param),
 scoped_products AS MATERIALIZED(SELECT p.* FROM public.products p WHERE p.institution_id=selected_farm)
 ${query}
END $map$;
REVOKE ALL ON FUNCTION public.get_area_map_summary(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_area_map_summary(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';COMMIT;`;

return sql;
}
