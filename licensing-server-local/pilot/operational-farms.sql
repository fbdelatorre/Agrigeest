-- Apenas leitura no piloto: lista fazendas operacionais autorizadas, mesmo se a
-- seleção anterior foi revogada. Não usa perfil nem altera o contexto da sessão.
BEGIN;
DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION licensing.operational_farms() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;BEGIN
 PERFORM licensing_private.team_actor();
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'institution_id',e.institution_id,'name',o.name,'active',licensing_private.license_live(o.license_id)) ORDER BY o.name,o.id),'[]') INTO result
 FROM licensing_private.organizations o JOIN licensing_private.operational_enrollments e ON e.organization_id=o.id AND e.enforce
 WHERE o.kind='farm' AND licensing.workspace_can(o.id,'areas',false);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION licensing.operational_farms() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.operational_farms() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
