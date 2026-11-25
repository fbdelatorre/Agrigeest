-- Consulta exclusiva do piloto. Não modifica vínculos, licenças ou autorizações.
BEGIN;
DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;
CREATE OR REPLACE FUNCTION licensing.operational_device_licenses() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid; farm licensing_private.organizations; result jsonb;BEGIN
 institution:=licensing.current_institution();
 SELECT o.* INTO farm FROM licensing_private.organizations o JOIN licensing_private.operational_enrollments e ON e.organization_id=o.id WHERE e.institution_id=institution AND e.enforce;
 IF farm.id IS NULL OR NOT licensing.workspace_can(farm.id,'areas',false) THEN RAISE EXCEPTION 'FARM_ACCESS_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'kind',o.kind,'license_id',o.license_id,'owner',o.owner_id=auth.uid()) ORDER BY (o.id=farm.id) DESC,o.name,o.id),'[]') INTO result
 FROM licensing_private.organizations o LEFT JOIN licensing_private.memberships m ON m.organization_id=o.id AND m.user_id=auth.uid() AND m.revoked_at IS NULL
 WHERE (o.owner_id=auth.uid() OR m.id IS NOT NULL) AND
 (o.id=farm.id OR (o.kind='consultancy' AND (o.owner_id=farm.owner_id OR EXISTS(SELECT 1 FROM licensing_private.farm_consultants g WHERE g.farm_id=farm.id AND g.consultancy_id=o.id AND g.revoked_at IS NULL))
 AND (o.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM licensing_private.farm_delegations d WHERE d.membership_id=m.id AND d.farm_id=farm.id AND
 ((d.grant_id IS NULL AND o.owner_id=farm.owner_id) OR EXISTS(SELECT 1 FROM licensing_private.farm_consultants g WHERE g.id=d.grant_id AND g.farm_id=farm.id AND g.consultancy_id=o.id AND g.revoked_at IS NULL))))));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION licensing.operational_device_licenses() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.operational_device_licenses() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
