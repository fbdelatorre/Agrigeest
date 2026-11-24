-- Executar somente pelo harness local. Todas as gravações de teste sofrem ROLLBACK.
BEGIN;
DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;
CREATE TEMP TABLE pilot_test(organization uuid,institution uuid,license uuid,owner_id uuid,area uuid,season uuid,product uuid,operation uuid,report uuid,recommendation uuid,foreign_institution uuid,stock_request uuid DEFAULT gen_random_uuid(),stock_payload jsonb);
INSERT INTO pilot_test(organization,institution,license,owner_id,area,season)
 SELECT o.id,e.institution_id,o.license_id,o.owner_id,a.id,s.id FROM licensing_private.operational_enrollments e JOIN licensing_private.organizations o ON o.id=e.organization_id
 JOIN LATERAL(SELECT id FROM public.areas WHERE institution_id=e.institution_id AND size>=1 ORDER BY id LIMIT 1) a ON true
 JOIN LATERAL(SELECT id FROM public.seasons WHERE institution_id=e.institution_id ORDER BY start_date DESC,id LIMIT 1) s ON true;
DO $$ BEGIN IF (SELECT count(*) FROM pilot_test)<>1 THEN RAISE EXCEPTION 'SINGLE_PILOT_WITH_AREA_REQUIRED';END IF;END $$;
UPDATE pilot_test SET foreign_institution=(SELECT id FROM public.institutions WHERE id<>pilot_test.institution ORDER BY id LIMIT 1);
DO $$ BEGIN IF (SELECT foreign_institution FROM pilot_test) IS NULL THEN RAISE EXCEPTION 'OTHER_FARM_REQUIRED';END IF;END $$;
CREATE TEMP TABLE pilot_actors(user_id uuid,session_id uuid DEFAULT gen_random_uuid(),installation uuid DEFAULT gen_random_uuid(),secret text DEFAULT replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),role text);
INSERT INTO pilot_actors(user_id,role) SELECT owner_id,'owner' FROM pilot_test UNION ALL SELECT m.user_id,m.role FROM licensing_private.memberships m JOIN pilot_test t ON t.organization=m.organization_id WHERE m.revoked_at IS NULL;
INSERT INTO auth.sessions(id,user_id) SELECT session_id,user_id FROM pilot_actors;
-- Libera apenas dentro desta transação as vagas ocupadas pelos testes de interface.
-- O ROLLBACK restaura todas as autorizações anteriores.
UPDATE licensing_private.devices SET revoked_at=now() WHERE license_id=(SELECT license FROM pilot_test);
UPDATE licensing_private.operational_enrollments SET enforce=true;
GRANT ALL ON pilot_test,pilot_actors TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ DECLARE t record; actor record; result jsonb; payload jsonb; op jsonb; amount numeric; report_id uuid; recommendation_id uuid; BEGIN
 SELECT * INTO t FROM pilot_test;
 FOR actor IN SELECT * FROM pilot_actors LOOP
  PERFORM set_config('request.jwt.claim.sub',actor.user_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor.user_id,'session_id',actor.session_id)::text,true);PERFORM set_config('request.headers',jsonb_build_object('x-agrigest-institution-id',t.institution)::text,true);
  PERFORM licensing.register_device(t.license,actor.installation,actor.secret,'Instalação de teste SQL');
  IF NOT licensing.operational_can(t.institution,'inventory',true) THEN RAISE EXCEPTION 'PILOT_ADMIN_LOST_STOCK_ACCESS';END IF;
 END LOOP;
 SELECT * INTO actor FROM pilot_actors WHERE role='owner';PERFORM set_config('request.jwt.claim.sub',actor.user_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor.user_id,'session_id',actor.session_id)::text,true);
 IF (SELECT count(*) FROM public.get_area_map_summary(t.season))<>(SELECT count(*) FROM public.areas WHERE institution_id=t.institution) THEN RAISE EXCEPTION 'PILOT_MAP_AREA_SCOPE_WRONG';END IF;
 payload:=jsonb_build_object('p_name','TESTE PILOTO DESCARTADO','p_category','other','p_unit','L','p_min_stock_level',0,'p_price',1,'p_untracked_quantity',10,'p_lots','[]'::jsonb);
 result:=public.stock_write_request(t.stock_request,'create_product_with_lots',payload);
 UPDATE pilot_test SET product=COALESCE(result->'product'->>'id',result->>'id')::uuid,stock_payload=payload;SELECT * INTO t FROM pilot_test;
 IF t.product IS NULL THEN RAISE EXCEPTION 'PILOT_PRODUCT_RESULT_MISSING';END IF;
 PERFORM public.stock_write_request(gen_random_uuid(),'add_inventory_stock',jsonb_build_object('p_product_id',t.product,'p_quantity',5,'p_reason','Teste revertido'));
 SELECT quantity_in_stock INTO amount FROM public.products WHERE id=t.product;IF amount<>15 THEN RAISE EXCEPTION 'PILOT_STOCK_ADDITION_WRONG';END IF;
 payload:=jsonb_build_object('area_id',t.area,'season_id',t.season,'type','dessecacao','start_date',now(),'description','TESTE REVERTIDO','operated_by','Teste local','operation_size',1,'products_used',jsonb_build_array(jsonb_build_object('productId',t.product,'quantity',2,'dose',2)));
 op:=public.write_operation_request(gen_random_uuid(),'create',payload);UPDATE pilot_test SET operation=(op->>'id')::uuid;
 SELECT quantity_in_stock INTO amount FROM public.products WHERE id=t.product;IF amount<>13 THEN RAISE EXCEPTION 'PILOT_OPERATION_DEDUCTION_WRONG';END IF;
 op:=public.write_operation_request(gen_random_uuid(),'update',op||jsonb_build_object('products_used',jsonb_build_array(jsonb_build_object('productId',t.product,'quantity',4,'dose',4))));
 SELECT quantity_in_stock INTO amount FROM public.products WHERE id=t.product;IF amount<>11 THEN RAISE EXCEPTION 'PILOT_OPERATION_EDIT_WRONG';END IF;
 PERFORM public.write_operation_request(gen_random_uuid(),'cancel',jsonb_build_object('id',op->>'id'));
 SELECT quantity_in_stock INTO amount FROM public.products WHERE id=t.product;IF amount<>15 THEN RAISE EXCEPTION 'PILOT_OPERATION_RETURN_WRONG';END IF;
 INSERT INTO public.field_monitoring_reports(institution_id,season_id,area_id,observed_on,phenological_stage,report) VALUES(t.institution,t.season,t.area,current_date,'V1','Teste revertido') RETURNING id INTO report_id;
 UPDATE pilot_test SET report=report_id;
 -- Recomendar não movimenta estoque. Apenas realizar desconta; repetição não desconta novamente.
 INSERT INTO public.field_recommendations(report_id,institution_id,season_id,area_id,operation_type,instructions,products)
 VALUES(report_id,t.institution,t.season,t.area,'dessecacao','Teste revertido',jsonb_build_array(jsonb_build_object('productId',t.product,'dose',3))) RETURNING id INTO recommendation_id;
 UPDATE pilot_test SET recommendation=recommendation_id;
 SELECT quantity_in_stock INTO amount FROM public.products WHERE id=t.product;IF amount<>15 THEN RAISE EXCEPTION 'PILOT_RECOMMENDATION_DEDUCTED_STOCK';END IF;
 SELECT to_jsonb(r) INTO payload FROM public.field_recommendations r WHERE id=recommendation_id;
 result:=public.mutate_business_record('field_recommendations',recommendation_id,'update',payload,jsonb_build_object('instructions','Recomendação editada'),gen_random_uuid());
 SELECT to_jsonb(public.execute_field_recommendation(recommendation_id,now(),'Recomendação de teste','Teste local',NULL,NULL,NULL,jsonb_build_array(jsonb_build_object('productId',t.product,'quantity',3,'dose',3)),1,NULL,NULL)) INTO op;
 SELECT quantity_in_stock INTO amount FROM public.products WHERE id=t.product;IF amount<>12 THEN RAISE EXCEPTION 'PILOT_RECOMMENDATION_EXECUTION_WRONG';END IF;
 BEGIN
  PERFORM public.execute_field_recommendation(recommendation_id,now(),'Repetição','Teste local',NULL,NULL,NULL,jsonb_build_array(jsonb_build_object('productId',t.product,'quantity',3,'dose',3)),1,NULL,NULL);
  RAISE EXCEPTION 'PILOT_RECOMMENDATION_EXECUTED_TWICE';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RECOMMENDATION_ALREADY_EXECUTED' THEN RAISE;END IF;END;
 SELECT quantity_in_stock INTO amount FROM public.products WHERE id=t.product;IF amount<>12 THEN RAISE EXCEPTION 'PILOT_RECOMMENDATION_DOUBLE_DEDUCTION';END IF;
 PERFORM public.write_operation_request(gen_random_uuid(),'cancel',jsonb_build_object('id',op->>'id'));
 SELECT quantity_in_stock INTO amount FROM public.products WHERE id=t.product;IF amount<>15 THEN RAISE EXCEPTION 'PILOT_RECOMMENDATION_CANCEL_RETURN_WRONG';END IF;
END $$;
RESET ROLE;
-- O monitor é apenas uma alteração de permissão temporária; perfil antigo permanece igual.
UPDATE licensing_private.memberships m SET role='field_monitor' FROM pilot_test t WHERE m.organization_id=t.organization AND m.user_id=(SELECT user_id FROM pilot_actors WHERE role='administrator' ORDER BY user_id LIMIT 1);
SET LOCAL ROLE authenticated;
DO $$ DECLARE t record; actor record; changed integer; own_id uuid; rainfall_id uuid; snapshot jsonb;BEGIN
 SELECT * INTO t FROM pilot_test;SELECT * INTO actor FROM pilot_actors WHERE role='administrator' ORDER BY user_id LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor.user_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor.user_id,'session_id',actor.session_id)::text,true);
 IF EXISTS(SELECT 1 FROM public.products) THEN RAISE EXCEPTION 'PILOT_MONITOR_READ_STOCK';END IF;
 BEGIN PERFORM public.get_area_map_summary(t.season);RAISE EXCEPTION 'PILOT_MONITOR_READ_MAP';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.stock_write_request(gen_random_uuid(),'add_inventory_stock',jsonb_build_object('p_product_id',t.product,'p_quantity',1,'p_reason','Negado'));RAISE EXCEPTION 'PILOT_MONITOR_WROTE_STOCK';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 INSERT INTO public.field_monitoring_reports(institution_id,season_id,area_id,observed_on,phenological_stage,report) VALUES(t.institution,t.season,t.area,current_date,'V2','Monitoramento próprio') RETURNING id INTO own_id;
 SELECT to_jsonb(r) INTO snapshot FROM public.field_monitoring_reports r WHERE id=own_id;
 PERFORM public.mutate_business_record('field_monitoring_reports',own_id,'update',snapshot,jsonb_build_object('report','Monitoramento corrigido'),gen_random_uuid());
 SELECT to_jsonb(r) INTO snapshot FROM public.field_monitoring_reports r WHERE id=t.report;
 BEGIN PERFORM public.mutate_business_record('field_monitoring_reports',t.report,'update',snapshot,jsonb_build_object('report','Não salvar'),gen_random_uuid());RAISE EXCEPTION 'PILOT_MONITOR_EDITED_OTHER_AUTHOR';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 SELECT to_jsonb(r) INTO snapshot FROM public.field_monitoring_reports r WHERE id=own_id;
 PERFORM public.mutate_business_record('field_monitoring_reports',own_id,'delete',snapshot,'{}',gen_random_uuid());
 INSERT INTO public.field_rainfall(institution_id,season_id,area_id,observed_on,millimeters) VALUES(t.institution,t.season,t.area,current_date,12) RETURNING id INTO rainfall_id;
 SELECT to_jsonb(r) INTO snapshot FROM public.field_rainfall r WHERE id=rainfall_id;
 PERFORM public.mutate_business_record('field_rainfall',rainfall_id,'update',snapshot,jsonb_build_object('millimeters',15),gen_random_uuid());
 SELECT to_jsonb(r) INTO snapshot FROM public.field_rainfall r WHERE id=rainfall_id;
 PERFORM public.mutate_business_record('field_rainfall',rainfall_id,'delete',snapshot,'{}',gen_random_uuid());
 BEGIN UPDATE public.products SET description='Não salvar' WHERE id=t.product;GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>0 THEN RAISE EXCEPTION 'PILOT_DIRECT_STOCK_BYPASS';END IF;EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
-- O vínculo público antigo não pode restaurar acesso de um funcionário desligado.
-- Consultoria com contas fictícias: o acesso depende de convite e delegação explícita.
CREATE TEMP TABLE pilot_consultant(owner_id uuid DEFAULT gen_random_uuid(),staff_id uuid DEFAULT gen_random_uuid(),owner_session uuid DEFAULT gen_random_uuid(),staff_session uuid DEFAULT gen_random_uuid(),license uuid DEFAULT gen_random_uuid(),organization uuid DEFAULT gen_random_uuid(),grant_id uuid DEFAULT gen_random_uuid(),member_id uuid DEFAULT gen_random_uuid());
INSERT INTO pilot_consultant DEFAULT VALUES;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data,aud,role)
 SELECT owner_id,'consultor-piloto-'||owner_id||'@example.test',now(),'{}'::jsonb,'{}'::jsonb,'authenticated','authenticated' FROM pilot_consultant
 UNION ALL SELECT staff_id,'monitor-consultor-piloto-'||staff_id||'@example.test',now(),'{}'::jsonb,'{}'::jsonb,'authenticated','authenticated' FROM pilot_consultant;
INSERT INTO auth.sessions(id,user_id) SELECT owner_session,owner_id FROM pilot_consultant UNION ALL SELECT staff_session,staff_id FROM pilot_consultant;
INSERT INTO licensing.licenses(id,owner_id,label,kind,period,status,extras,amount_minor,complimentary,test_mode) SELECT license,owner_id,'CONSULTORIA FICTÍCIA REVERTIDA','consultancy','monthly','active',0,0,true,true FROM pilot_consultant;
INSERT INTO licensing_private.organizations(id,license_id,name,kind,owner_id) SELECT organization,license,'Consultoria de teste revertida','consultancy',owner_id FROM pilot_consultant;
INSERT INTO licensing_private.memberships(id,organization_id,user_id,role) SELECT member_id,organization,staff_id,'field_monitor' FROM pilot_consultant;
INSERT INTO licensing_private.farm_consultants(id,farm_id,consultancy_id) SELECT c.grant_id,t.organization,c.organization FROM pilot_consultant c CROSS JOIN pilot_test t;
GRANT ALL ON pilot_consultant TO authenticated;
SET LOCAL ROLE authenticated;
DO $$ DECLARE t record;c record;BEGIN
 SELECT * INTO t FROM pilot_test;SELECT * INTO c FROM pilot_consultant;
 PERFORM set_config('request.jwt.claim.sub',c.owner_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',c.owner_id,'session_id',c.owner_session)::text,true);
 PERFORM licensing.register_device(c.license,gen_random_uuid(),repeat('a',64),'Consultor fictício');
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=t.product) THEN RAISE EXCEPTION 'PILOT_CONSULTANT_CANNOT_READ_INVITED_FARM';END IF;
 BEGIN PERFORM public.stock_write_request(gen_random_uuid(),'add_inventory_stock',jsonb_build_object('p_product_id',t.product,'p_quantity',1,'p_reason','Negado'));RAISE EXCEPTION 'PILOT_CONSULTANT_WROTE_STOCK';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 INSERT INTO public.field_monitoring_reports(institution_id,season_id,area_id,observed_on,phenological_stage,report) VALUES(t.institution,t.season,t.area,current_date,'V2','Consultor autorizado');
 INSERT INTO public.field_recommendations(report_id,institution_id,season_id,area_id,operation_type,instructions,products) VALUES(t.report,t.institution,t.season,t.area,'dessecacao','Consultoria de teste',jsonb_build_array(jsonb_build_object('productId',t.product,'dose',1)));
 PERFORM set_config('request.jwt.claim.sub',c.staff_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',c.staff_id,'session_id',c.staff_session)::text,true);
 PERFORM licensing.register_device(c.license,gen_random_uuid(),repeat('b',64),'Monitor fictício da consultoria');
 IF EXISTS(SELECT 1 FROM public.field_monitoring_reports) THEN RAISE EXCEPTION 'PILOT_CONSULTANCY_STAFF_INHERITED_FARM';END IF;
END $$;
RESET ROLE;
INSERT INTO licensing_private.farm_delegations(membership_id,farm_id,grant_id) SELECT c.member_id,t.organization,c.grant_id FROM pilot_consultant c CROSS JOIN pilot_test t;
SET LOCAL ROLE authenticated;
DO $$ DECLARE t record;BEGIN
 SELECT * INTO t FROM pilot_test;
 IF NOT EXISTS(SELECT 1 FROM public.field_monitoring_reports WHERE id=t.report) THEN RAISE EXCEPTION 'PILOT_CONSULTANCY_DELEGATION_NOT_APPLIED';END IF;
 IF EXISTS(SELECT 1 FROM public.products) THEN RAISE EXCEPTION 'PILOT_CONSULTANCY_MONITOR_READ_STOCK';END IF;
 INSERT INTO public.field_monitoring_reports(institution_id,season_id,area_id,observed_on,phenological_stage,report) VALUES(t.institution,t.season,t.area,current_date,'V2','Monitor com delegação explícita');
END $$;
RESET ROLE;
UPDATE licensing_private.farm_consultants g SET revoked_at=now() FROM pilot_consultant c WHERE g.id=c.grant_id;
-- Novo convite à consultoria não reativa a delegação antiga do funcionário.
INSERT INTO licensing_private.farm_consultants(farm_id,consultancy_id) SELECT t.organization,c.organization FROM pilot_test t CROSS JOIN pilot_consultant c;
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.field_monitoring_reports) THEN RAISE EXCEPTION 'PILOT_OLD_DELEGATION_RESURRECTED';END IF;END $$;
RESET ROLE;
UPDATE licensing_private.memberships m SET revoked_at=now() FROM pilot_test t WHERE m.organization_id=t.organization AND m.user_id=(SELECT user_id FROM pilot_actors WHERE role='administrator' ORDER BY user_id DESC LIMIT 1);
SET LOCAL ROLE authenticated;
DO $$ DECLARE t record; actor record;BEGIN
 SELECT * INTO t FROM pilot_test;SELECT * INTO actor FROM pilot_actors WHERE role='administrator' ORDER BY user_id DESC LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',actor.user_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor.user_id,'session_id',actor.session_id)::text,true);
 IF EXISTS(SELECT 1 FROM public.products) OR EXISTS(SELECT 1 FROM public.field_monitoring_reports) THEN RAISE EXCEPTION 'PILOT_DISMISSED_MEMBER_READ_DATA';END IF;
 BEGIN PERFORM public.stock_write_request(gen_random_uuid(),'add_inventory_stock',jsonb_build_object('p_product_id',t.product,'p_quantity',1,'p_reason','Negado'));RAISE EXCEPTION 'PILOT_DISMISSED_MEMBER_WROTE_DATA';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
-- Sem dispositivo autorizado, até o proprietário fica impedido de gravar.
UPDATE licensing_private.devices SET revoked_at=now() WHERE user_id=(SELECT owner_id FROM pilot_test);
SET LOCAL ROLE authenticated;
DO $$ DECLARE t record; actor record;BEGIN
 SELECT * INTO t FROM pilot_test;SELECT * INTO actor FROM pilot_actors WHERE role='owner';
 PERFORM set_config('request.jwt.claim.sub',actor.user_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor.user_id,'session_id',actor.session_id)::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=t.product) THEN RAISE EXCEPTION 'PILOT_DEVICE_REVOCATION_LOST_HISTORY';END IF;
 BEGIN PERFORM public.stock_write_request(gen_random_uuid(),'add_inventory_stock',jsonb_build_object('p_product_id',t.product,'p_quantity',1,'p_reason','Negado'));RAISE EXCEPTION 'PILOT_REVOKED_DEVICE_WROTE_DATA';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 -- Trocar o cabeçalho não concede acesso a outra fazenda.
 PERFORM set_config('request.headers',jsonb_build_object('x-agrigest-institution-id',t.foreign_institution)::text,true);
 BEGIN PERFORM licensing.current_institution();RAISE EXCEPTION 'PILOT_HEADER_GRANTED_FOREIGN_FARM';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM set_config('request.headers',jsonb_build_object('x-agrigest-institution-id',t.institution)::text,true);
 IF EXISTS(SELECT 1 FROM public.areas WHERE institution_id<>t.institution) THEN RAISE EXCEPTION 'PILOT_FOREIGN_AREAS_VISIBLE';END IF;
END $$;
RESET ROLE;
UPDATE licensing.licenses l SET status='cancelled' FROM pilot_test t WHERE l.id=t.license;
SET LOCAL ROLE authenticated;
DO $$ DECLARE t record; actor record; changed integer; result jsonb;BEGIN
 SELECT * INTO t FROM pilot_test;SELECT * INTO actor FROM pilot_actors WHERE role='owner';PERFORM set_config('request.jwt.claim.sub',actor.user_id::text,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor.user_id,'session_id',actor.session_id)::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=t.product) THEN RAISE EXCEPTION 'PILOT_CANCEL_LOST_HISTORY';END IF;
 BEGIN UPDATE public.products SET description='Não salvar' WHERE id=t.product;GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>0 THEN RAISE EXCEPTION 'PILOT_CANCEL_ALLOWED_UPDATE';END IF;EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN DELETE FROM public.products WHERE id=t.product;GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>0 THEN RAISE EXCEPTION 'PILOT_CANCEL_ALLOWED_DELETE';END IF;EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM public.stock_write_request(gen_random_uuid(),'add_inventory_stock',jsonb_build_object('p_product_id',t.product,'p_quantity',1,'p_reason','Negado'));RAISE EXCEPTION 'PILOT_CANCEL_ALLOWED_RPC';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 result:=public.stock_write_request(t.stock_request,'create_product_with_lots',t.stock_payload);IF COALESCE(result->'product'->>'id',result->>'id')::uuid<>t.product THEN RAISE EXCEPTION 'PILOT_READ_ONLY_RECEIPT_RECOVERY_FAILED';END IF;
END $$;
RESET ROLE;
ROLLBACK;
