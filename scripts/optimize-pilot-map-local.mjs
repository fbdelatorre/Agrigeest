import {readFile,writeFile} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import {join} from 'node:path';
if(process.argv[2]!=='--local-only')throw Error('Use --local-only.');
const base='checks.local/licensing-local/operational-bridge-2026-11-24',c=JSON.parse(await readFile(join(base,'pilot-context.local.json'),'utf8'));
if(c.container!=='supabase_db_agrigest-compat15-local'||!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(c.database))throw Error('Destino inválido.');
const inventory=JSON.parse(await readFile(join(base,'inventory.private.json'),'utf8')),original=inventory.functions.find(f=>f.name==='get_area_map_summary')?.definition;
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
await writeFile(join(c.folder,'optimized-map.private.sql'),sql);
const r=spawnSync(join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe'),['exec','-i','-e','PGPASSWORD',c.container,'psql','-X','-w','-q','-U','supabase_admin','-d',c.database,'-v','ON_ERROR_STOP=1'],{input:sql,env:{...process.env,PGPASSWORD:'postgres'},encoding:'utf8',windowsHide:true});
await writeFile(join(c.folder,'optimized-map.log'),r.stdout+r.stderr);if(r.status!==0)throw Error('Otimização local falhou e foi revertida.');console.log('PASS: consulta do mapa filtrada uma vez por fazenda e safra, com acesso verificado no servidor.');
