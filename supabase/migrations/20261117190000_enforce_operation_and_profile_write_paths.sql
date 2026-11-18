BEGIN;

-- The app uses authorized RPCs for operations, stock changes and profile creation.
-- Preserve product deletion and the existing column grants for profile editing.
REVOKE INSERT, UPDATE, DELETE ON public.operations FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE ON public.products FROM PUBLIC, anon, authenticated;
REVOKE INSERT, DELETE ON public.user_profiles FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_operation_date_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.start_date IS NOT DISTINCT FROM OLD.start_date
       AND NEW.end_date IS NOT DISTINCT FROM OLD.end_date THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'OPERATION_DATES_OUT_OF_ORDER' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_operation_date_order() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_operation_date_order ON public.operations;
CREATE TRIGGER guard_operation_date_order
BEFORE INSERT OR UPDATE OF start_date, end_date ON public.operations
FOR EACH ROW EXECUTE FUNCTION public.guard_operation_date_order();

COMMIT;
