-- SOMENTE PROTOTIPO LOCAL. Este arquivo nao e uma migracao do AgriGest.
DO $$ BEGIN
  IF current_setting('agrigest.licensing_sandbox',true) IS DISTINCT FROM 'synthetic-only-v1' THEN
    RAISE EXCEPTION 'SANDBOX_MARKER_REQUIRED';
  END IF;
END $$;
BEGIN;
CREATE ROLE license_lab_client NOLOGIN;
CREATE SCHEMA license_lab;
REVOKE ALL ON SCHEMA license_lab FROM PUBLIC;
GRANT USAGE ON SCHEMA license_lab TO license_lab_client;

CREATE TABLE license_lab.people(id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL);
CREATE TABLE license_lab.farms(id uuid PRIMARY KEY, name text NOT NULL, owner_id uuid NOT NULL REFERENCES license_lab.people(id));
CREATE TABLE license_lab.memberships(
  farm_id uuid REFERENCES license_lab.farms(id), user_id uuid REFERENCES license_lab.people(id),
  role text NOT NULL CHECK(role IN ('owner','admin','operator','monitor','consultant')),
  active boolean NOT NULL DEFAULT true, PRIMARY KEY(farm_id,user_id));
CREATE UNIQUE INDEX single_active_owner ON license_lab.memberships(farm_id) WHERE role='owner' AND active;
CREATE TABLE license_lab.areas(id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES license_lab.farms(id), name text NOT NULL, hectares numeric NOT NULL CHECK(hectares>0), UNIQUE(id,farm_id));
CREATE TABLE license_lab.products(id uuid PRIMARY KEY, farm_id uuid NOT NULL REFERENCES license_lab.farms(id), name text NOT NULL, quantity numeric NOT NULL CHECK(quantity>=0), UNIQUE(id,farm_id));
CREATE TABLE license_lab.reports(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),farm_id uuid NOT NULL,area_id uuid NOT NULL,author_id uuid NOT NULL REFERENCES license_lab.people(id),
  observed_on date NOT NULL CHECK(observed_on<=CURRENT_DATE),stage text NOT NULL CHECK(length(btrim(stage))>0),description text NOT NULL CHECK(length(btrim(description))>0),
  FOREIGN KEY(area_id,farm_id) REFERENCES license_lab.areas(id,farm_id),UNIQUE(id,farm_id,area_id));
CREATE TABLE license_lab.rainfall(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),farm_id uuid NOT NULL,area_id uuid NOT NULL,author_id uuid NOT NULL REFERENCES license_lab.people(id),
  observed_on date NOT NULL CHECK(observed_on<=CURRENT_DATE),millimeters numeric NOT NULL CHECK(millimeters>=0 AND millimeters<=3000),
  FOREIGN KEY(area_id,farm_id) REFERENCES license_lab.areas(id,farm_id),UNIQUE(farm_id,area_id,observed_on));
CREATE TABLE license_lab.recommendations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),farm_id uuid NOT NULL,area_id uuid NOT NULL,report_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES license_lab.people(id),product_id uuid NOT NULL,dose numeric NOT NULL CHECK(dose>0 AND dose<=1000000 AND dose::text NOT IN ('NaN','Infinity','-Infinity')),description text NOT NULL,
  FOREIGN KEY(report_id,farm_id,area_id) REFERENCES license_lab.reports(id,farm_id,area_id),
  FOREIGN KEY(product_id,farm_id) REFERENCES license_lab.products(id,farm_id));
CREATE TABLE license_lab.applications(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),farm_id uuid NOT NULL,area_id uuid NOT NULL,product_id uuid NOT NULL,
  author_id uuid NOT NULL REFERENCES license_lab.people(id),quantity numeric NOT NULL CHECK(quantity>0),created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(area_id,farm_id) REFERENCES license_lab.areas(id,farm_id),FOREIGN KEY(product_id,farm_id) REFERENCES license_lab.products(id,farm_id));
CREATE TABLE license_lab.invitations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),farm_id uuid NOT NULL REFERENCES license_lab.farms(id),recipient_id uuid NOT NULL REFERENCES license_lab.people(id),
  role text NOT NULL CHECK(role IN ('admin','operator','monitor','consultant')),created_by uuid NOT NULL REFERENCES license_lab.people(id),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')));
CREATE TABLE license_lab.audit(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),farm_id uuid NOT NULL,actor_id uuid,action text NOT NULL,record_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),before_data jsonb,after_data jsonb);

-- A identidade e simulada pelo adaptador local para testar papeis. Nao substitui JWT em producao.
CREATE FUNCTION license_lab.actor() RETURNS uuid LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT NULLIF(current_setting('license_lab.actor',true),'')::uuid
$$;
CREATE FUNCTION license_lab.role_at(p_farm uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT role FROM license_lab.memberships WHERE farm_id=p_farm AND user_id=license_lab.actor() AND active
$$;
CREATE FUNCTION license_lab.full_access(p_farm uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT COALESCE(license_lab.role_at(p_farm) IN ('owner','admin','operator'),false)
$$;
CREATE FUNCTION license_lab.can_edit(p_farm uuid,p_author uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT license_lab.full_access(p_farm) OR
    (COALESCE(license_lab.role_at(p_farm) IN ('monitor','consultant'),false) AND p_author=license_lab.actor())
$$;
CREATE FUNCTION license_lab.immutable_scope() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.farm_id IS DISTINCT FROM OLD.farm_id OR NEW.author_id IS DISTINCT FROM OLD.author_id THEN
    RAISE EXCEPTION 'IMMUTABLE_SCOPE';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION license_lab.audit_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous jsonb; next_row jsonb; BEGIN
  IF TG_OP<>'INSERT' THEN previous:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN next_row:=to_jsonb(NEW); END IF;
  INSERT INTO license_lab.audit(farm_id,actor_id,action,record_id,before_data,after_data)
    VALUES(COALESCE((next_row->>'farm_id')::uuid,(previous->>'farm_id')::uuid),license_lab.actor(),TG_TABLE_NAME||':'||TG_OP,
      COALESCE(next_row->>'id',previous->>'id',next_row->>'user_id',previous->>'user_id'),previous,next_row);
  RETURN COALESCE(NEW,OLD);
END $$;

DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['people','farms','memberships','areas','products','reports','rainfall','recommendations','applications','invitations','audit'] LOOP
    EXECUTE format('ALTER TABLE license_lab.%I ENABLE ROW LEVEL SECURITY',name);
  END LOOP;
  FOREACH name IN ARRAY ARRAY['reports','rainfall','recommendations'] LOOP
    EXECUTE format('CREATE TRIGGER immutable_scope BEFORE UPDATE ON license_lab.%I FOR EACH ROW EXECUTE FUNCTION license_lab.immutable_scope()',name);
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON license_lab.%I FOR EACH ROW EXECUTE FUNCTION license_lab.audit_change()',name);
  END LOOP;
  FOREACH name IN ARRAY ARRAY['memberships','invitations','products','applications'] LOOP
    EXECUTE format('CREATE TRIGGER audit_change AFTER INSERT OR UPDATE OR DELETE ON license_lab.%I FOR EACH ROW EXECUTE FUNCTION license_lab.audit_change()',name);
  END LOOP;
END $$;

CREATE POLICY people_read ON license_lab.people FOR SELECT USING(id=license_lab.actor() OR EXISTS(
  SELECT 1 FROM license_lab.memberships m WHERE m.user_id=people.id AND license_lab.full_access(m.farm_id)));
CREATE POLICY farm_read ON license_lab.farms FOR SELECT USING(license_lab.role_at(id) IS NOT NULL);
CREATE POLICY membership_read ON license_lab.memberships FOR SELECT USING(user_id=license_lab.actor() OR license_lab.full_access(farm_id));
CREATE POLICY area_read ON license_lab.areas FOR SELECT USING(license_lab.role_at(farm_id) IS NOT NULL);
CREATE POLICY product_read ON license_lab.products FOR SELECT USING(license_lab.full_access(farm_id) OR license_lab.role_at(farm_id)='consultant');
CREATE POLICY application_read ON license_lab.applications FOR SELECT USING(license_lab.full_access(farm_id) OR license_lab.role_at(farm_id)='consultant');
CREATE POLICY audit_read ON license_lab.audit FOR SELECT USING(license_lab.role_at(farm_id)='owner');
CREATE POLICY invitation_read ON license_lab.invitations FOR SELECT USING(recipient_id=license_lab.actor() OR license_lab.role_at(farm_id)='owner');

DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['reports','rainfall'] LOOP
    EXECUTE format('CREATE POLICY field_read ON license_lab.%I FOR SELECT USING(license_lab.full_access(farm_id) OR license_lab.role_at(farm_id)=''consultant'' OR (license_lab.role_at(farm_id)=''monitor'' AND author_id=license_lab.actor()))',name);
    EXECUTE format('CREATE POLICY field_insert ON license_lab.%I FOR INSERT WITH CHECK(license_lab.role_at(farm_id) IS NOT NULL AND author_id=license_lab.actor())',name);
    EXECUTE format('CREATE POLICY field_update ON license_lab.%I FOR UPDATE USING(license_lab.can_edit(farm_id,author_id)) WITH CHECK(license_lab.can_edit(farm_id,author_id))',name);
    EXECUTE format('CREATE POLICY field_delete ON license_lab.%I FOR DELETE USING(license_lab.can_edit(farm_id,author_id))',name);
  END LOOP;
END $$;
CREATE POLICY recommendation_read ON license_lab.recommendations FOR SELECT USING(license_lab.full_access(farm_id) OR license_lab.role_at(farm_id)='consultant');
CREATE POLICY recommendation_insert ON license_lab.recommendations FOR INSERT WITH CHECK((license_lab.full_access(farm_id) OR license_lab.role_at(farm_id)='consultant') AND author_id=license_lab.actor());
CREATE POLICY recommendation_update ON license_lab.recommendations FOR UPDATE USING(license_lab.can_edit(farm_id,author_id) AND license_lab.role_at(farm_id)<>'monitor')
  WITH CHECK(license_lab.can_edit(farm_id,author_id) AND license_lab.role_at(farm_id)<>'monitor');
CREATE POLICY recommendation_delete ON license_lab.recommendations FOR DELETE USING(license_lab.can_edit(farm_id,author_id) AND license_lab.role_at(farm_id)<>'monitor');

CREATE FUNCTION license_lab.invite(p_farm uuid,p_email text,p_role text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient uuid; result uuid; BEGIN
  PERFORM 1 FROM license_lab.farms WHERE id=p_farm FOR UPDATE;
  IF license_lab.role_at(p_farm) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_role NOT IN ('admin','operator','monitor','consultant') OR p_role IS NULL THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  SELECT id INTO recipient FROM license_lab.people WHERE lower(email)=lower(btrim(p_email));
  IF recipient IS NULL THEN RAISE EXCEPTION 'DEMO_ACCOUNT_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM license_lab.memberships WHERE farm_id=p_farm AND user_id=recipient AND active) THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
  IF EXISTS(SELECT 1 FROM license_lab.invitations WHERE farm_id=p_farm AND recipient_id=recipient AND status='pending' AND expires_at>now()) THEN RAISE EXCEPTION 'INVITATION_PENDING'; END IF;
  INSERT INTO license_lab.invitations(farm_id,recipient_id,role,created_by) VALUES(p_farm,recipient,p_role,license_lab.actor()) RETURNING id INTO result;
  RETURN result;
END $$;
CREATE FUNCTION license_lab.accept_invitation(p_invitation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation license_lab.invitations; BEGIN
  SELECT * INTO invitation FROM license_lab.invitations WHERE id=p_invitation FOR UPDATE;
  IF NOT FOUND OR invitation.recipient_id IS DISTINCT FROM license_lab.actor() THEN RAISE EXCEPTION 'INVITATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF invitation.status<>'pending' OR invitation.expires_at<=now() THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE'; END IF;
  PERFORM 1 FROM license_lab.farms WHERE id=invitation.farm_id FOR UPDATE;
  IF license_lab.role_at(invitation.farm_id) IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_MEMBER'; END IF;
  INSERT INTO license_lab.memberships(farm_id,user_id,role,active) VALUES(invitation.farm_id,license_lab.actor(),invitation.role,true)
    ON CONFLICT(farm_id,user_id) DO UPDATE SET role=EXCLUDED.role,active=true;
  UPDATE license_lab.invitations SET status='accepted' WHERE id=invitation.id;
END $$;
CREATE FUNCTION license_lab.revoke_invitation(p_invitation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invitation license_lab.invitations; BEGIN
  SELECT * INTO invitation FROM license_lab.invitations WHERE id=p_invitation FOR UPDATE;
  IF NOT FOUND OR license_lab.role_at(invitation.farm_id) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  IF invitation.status<>'pending' THEN RAISE EXCEPTION 'INVITATION_UNAVAILABLE'; END IF;
  UPDATE license_lab.invitations SET status='revoked' WHERE id=invitation.id;
END $$;
CREATE FUNCTION license_lab.revoke_member(p_farm uuid,p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
  PERFORM 1 FROM license_lab.farms WHERE id=p_farm FOR UPDATE;
  IF license_lab.role_at(p_farm) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM license_lab.memberships WHERE farm_id=p_farm AND user_id=p_user AND role='owner') THEN RAISE EXCEPTION 'OWNER_IMMUTABLE'; END IF;
  UPDATE license_lab.memberships SET active=false WHERE farm_id=p_farm AND user_id=p_user AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
END $$;
CREATE FUNCTION license_lab.inbox() RETURNS TABLE(id uuid,farm_name text,role text,status text,expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT i.id,f.name,i.role,i.status,i.expires_at FROM license_lab.invitations i
  JOIN license_lab.farms f ON f.id=i.farm_id WHERE i.recipient_id=license_lab.actor()
$$;
CREATE FUNCTION license_lab.apply_operation(p_farm uuid,p_area uuid,p_product uuid,p_quantity numeric) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid; product license_lab.products; BEGIN
  IF NOT license_lab.full_access(p_farm) THEN RAISE EXCEPTION 'APPLICATION_FORBIDDEN' USING ERRCODE='42501'; END IF;
  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity') OR p_quantity<=0 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;
  IF NOT EXISTS(SELECT 1 FROM license_lab.areas WHERE id=p_area AND farm_id=p_farm) THEN RAISE EXCEPTION 'AREA_FORBIDDEN'; END IF;
  SELECT * INTO product FROM license_lab.products WHERE id=p_product AND farm_id=p_farm FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_FORBIDDEN'; END IF;
  IF product.quantity<p_quantity THEN RAISE EXCEPTION 'INSUFFICIENT_STOCK'; END IF;
  UPDATE license_lab.products SET quantity=quantity-p_quantity WHERE id=product.id;
  INSERT INTO license_lab.applications(farm_id,area_id,product_id,author_id,quantity) VALUES(p_farm,p_area,p_product,license_lab.actor(),p_quantity) RETURNING id INTO result;
  RETURN result;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA license_lab FROM PUBLIC,license_lab_client;
GRANT SELECT ON ALL TABLES IN SCHEMA license_lab TO license_lab_client;
GRANT INSERT,UPDATE,DELETE ON license_lab.reports,license_lab.rainfall,license_lab.recommendations TO license_lab_client;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA license_lab FROM PUBLIC,license_lab_client;
GRANT EXECUTE ON FUNCTION license_lab.actor(),license_lab.role_at(uuid),license_lab.full_access(uuid),license_lab.can_edit(uuid,uuid),
  license_lab.invite(uuid,text,text),license_lab.accept_invitation(uuid),license_lab.revoke_invitation(uuid),
  license_lab.revoke_member(uuid,uuid),license_lab.inbox(),license_lab.apply_operation(uuid,uuid,uuid,numeric) TO license_lab_client;
COMMIT;
