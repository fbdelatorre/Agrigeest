DO $migration$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'delete_operation_with_stock';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'delete_operation_with_stock not found';
  END IF;

  IF position('SELECT status INTO v_updated_count FROM public.operations' in v_def) = 0 THEN
    RETURN;
  END IF;

  v_new := replace(v_def, 'v_updated_count uuid;', E'v_updated_count uuid;\n  v_status text;');
  v_new := replace(v_new, 'SELECT status INTO v_updated_count FROM public.operations', 'SELECT status INTO v_status FROM public.operations');
  v_new := replace(v_new, '-- v_updated_count is int but we used it for status check above, fix:', '-- status check');

  EXECUTE v_new;
END
$migration$;