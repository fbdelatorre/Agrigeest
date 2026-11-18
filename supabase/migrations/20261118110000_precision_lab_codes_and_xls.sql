BEGIN;
ALTER TABLE public.precision_samples
  ADD COLUMN lab_code text CHECK (lab_code IS NULL OR lab_code ~ '^[A-Z0-9][A-Z0-9._/-]{0,47}$' AND lab_code !~ '^AG-[0-9A-F]{32}$');
CREATE UNIQUE INDEX precision_samples_lab_code_unique ON public.precision_samples (institution_id, lab_code)
  WHERE lab_code IS NOT NULL;
GRANT INSERT (lab_code) ON public.precision_samples TO authenticated;
ALTER TABLE public.precision_lab_results ADD COLUMN original_parameter text;
CREATE UNIQUE INDEX precision_lab_result_original_cell ON public.precision_lab_results(import_id,source,reported_code,original_parameter)
 WHERE original_parameter IS NOT NULL;

CREATE OR REPLACE FUNCTION public.import_precision_lab(p_filename text, p_file text, p_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  tenant uuid;
  digest bytea;
  original bytea;
  report_id uuid;
  item record;
  target public.precision_samples;
  saved integer := 0;
BEGIN
  SELECT p.institution_id INTO tenant FROM public.user_profiles p WHERE p.id = actor;
  IF tenant IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF p_filename IS NULL OR length(p_filename) NOT BETWEEN 1 AND 255 OR p_filename !~* '\.(xlsx|xls|csv)$'
    OR p_file IS NULL OR length(p_file) NOT BETWEEN 1 AND 2800000
    OR jsonb_typeof(p_results) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_LAB_IMPORT'; END IF;
  IF jsonb_array_length(p_results) NOT BETWEEN 1 AND 2000 OR octet_length(p_results::text) > 2000000
    THEN RAISE EXCEPTION 'INVALID_LAB_ROWS'; END IF;
  original := decode(p_file, 'base64');
  IF p_filename ~* '\.xlsx$' AND substring(original FROM 1 FOR 4) <> decode('504b0304','hex')
    THEN RAISE EXCEPTION 'INVALID_LAB_FILE'; END IF;
  IF p_filename ~* '\.xls$' AND substring(original FROM 1 FOR 8) <> decode('d0cf11e0a1b11ae1','hex')
    THEN RAISE EXCEPTION 'INVALID_LAB_FILE'; END IF;
  digest := sha256(original);
  INSERT INTO public.precision_lab_imports(institution_id, created_by, filename, content_sha256, file_base64)
  VALUES (tenant, actor, p_filename, digest, p_file)
  ON CONFLICT (institution_id, content_sha256) DO NOTHING RETURNING id INTO report_id;
  IF report_id IS NULL THEN
    SELECT i.id INTO report_id FROM public.precision_lab_imports i WHERE i.institution_id = tenant AND i.content_sha256 = digest;
  END IF;

  FOR item IN SELECT * FROM jsonb_to_recordset(p_results) AS x(
    sample_id uuid, parameter text, original_parameter text, value numeric, original_value text,
    unit text, method text, material text, source text, reported_code text, manually_matched boolean)
  LOOP
    SELECT s.* INTO target FROM public.precision_samples s WHERE s.id = item.sample_id AND s.institution_id = tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'SAMPLE_NOT_FOUND_OR_FORBIDDEN'; END IF;
    IF item.parameter IS NULL OR length(btrim(item.parameter)) NOT BETWEEN 1 AND 150
      OR item.value IS NULL OR NOT (abs(item.value) <= 1000000000000)
      OR item.original_value IS NULL OR length(item.original_value) NOT BETWEEN 1 AND 200
      OR length(coalesce(item.original_parameter,'')) > 150
      OR item.source IS NULL OR length(item.source) NOT BETWEEN 1 AND 300
      OR length(coalesce(item.unit,'')) > 100 OR length(coalesce(item.method,'')) > 180
      OR length(coalesce(item.material,'')) > 100 OR length(coalesce(item.reported_code,'')) > 160
      OR (NOT coalesce(item.manually_matched,false) AND upper(btrim(coalesce(item.reported_code,''))) NOT IN (target.code, coalesce(target.lab_code,target.code)))
      THEN RAISE EXCEPTION 'INVALID_LAB_RESULT'; END IF;
    INSERT INTO public.precision_lab_results(sample_id,import_id,created_by,parameter,original_parameter,value,original_value,unit,method,material,source,reported_code,manually_matched)
    VALUES (target.id,report_id,actor,btrim(item.parameter),coalesce(nullif(btrim(item.original_parameter),''),btrim(item.parameter)),item.value,item.original_value,coalesce(btrim(item.unit),''),
      coalesce(btrim(item.method),''),coalesce(btrim(item.material),''),item.source,coalesce(item.reported_code,''),coalesce(item.manually_matched,false))
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      saved := saved + 1;
      UPDATE public.precision_samples SET status = 'received' WHERE id = target.id AND status IN ('collected','sent','awaiting');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('import_id',report_id,'saved',saved);
END;
$$;
REVOKE ALL ON FUNCTION public.import_precision_lab(text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_precision_lab(text,text,jsonb) TO authenticated;
COMMIT;
