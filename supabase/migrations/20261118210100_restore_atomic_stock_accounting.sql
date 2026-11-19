BEGIN;

CREATE FUNCTION public.normalize_operation_stock(p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE item jsonb; allocation jsonb; result jsonb:='[]'; quantity numeric; total numeric; allocated numeric; seen text[]; source text;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>200 THEN RAISE EXCEPTION 'INVALID_PRODUCTS_USED'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item->>'productId' IS NULL THEN RAISE EXCEPTION 'INVALID_PRODUCTS_USED'; END IF;
    PERFORM (item->>'productId')::uuid;
    quantity:=(item->>'quantity')::numeric;
    IF quantity IS NULL OR quantity::text IN ('NaN','Infinity','-Infinity') OR quantity<=0 OR quantity>1e12 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
    IF item->>'dose' IS NOT NULL AND ((item->>'dose')::numeric<0 OR (item->>'dose')::numeric::text IN ('NaN','Infinity','-Infinity')) THEN RAISE EXCEPTION 'INVALID_DOSE'; END IF;
    IF item ? 'lotAllocations' THEN
      IF jsonb_typeof(item->'lotAllocations') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'lotAllocations') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_LOT_ALLOCATIONS'; END IF;
      total:=0; seen:=ARRAY[]::text[];
      FOR allocation IN SELECT * FROM jsonb_array_elements(item->'lotAllocations') LOOP
        allocated:=(allocation->>'quantity')::numeric;
        source:=COALESCE(NULLIF(allocation->>'lotId',''),'untracked');
        IF allocated IS NULL OR allocated::text IN ('NaN','Infinity','-Infinity') OR allocated<=0 OR allocated>1e12 THEN RAISE EXCEPTION 'INVALID_LOT_ALLOCATIONS'; END IF;
        IF source=ANY(seen) THEN RAISE EXCEPTION 'DUPLICATE_LOT_ALLOCATION'; END IF;
        seen:=array_append(seen,source);
        IF source<>'untracked' THEN PERFORM source::uuid; END IF;
        total:=total+allocated;
        result:=result || jsonb_build_array((item-'lotAllocations'-'lotId') || jsonb_build_object('lotId',NULLIF(source,'untracked'),'quantity',allocated));
      END LOOP;
      IF abs(total-quantity)>0.000001 THEN RAISE EXCEPTION 'LOT_ALLOCATION_TOTAL_MISMATCH'; END IF;
    ELSE
      IF NULLIF(item->>'lotId','') IS NOT NULL THEN PERFORM (item->>'lotId')::uuid; END IF;
      result:=result || jsonb_build_array((item-'lotAllocations') || jsonb_build_object('lotId',NULLIF(item->>'lotId','')));
    END IF;
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.normalize_operation_stock(jsonb) FROM PUBLIC,anon,authenticated;

-- Resolve the actual previous debit from unreversed ledger entries. Ambiguous
-- legacy nested allocations are never inferred from today's lot balances.
CREATE OR REPLACE FUNCTION public.previous_operation_stock(p_operation public.operations) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actual jsonb; expected jsonb; actual_totals jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('productId',m.product_id,'lotId',m.lot_id,'quantity',-m.quantity)) INTO actual
    FROM public.inventory_movements m WHERE m.operation_id=p_operation.id AND m.institution_id=p_operation.institution_id
      AND m.movement_type='OPERATION_CONSUMPTION' AND NOT EXISTS(SELECT 1 FROM public.inventory_movements r WHERE r.reversal_of=m.id);
  IF actual IS NOT NULL THEN
    SELECT jsonb_object_agg(product,quantity) INTO expected FROM (
      SELECT (x->>'productId')||'|'||COALESCE(NULLIF(x->>'lotId',''),'') product,sum((x->>'quantity')::numeric) quantity
      FROM jsonb_array_elements(public.normalize_operation_stock(COALESCE(p_operation.products_used,'[]'))) x GROUP BY 1) s;
    SELECT jsonb_object_agg(product,quantity) INTO actual_totals FROM (
      SELECT (x->>'productId')||'|'||COALESCE(NULLIF(x->>'lotId',''),'') product,sum((x->>'quantity')::numeric) quantity FROM jsonb_array_elements(actual) x GROUP BY 1) s;
    IF expected IS DISTINCT FROM actual_totals THEN RAISE EXCEPTION 'LEGACY_STOCK_REVIEW_REQUIRED'; END IF;
    RETURN actual;
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(p_operation.products_used,'[]')) x WHERE x ? 'lotAllocations')
    THEN RAISE EXCEPTION 'LEGACY_STOCK_REVIEW_REQUIRED'; END IF;
  RETURN public.normalize_operation_stock(COALESCE(p_operation.products_used,'[]'));
END $$;
REVOKE ALL ON FUNCTION public.previous_operation_stock(public.operations) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.apply_operation_stock(p_operation public.operations,p_old jsonb,p_new jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE product record; line record; lot record; movement record; before_total numeric; tracked numeric;
  old_quantity numeric; new_quantity numeric; old_untracked numeric; new_untracked numeric;
  delta numeric; ledger boolean; group_id uuid:=gen_random_uuid(); has_movements boolean;
BEGIN
  -- Product locks always precede lot locks and use a deterministic order.
  FOR product IN SELECT DISTINCT (x->>'productId')::uuid id FROM jsonb_array_elements(p_old||p_new) x ORDER BY 1 LOOP
    SELECT quantity_in_stock INTO before_total FROM public.products
      WHERE id=product.id AND institution_id=p_operation.institution_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'HISTORICAL_PRODUCT_UNAVAILABLE'; END IF;
  END LOOP;
  FOR line IN SELECT DISTINCT NULLIF(x->>'lotId','')::uuid id,(x->>'productId')::uuid product_id
    FROM jsonb_array_elements(p_old||p_new) x WHERE NULLIF(x->>'lotId','') IS NOT NULL ORDER BY 1,2 LOOP
    PERFORM 1 FROM public.product_lots WHERE id=line.id AND product_id=line.product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LOT_NOT_FOUND_OR_MISMATCH'; END IF;
  END LOOP;
  FOR product IN SELECT DISTINCT (x->>'productId')::uuid id FROM jsonb_array_elements(p_old||p_new) x ORDER BY 1 LOOP
    SELECT quantity_in_stock INTO before_total FROM public.products WHERE id=product.id;
    SELECT COALESCE(sum(quantity),0) INTO tracked FROM public.product_lots WHERE product_id=product.id;
    SELECT COALESCE(sum((x->>'quantity')::numeric),0),COALESCE(sum((x->>'quantity')::numeric) FILTER(WHERE NULLIF(x->>'lotId','') IS NULL),0)
      INTO old_quantity,old_untracked FROM jsonb_array_elements(p_old) x WHERE (x->>'productId')::uuid=product.id;
    SELECT COALESCE(sum((x->>'quantity')::numeric),0),COALESCE(sum((x->>'quantity')::numeric) FILTER(WHERE NULLIF(x->>'lotId','') IS NULL),0)
      INTO new_quantity,new_untracked FROM jsonb_array_elements(p_new) x WHERE (x->>'productId')::uuid=product.id;
    IF new_untracked-old_untracked>0 AND before_total-tracked < new_untracked-old_untracked THEN RAISE EXCEPTION 'INSUFFICIENT_UNTRACKED_STOCK'; END IF;
    IF before_total+old_quantity-new_quantity<0 THEN RAISE EXCEPTION 'INSUFFICIENT_PRODUCT_STOCK'; END IF;
    UPDATE public.products SET quantity_in_stock=quantity_in_stock+old_quantity-new_quantity,updated_at=clock_timestamp()
      WHERE id=product.id AND old_quantity<>new_quantity;
  END LOOP;
  FOR line IN SELECT (x->>'lotId')::uuid id,(x->>'productId')::uuid product_id,
    sum(amount) difference FROM (
      SELECT x,(x->>'quantity')::numeric amount FROM jsonb_array_elements(p_old) x
      UNION ALL SELECT x,-(x->>'quantity')::numeric FROM jsonb_array_elements(p_new) x
    ) s WHERE NULLIF(x->>'lotId','') IS NOT NULL GROUP BY 1,2 ORDER BY 1,2 LOOP
    SELECT * INTO lot FROM public.product_lots WHERE id=line.id AND product_id=line.product_id;
    IF line.difference<0 AND lot.archived_at IS NOT NULL THEN RAISE EXCEPTION 'LOT_ARCHIVED'; END IF;
    IF lot.quantity+line.difference<0 THEN RAISE EXCEPTION 'INSUFFICIENT_LOT_STOCK'; END IF;
    UPDATE public.product_lots SET quantity=quantity+line.difference,
      archived_at=CASE WHEN quantity+line.difference>0 THEN NULL ELSE archived_at END,
      archived_by=CASE WHEN quantity+line.difference>0 THEN NULL ELSE archived_by END,updated_at=clock_timestamp()
      WHERE id=line.id AND line.difference<>0;
  END LOOP;
  SELECT opening_balance_complete INTO ledger FROM public.institution_ledger_config WHERE institution_id=p_operation.institution_id;
  IF NOT COALESCE(ledger,false) THEN RETURN; END IF;
  has_movements:=false;
  FOR movement IN SELECT m.* FROM public.inventory_movements m WHERE m.operation_id=p_operation.id
    AND m.institution_id=p_operation.institution_id AND m.movement_type='OPERATION_CONSUMPTION'
    AND NOT EXISTS(SELECT 1 FROM public.inventory_movements r WHERE r.reversal_of=m.id) ORDER BY m.id LOOP
    has_movements:=true;
    INSERT INTO public.inventory_movements(institution_id,product_id,lot_id,lot_number_snapshot,operation_id,movement_group_id,
      movement_kind,movement_type,quantity,unit_snapshot,unit_cost,total_cost,reason,source_type,reversal_of,idempotency_key,created_by)
    VALUES(movement.institution_id,movement.product_id,movement.lot_id,movement.lot_number_snapshot,p_operation.id,group_id,
      'PHYSICAL','REVERSAL',-movement.quantity,movement.unit_snapshot,movement.unit_cost,-movement.total_cost,
      'Edição ou cancelamento da operação','operation',movement.id,'op-reversal:'||movement.id,auth.uid());
  END LOOP;
  IF NOT has_movements THEN
    FOR line IN SELECT x FROM jsonb_array_elements(p_old) x LOOP
      INSERT INTO public.inventory_movements(institution_id,product_id,lot_id,lot_number_snapshot,operation_id,movement_group_id,
        movement_kind,movement_type,quantity,unit_snapshot,reason,source_type,idempotency_key,created_by)
      SELECT p_operation.institution_id,p.id,NULLIF(line.x->>'lotId','')::uuid,l.lot_number,p_operation.id,group_id,
        'PHYSICAL','ADJUSTMENT_IN',(line.x->>'quantity')::numeric,p.unit,'Estorno de consumo legado sem movimento de origem',
        'operation',gen_random_uuid()::text,auth.uid() FROM public.products p LEFT JOIN public.product_lots l ON l.id=NULLIF(line.x->>'lotId','')::uuid
        WHERE p.id=(line.x->>'productId')::uuid;
    END LOOP;
  END IF;
  FOR line IN SELECT x FROM jsonb_array_elements(p_new) x LOOP
    INSERT INTO public.inventory_movements(institution_id,product_id,lot_id,lot_number_snapshot,operation_id,movement_group_id,
      movement_kind,movement_type,quantity,unit_snapshot,unit_cost,total_cost,source_type,idempotency_key,created_by,effective_at)
    SELECT p_operation.institution_id,p.id,NULLIF(line.x->>'lotId','')::uuid,l.lot_number,p_operation.id,group_id,
      'PHYSICAL','OPERATION_CONSUMPTION',-(line.x->>'quantity')::numeric,p.unit,
      COALESCE((line.x->>'unitPriceSnapshot')::numeric,p.price),
      -(line.x->>'quantity')::numeric*COALESCE((line.x->>'unitPriceSnapshot')::numeric,p.price),
      'operation',gen_random_uuid()::text,auth.uid(),p_operation.start_date
      FROM public.products p LEFT JOIN public.product_lots l ON l.id=NULLIF(line.x->>'lotId','')::uuid WHERE p.id=(line.x->>'productId')::uuid;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.apply_operation_stock(public.operations,jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_atomic_operation(p_id uuid,p_payload jsonb,p_cancel boolean DEFAULT false)
RETURNS public.operations LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid; original public.operations; result public.operations; normalized jsonb; previous jsonb:='[]';
  enriched jsonb:='[]'; item jsonb; prior_item jsonb; product public.products; max_size numeric;
BEGIN
  SELECT institution_id INTO institution FROM public.user_profiles WHERE id=auth.uid();
  IF institution IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO original FROM public.operations WHERE id=p_id AND institution_id=institution FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OPERATION_NOT_FOUND_OR_FORBIDDEN'; END IF;
    IF original.status='cancelled' THEN
      IF p_cancel THEN RETURN original; END IF;
      RAISE EXCEPTION 'OPERATION_ALREADY_CANCELLED';
    END IF;
    IF p_payload IS NOT NULL AND p_payload->>'expected_updated_at' IS NOT NULL
      AND date_trunc('milliseconds',original.updated_at)<>date_trunc('milliseconds',(p_payload->>'expected_updated_at')::timestamptz)
      THEN RAISE EXCEPTION 'RECORD_CONFLICT' USING ERRCODE='40001'; END IF;
    previous:=public.previous_operation_stock(original);
  END IF;
  IF p_cancel THEN
    IF p_id IS NULL THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
    PERFORM public.apply_operation_stock(original,previous,'[]');
    UPDATE public.operations SET status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=auth.uid(),updated_at=clock_timestamp()
      WHERE id=p_id RETURNING * INTO result;
    RETURN result;
  END IF;
  result:=jsonb_populate_record(NULL::public.operations,p_payload);
  IF result.area_id IS NULL OR result.season_id IS NULL OR result.start_date IS NULL
    OR NULLIF(btrim(result.type),'') IS NULL OR NULLIF(btrim(result.description),'') IS NULL
    OR NULLIF(btrim(result.operated_by),'') IS NULL OR result.end_date<result.start_date
    OR result.operation_size IS NULL OR result.operation_size<=0 OR result.operation_size::text IN ('NaN','Infinity','-Infinity')
    OR result.yield_per_hectare<0 OR result.yield_per_hectare::text IN ('NaN','Infinity','-Infinity')
    OR result.seeds_per_hectare<0 OR result.seeds_per_hectare::text IN ('NaN','Infinity','-Infinity')
    THEN RAISE EXCEPTION 'INVALID_OPERATION_VALUES'; END IF;
  SELECT size INTO max_size FROM public.areas WHERE id=result.area_id AND institution_id=institution FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AREA_NOT_FOUND_OR_FORBIDDEN'; END IF;
  IF result.operation_size>max_size AND (p_id IS NULL OR original.operation_size IS DISTINCT FROM result.operation_size OR original.area_id IS DISTINCT FROM result.area_id)
    THEN RAISE EXCEPTION 'OPERATION_SIZE_EXCEEDS_AREA'; END IF;
  PERFORM 1 FROM public.seasons WHERE id=result.season_id AND institution_id=institution FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SEASON_NOT_FOUND_OR_FORBIDDEN'; END IF;
  -- Executed recommendations keep their original field and season.
  IF p_id IS NOT NULL AND (original.area_id<>result.area_id OR original.season_id IS DISTINCT FROM result.season_id)
    AND EXISTS(SELECT 1 FROM public.field_recommendations WHERE operation_id=p_id) THEN RAISE EXCEPTION 'RECOMMENDATION_SCOPE_LOCKED'; END IF;
  normalized:=public.normalize_operation_stock(COALESCE(result.products_used,'[]'));
  FOR item IN SELECT * FROM jsonb_array_elements(normalized) LOOP
    SELECT * INTO product FROM public.products WHERE id=(item->>'productId')::uuid AND institution_id=institution;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_FORBIDDEN'; END IF;
    SELECT x INTO prior_item FROM jsonb_array_elements(COALESCE(original.products_used,'[]')) x WHERE x->>'productId'=item->>'productId'
      ORDER BY CASE WHEN x->'unitPriceSnapshot' IS NOT DISTINCT FROM item->'unitPriceSnapshot' THEN 0 ELSE 1 END LIMIT 1;
    item:=item-'productNameSnapshot'-'unitSnapshot'-'unitPriceSnapshot';
    IF prior_item IS NULL THEN
      item:=item || jsonb_build_object('productNameSnapshot',product.name,'unitSnapshot',product.unit,'unitPriceSnapshot',product.price);
    ELSIF prior_item ? 'unitPriceSnapshot' THEN
      item:=item || jsonb_build_object('productNameSnapshot',prior_item->'productNameSnapshot','unitSnapshot',prior_item->'unitSnapshot','unitPriceSnapshot',prior_item->'unitPriceSnapshot');
    END IF;
    enriched:=enriched||jsonb_build_array(item);
  END LOOP;
  result.products_used:=enriched;
  result.institution_id:=institution;
  IF p_id IS NULL THEN
    INSERT INTO public.operations(area_id,season_id,type,start_date,end_date,next_operation_date,description,operated_by,notes,
      products_used,operation_size,yield_per_hectare,seeds_per_hectare,user_id,institution_id)
    VALUES(result.area_id,result.season_id,result.type,result.start_date,result.end_date,result.next_operation_date,result.description,result.operated_by,result.notes,
      result.products_used,result.operation_size,result.yield_per_hectare,result.seeds_per_hectare,auth.uid(),institution) RETURNING * INTO result;
  ELSE
    UPDATE public.operations SET area_id=result.area_id,season_id=result.season_id,type=result.type,start_date=result.start_date,
      end_date=result.end_date,next_operation_date=result.next_operation_date,description=result.description,operated_by=result.operated_by,
      notes=result.notes,products_used=result.products_used,operation_size=result.operation_size,yield_per_hectare=result.yield_per_hectare,
      seeds_per_hectare=result.seeds_per_hectare,updated_at=clock_timestamp() WHERE id=p_id RETURNING * INTO result;
  END IF;
  PERFORM public.apply_operation_stock(result,previous,enriched);
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_atomic_operation(uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_operation_with_stock(p_area_id uuid,p_type text,p_start_date timestamptz,p_description text,p_operated_by text,
  p_season_id uuid DEFAULT NULL,p_end_date timestamptz DEFAULT NULL,p_next_operation_date timestamptz DEFAULT NULL,p_notes text DEFAULT NULL,
  p_products_used jsonb DEFAULT NULL,p_operation_size numeric DEFAULT NULL,p_yield_per_hectare numeric DEFAULT NULL,p_seeds_per_hectare numeric DEFAULT NULL)
RETURNS public.operations LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.save_atomic_operation(NULL,jsonb_build_object('area_id',p_area_id,'type',p_type,'start_date',p_start_date,'description',p_description,
    'operated_by',p_operated_by,'season_id',p_season_id,'end_date',p_end_date,'next_operation_date',p_next_operation_date,'notes',p_notes,
    'products_used',COALESCE(p_products_used,'[]'),'operation_size',p_operation_size,'yield_per_hectare',p_yield_per_hectare,'seeds_per_hectare',p_seeds_per_hectare));
$$;
CREATE OR REPLACE FUNCTION public.update_operation_with_stock(p_operation_id uuid,p_area_id uuid,p_type text,p_start_date timestamptz,p_description text,p_operated_by text,
  p_season_id uuid DEFAULT NULL,p_end_date timestamptz DEFAULT NULL,p_next_operation_date timestamptz DEFAULT NULL,p_notes text DEFAULT NULL,
  p_products_used jsonb DEFAULT NULL,p_operation_size numeric DEFAULT NULL,p_yield_per_hectare numeric DEFAULT NULL,p_seeds_per_hectare numeric DEFAULT NULL)
RETURNS public.operations LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT public.save_atomic_operation(p_operation_id,jsonb_build_object('area_id',p_area_id,'type',p_type,'start_date',p_start_date,'description',p_description,
    'operated_by',p_operated_by,'season_id',p_season_id,'end_date',p_end_date,'next_operation_date',p_next_operation_date,'notes',p_notes,
    'products_used',COALESCE(p_products_used,'[]'),'operation_size',p_operation_size,'yield_per_hectare',p_yield_per_hectare,'seeds_per_hectare',p_seeds_per_hectare));
$$;
CREATE OR REPLACE FUNCTION public.delete_operation_with_stock(p_operation_id uuid) RETURNS public.operations
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.save_atomic_operation(p_operation_id,NULL,true); $$;

-- A request receipt survives a lost network acknowledgement and prevents a retry
-- from creating a second operation. Existing RPC signatures remain compatible.
CREATE FUNCTION public.write_operation_request(p_request_id uuid,p_action text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE institution uuid; receipt public.record_write_receipts; result public.operations; request jsonb;
BEGIN
  SELECT institution_id INTO institution FROM public.user_profiles WHERE id=auth.uid();
  IF institution IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_request_id IS NULL OR p_action NOT IN ('create','update','cancel') OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_OPERATION'; END IF;
  request:=jsonb_build_object('action',p_action,'payload',p_payload);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  SELECT * INTO receipt FROM public.record_write_receipts WHERE request_id=p_request_id;
  IF FOUND THEN
    IF receipt.actor_id<>auth.uid() OR receipt.request<>request THEN RAISE EXCEPTION 'REQUEST_KEY_REUSED'; END IF;
    RETURN receipt.result;
  END IF;
  result:=public.save_atomic_operation(CASE WHEN p_action='create' THEN NULL ELSE (p_payload->>'id')::uuid END,p_payload,p_action='cancel');
  INSERT INTO public.record_write_receipts(request_id,actor_id,institution_id,request,result) VALUES(p_request_id,auth.uid(),institution,request,to_jsonb(result));
  RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.write_operation_request(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.write_operation_request(uuid,text,jsonb) TO authenticated;

COMMIT;
