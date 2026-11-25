BEGIN;
DO $$ BEGIN IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;END $$;
DO $$ DECLARE entry record;BEGIN
 FOR entry IN SELECT * FROM (VALUES ('start_purchase','text,text,text,integer,bigint,text,uuid'),('owner_license_action','uuid,text,uuid'),('request_extra_change','uuid,integer,bigint,uuid'),('reserve_checkout','uuid,uuid,text')) v(name,args) LOOP
  IF to_regprocedure('licensing_private.'||entry.name||'_before_pilot_billing('||entry.args||')') IS NULL THEN
   EXECUTE format('ALTER FUNCTION licensing.%I(%s) RENAME TO %I',entry.name,entry.args,entry.name||'_before_pilot_billing');
   EXECUTE format('ALTER FUNCTION licensing.%I(%s) SET SCHEMA licensing_private',entry.name||'_before_pilot_billing',entry.args);
   EXECUTE format('REVOKE ALL ON FUNCTION licensing_private.%I(%s) FROM PUBLIC,anon,authenticated,service_role',entry.name||'_before_pilot_billing',entry.args);
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION licensing_private.require_pilot_billing(p_license uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF current_database()!~'^agrigest_licensing_pilot_[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LOCAL_PILOT_REQUIRED';END IF;
 PERFORM licensing_private.team_actor();IF p_license IS NOT NULL AND NOT EXISTS(SELECT 1 FROM licensing.licenses WHERE id=p_license AND test_mode) THEN RAISE EXCEPTION 'BILLING_ENVIRONMENT_MISMATCH';END IF;
END $$;
CREATE OR REPLACE FUNCTION licensing.start_purchase(p_kind text,p_period text,p_label text,p_extras integer,p_expected_minor bigint,p_environment text,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_pilot_billing();IF p_environment IS DISTINCT FROM 'sandbox' THEN RAISE EXCEPTION 'BILLING_ENVIRONMENT_MISMATCH';END IF;
 RETURN licensing_private.start_purchase_before_pilot_billing(p_kind,p_period,p_label,p_extras,p_expected_minor,p_environment,p_request);
END $$;
CREATE OR REPLACE FUNCTION licensing.owner_license_action(p_id uuid,p_action text,p_request uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_pilot_billing(p_id);PERFORM licensing_private.owner_license_action_before_pilot_billing(p_id,p_action,p_request);
END $$;
CREATE OR REPLACE FUNCTION licensing.request_extra_change(p_license uuid,p_extras integer,p_expected_minor bigint,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_pilot_billing(p_license);RETURN licensing_private.request_extra_change_before_pilot_billing(p_license,p_extras,p_expected_minor,p_request);
END $$;
CREATE OR REPLACE FUNCTION licensing.reserve_checkout(p_license uuid,p_request uuid,p_environment text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM licensing_private.require_pilot_billing(p_license);IF p_environment IS DISTINCT FROM 'sandbox' THEN RAISE EXCEPTION 'BILLING_ENVIRONMENT_MISMATCH';END IF;RETURN licensing_private.reserve_checkout_before_pilot_billing(p_license,p_request,p_environment);
END $$;
REVOKE ALL ON FUNCTION licensing_private.require_pilot_billing(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION licensing.start_purchase(text,text,text,integer,bigint,text,uuid),licensing.owner_license_action(uuid,text,uuid),licensing.request_extra_change(uuid,integer,bigint,uuid),licensing.reserve_checkout(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION licensing.start_purchase(text,text,text,integer,bigint,text,uuid),licensing.owner_license_action(uuid,text,uuid),licensing.request_extra_change(uuid,integer,bigint,uuid),licensing.reserve_checkout(uuid,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';COMMIT;
