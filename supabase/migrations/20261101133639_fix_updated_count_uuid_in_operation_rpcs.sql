/*
# Fix UUID type mismatch in operation stock RPCs

1. Problem
- create_operation_with_stock, update_operation_with_stock and delete_operation_with_stock
  declared a helper variable `v_updated_count` as integer, but use it in
  `RETURNING id INTO v_updated_count`, where `id` is a UUID.
- Any attempt to save an operation failed with "invalid input syntax for type integer".

2. Change
- Each function body is re-created with the variable declared as `uuid` instead of `int`.
- Nothing else in the function bodies is modified.

3. Security
- Function signatures, SECURITY DEFINER setting, search_path and EXECUTE grants are preserved
  because CREATE OR REPLACE keeps existing privileges.

4. Notes
- Idempotent: re-running finds no `v_updated_count int;` declaration left and does nothing.
- No data is changed.
*/

DO $$
DECLARE
  fn record;
  v_def text;
BEGIN
  FOR fn IN
    SELECT p.oid
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'create_operation_with_stock',
        'update_operation_with_stock',
        'delete_operation_with_stock'
      )
  LOOP
    v_def := pg_get_functiondef(fn.oid);
    IF position('v_updated_count int;' IN v_def) > 0 THEN
      EXECUTE replace(v_def, 'v_updated_count int;', 'v_updated_count uuid;');
    END IF;
  END LOOP;
END $$;
