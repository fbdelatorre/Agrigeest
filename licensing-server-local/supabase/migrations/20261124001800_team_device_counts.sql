-- Contagem por pessoa e licença. Não modifica autorizações nem dados cadastrados.
BEGIN;
ALTER FUNCTION licensing.workspace_team(uuid) RENAME TO workspace_team_before_device_counts;
ALTER FUNCTION licensing.workspace_team_before_device_counts(uuid) SET SCHEMA licensing_private;
REVOKE ALL ON FUNCTION licensing_private.workspace_team_before_device_counts(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION licensing.workspace_team(p_org uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;organization licensing_private.organizations;members jsonb;owner_count integer;BEGIN
 result:=licensing_private.workspace_team_before_device_counts(p_org);
 SELECT * INTO organization FROM licensing_private.organizations WHERE id=p_org;
 SELECT count(*) INTO owner_count FROM licensing_private.devices d WHERE d.license_id=organization.license_id AND d.user_id=organization.owner_id AND d.revoked_at IS NULL AND licensing_private.device_was_approved(d.id);
 SELECT COALESCE(jsonb_agg(x.item||jsonb_build_object('authorized_devices',CASE WHEN m.revoked_at IS NOT NULL THEN 0 ELSE
  (SELECT count(*) FROM licensing_private.devices d WHERE d.license_id=organization.license_id AND d.user_id=m.user_id AND d.revoked_at IS NULL AND licensing_private.device_was_approved(d.id)) END) ORDER BY x.ord),'[]') INTO members
 FROM jsonb_array_elements(result->'members') WITH ORDINALITY x(item,ord) JOIN licensing_private.memberships m ON m.id=(x.item->>'id')::uuid AND m.organization_id=p_org;
 RETURN result||jsonb_build_object('owner_authorized_devices',owner_count,'members',members);
END $$;
REVOKE ALL ON FUNCTION licensing.workspace_team(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.workspace_team(uuid) TO authenticated;
COMMIT;
