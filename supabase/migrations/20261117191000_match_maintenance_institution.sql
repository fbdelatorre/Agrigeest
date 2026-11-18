BEGIN;

DROP POLICY IF EXISTS maintenance_machine_matches_institution_on_insert ON public.maintenances;
CREATE POLICY maintenance_machine_matches_institution_on_insert ON public.maintenances
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.machinery m WHERE m.id = maintenances.machinery_id AND m.institution_id = maintenances.institution_id)
  AND EXISTS (SELECT 1 FROM public.maintenance_types t WHERE t.id = maintenances.maintenance_type_id AND t.institution_id = maintenances.institution_id)
);

DROP POLICY IF EXISTS maintenance_machine_matches_institution_on_update ON public.maintenances;
CREATE POLICY maintenance_machine_matches_institution_on_update ON public.maintenances
AS RESTRICTIVE FOR UPDATE TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.machinery m WHERE m.id = maintenances.machinery_id AND m.institution_id = maintenances.institution_id)
  AND EXISTS (SELECT 1 FROM public.maintenance_types t WHERE t.id = maintenances.maintenance_type_id AND t.institution_id = maintenances.institution_id)
);

COMMIT;
