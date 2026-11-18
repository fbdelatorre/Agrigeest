BEGIN;

-- Stable client IDs allow safe retries after a lost response.
-- Existing INSERT policies still validate the authenticated user and all references.
GRANT INSERT (id) ON public.field_monitoring_reports TO authenticated;
GRANT INSERT (id) ON public.field_recommendations TO authenticated;
GRANT INSERT (id) ON public.field_rainfall TO authenticated;

COMMIT;
