BEGIN;

CREATE FUNCTION public.stock_write_request(p_request_id uuid,p_method text,p_args jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid; receipt public.record_write_receipts; result jsonb; request jsonb;
  current_quantity numeric; target record; number numeric; key text;
BEGIN
  SELECT institution_id INTO institution FROM public.user_profiles WHERE id=auth.uid();
  IF institution IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_method NOT IN ('add_inventory_stock','adjust_inventory_stock','receive_product_lot',
    'classify_untracked_stock','create_product_lot','update_product_lot','delete_product_lot','archive_product_lot',
    'create_product_with_lots','create_product_with_crop','update_product_details','update_product_with_crop')
    OR jsonb_typeof(p_args) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_STOCK_REQUEST'; END IF;
  request:=jsonb_build_object('method',p_method,'args',p_args);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  SELECT * INTO receipt FROM public.record_write_receipts WHERE request_id=p_request_id;
  IF FOUND THEN
    IF receipt.actor_id<>auth.uid() OR receipt.request<>request THEN RAISE EXCEPTION 'REQUEST_KEY_REUSED'; END IF;
    RETURN receipt.result;
  END IF;
  FOREACH key IN ARRAY ARRAY['p_quantity','p_target_quantity','p_unit_cost','p_price','p_min_stock_level','p_untracked_quantity'] LOOP
    IF p_args->>key IS NOT NULL THEN
      number:=(p_args->>key)::numeric;
      IF number::text IN ('NaN','Infinity','-Infinity') OR number<0 OR number>1e12 THEN RAISE EXCEPTION 'INVALID_NUMERIC_VALUE'; END IF;
    END IF;
  END LOOP;
  IF p_method='adjust_inventory_stock' AND p_args->>'p_expected_quantity' IS NOT NULL THEN
    SELECT * INTO target FROM public.products WHERE id=(p_args->>'p_product_id')::uuid AND institution_id=institution FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN'; END IF;
    IF NULLIF(p_args->>'p_lot_id','') IS NULL THEN
      SELECT target.quantity_in_stock-COALESCE(sum(quantity),0) INTO current_quantity FROM public.product_lots WHERE product_id=target.id;
    ELSE
      SELECT quantity INTO current_quantity FROM public.product_lots WHERE id=(p_args->>'p_lot_id')::uuid AND product_id=target.id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH'; END IF;
    END IF;
    IF current_quantity IS DISTINCT FROM (p_args->>'p_expected_quantity')::numeric THEN RAISE EXCEPTION 'RECORD_CONFLICT' USING ERRCODE='40001'; END IF;
  END IF;
  CASE p_method
    WHEN 'add_inventory_stock' THEN SELECT public.add_inventory_stock((p_args->>'p_product_id')::uuid,(p_args->>'p_quantity')::numeric,p_request_id::text,
      (p_args->>'p_lot_id')::uuid,p_args->>'p_reason',p_args->>'p_notes',(p_args->>'p_unit_cost')::numeric) INTO result;
    WHEN 'adjust_inventory_stock' THEN SELECT public.adjust_inventory_stock((p_args->>'p_product_id')::uuid,(p_args->>'p_target_quantity')::numeric,
      p_args->>'p_reason',p_request_id::text,(p_args->>'p_lot_id')::uuid,p_args->>'p_notes') INTO result;
    WHEN 'receive_product_lot' THEN SELECT public.receive_product_lot((p_args->>'p_product_id')::uuid,(p_args->>'p_quantity')::numeric,p_request_id::text,
      p_args->>'p_lot_number',(p_args->>'p_expiration_date')::date,p_args->>'p_reason',p_args->>'p_notes',(p_args->>'p_unit_cost')::numeric) INTO result;
    WHEN 'classify_untracked_stock' THEN SELECT public.classify_untracked_stock((p_args->>'p_product_id')::uuid,(p_args->>'p_quantity')::numeric,
      p_args->>'p_lot_number',(p_args->>'p_expiration_date')::date,p_args->>'p_notes') INTO result;
    WHEN 'create_product_lot' THEN SELECT to_jsonb(public.create_product_lot((p_args->>'p_product_id')::uuid,p_args->>'p_lot_number',
      (p_args->>'p_quantity')::numeric,(p_args->>'p_expiration_date')::date)) INTO result;
    WHEN 'update_product_lot' THEN SELECT to_jsonb(public.update_product_lot((p_args->>'p_lot_id')::uuid,p_args->>'p_lot_number',
      (p_args->>'p_quantity')::numeric,(p_args->>'p_expiration_date')::date,(p_args->>'p_expected_quantity')::numeric)) INTO result;
    WHEN 'delete_product_lot' THEN SELECT to_jsonb(public.delete_product_lot((p_args->>'p_lot_id')::uuid)) INTO result;
    WHEN 'archive_product_lot' THEN SELECT to_jsonb(public.archive_product_lot((p_args->>'p_lot_id')::uuid)) INTO result;
    WHEN 'create_product_with_lots' THEN SELECT public.create_product_with_lots(p_args->>'p_name',p_args->>'p_category',p_args->>'p_unit',
      (p_args->>'p_min_stock_level')::numeric,(p_args->>'p_price')::numeric,p_args->>'p_supplier',p_args->>'p_description',
      (p_args->>'p_untracked_quantity')::numeric,p_args->'p_lots') INTO result;
    WHEN 'create_product_with_crop' THEN SELECT public.create_product_with_crop(p_args->'p_product',p_args->>'p_crop') INTO result;
    WHEN 'update_product_details' THEN SELECT to_jsonb(public.update_product_details((p_args->>'p_product_id')::uuid,p_args->>'p_name',p_args->>'p_category',p_args->>'p_unit',
      (p_args->>'p_min_stock_level')::numeric,(p_args->>'p_price')::numeric,p_args->>'p_supplier',p_args->>'p_description',
      (p_args->>'p_expected_updated_at')::timestamptz)) INTO result;
    WHEN 'update_product_with_crop' THEN SELECT to_jsonb(public.update_product_with_crop(p_args->'p_product',p_args->>'p_crop')) INTO result;
  END CASE;
  INSERT INTO public.record_write_receipts(request_id,actor_id,institution_id,request,result)
    VALUES(p_request_id,auth.uid(),institution,request,COALESCE(result,'null'));
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.stock_write_request(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stock_write_request(uuid,text,jsonb) TO authenticated;

-- Correct physical entries by appending reversal/replacement movements. The
-- original movement is never edited or erased, and consumed stock cannot vanish.
CREATE FUNCTION public.correct_stock_entry(p_request_id uuid,p_movement_id uuid,p_quantity numeric,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid; admin boolean; original public.inventory_movements; product public.products;
  lot public.product_lots; delta numeric; request jsonb; receipt public.record_write_receipts;
  group_id uuid:=gen_random_uuid(); result jsonb;
BEGIN
  SELECT institution_id,is_admin INTO institution,admin FROM public.user_profiles WHERE id=auth.uid();
  IF institution IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity') OR abs(p_quantity)>1e12
    OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'INVALID_STOCK_CORRECTION'; END IF;
  request:=jsonb_build_object('movement',p_movement_id,'quantity',p_quantity,'reason',p_reason);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  SELECT * INTO receipt FROM public.record_write_receipts WHERE request_id=p_request_id;
  IF FOUND THEN
    IF receipt.actor_id<>auth.uid() OR receipt.request<>request THEN RAISE EXCEPTION 'REQUEST_KEY_REUSED'; END IF;
    RETURN receipt.result;
  END IF;
  SELECT * INTO original FROM public.inventory_movements WHERE id=p_movement_id AND institution_id=institution FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECORD_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF original.source_type NOT IN ('manual','receipt') OR original.movement_type NOT IN ('STOCK_IN','ADJUSTMENT_IN','ADJUSTMENT_OUT') THEN RAISE EXCEPTION 'INVALID_STOCK_CORRECTION'; END IF;
  IF original.movement_type<>'STOCK_IN' AND NOT COALESCE(admin,false) THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  IF original.movement_type='STOCK_IN' AND p_quantity<0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  IF EXISTS(SELECT 1 FROM public.inventory_movements WHERE reversal_of=original.id) THEN RAISE EXCEPTION 'RECORD_CONFLICT' USING ERRCODE='40001'; END IF;
  delta:=p_quantity-original.quantity;
  SELECT * INTO product FROM public.products WHERE id=original.product_id AND institution_id=institution FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF original.lot_id IS NOT NULL THEN
    SELECT * INTO lot FROM public.product_lots WHERE id=original.lot_id AND product_id=product.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH'; END IF;
    IF lot.quantity+delta<0 THEN RAISE EXCEPTION 'INSUFFICIENT_LOT_STOCK'; END IF;
  ELSIF delta<0 AND product.quantity_in_stock+delta<(SELECT COALESCE(sum(quantity),0) FROM public.product_lots WHERE product_id=product.id) THEN
    RAISE EXCEPTION 'INSUFFICIENT_UNTRACKED_STOCK';
  END IF;
  IF product.quantity_in_stock+delta<0 THEN RAISE EXCEPTION 'INSUFFICIENT_PRODUCT_STOCK'; END IF;
  UPDATE public.products SET quantity_in_stock=quantity_in_stock+delta,updated_at=clock_timestamp() WHERE id=product.id;
  IF lot.id IS NOT NULL THEN UPDATE public.product_lots SET quantity=quantity+delta,
    archived_at=CASE WHEN quantity+delta>0 THEN NULL ELSE archived_at END,
    archived_by=CASE WHEN quantity+delta>0 THEN NULL ELSE archived_by END,updated_at=clock_timestamp() WHERE id=lot.id; END IF;
  INSERT INTO public.inventory_movements(institution_id,product_id,lot_id,lot_number_snapshot,movement_group_id,movement_kind,movement_type,
    quantity,unit_snapshot,unit_cost,total_cost,reason,source_type,reversal_of,idempotency_key,created_by)
  VALUES(institution,product.id,original.lot_id,original.lot_number_snapshot,group_id,'PHYSICAL','REVERSAL',-original.quantity,
    original.unit_snapshot,original.unit_cost,-original.total_cost,p_reason,original.source_type,original.id,p_request_id||':reverse',auth.uid());
  IF p_quantity<>0 THEN
    INSERT INTO public.inventory_movements(institution_id,product_id,lot_id,lot_number_snapshot,movement_group_id,movement_kind,movement_type,
      quantity,unit_snapshot,unit_cost,total_cost,reason,source_type,idempotency_key,created_by)
    VALUES(institution,product.id,original.lot_id,original.lot_number_snapshot,group_id,'PHYSICAL',
      CASE WHEN original.movement_type='STOCK_IN' THEN 'STOCK_IN' WHEN p_quantity>0 THEN 'ADJUSTMENT_IN' ELSE 'ADJUSTMENT_OUT' END,
      p_quantity,original.unit_snapshot,original.unit_cost,p_quantity*original.unit_cost,p_reason,original.source_type,p_request_id||':replace',auth.uid());
  END IF;
  result:=jsonb_build_object('corrected',true,'movement_id',original.id,'delta',delta);
  INSERT INTO public.record_write_receipts(request_id,actor_id,institution_id,request,result) VALUES(p_request_id,auth.uid(),institution,request,result);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.correct_stock_entry(uuid,uuid,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_stock_entry(uuid,uuid,numeric,text) TO authenticated;

CREATE FUNCTION public.get_write_audit_report() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid; candidate public.operations; legacy jsonb:='[]';
BEGIN
  SELECT institution_id INTO institution FROM public.user_profiles WHERE id=auth.uid() AND is_admin;
  IF institution IS NULL THEN RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
  FOR candidate IN SELECT * FROM public.operations WHERE institution_id=institution AND status='active' LOOP
    BEGIN
      PERFORM public.previous_operation_stock(candidate);
    EXCEPTION WHEN OTHERS THEN
      legacy:=legacy||jsonb_build_array(jsonb_build_object('id',candidate.id,'description',candidate.description,'area_id',candidate.area_id));
    END;
  END LOOP;
  RETURN jsonb_build_object('stock_discrepancies',COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'total',total,'lots',lots,'ledger',ledger)) FROM (
      SELECT p.id,p.name,p.quantity_in_stock total,
        (SELECT COALESCE(sum(quantity),0) FROM public.product_lots WHERE product_id=p.id) lots,
        (SELECT COALESCE(sum(quantity),0) FROM public.inventory_movements WHERE product_id=p.id AND movement_kind='PHYSICAL') ledger
      FROM public.products p WHERE p.institution_id=institution
    ) s WHERE total<lots OR abs(total-ledger)>0.000001),'[]'),
    'legacy_nested_operations',legacy);
END $$;
REVOKE ALL ON FUNCTION public.get_write_audit_report() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_write_audit_report() TO authenticated;

COMMIT;
