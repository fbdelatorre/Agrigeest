-- Somente tabelas novas de cobrança. Não altera lançamentos nem RLS operacional.
BEGIN;
CREATE TABLE licensing_private.checkout_requests(
 id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES auth.users(id),license_id uuid NOT NULL REFERENCES licensing.licenses(id),
 environment text NOT NULL CHECK(environment IN ('sandbox','production')),
 label text NOT NULL,period text NOT NULL CHECK(period IN ('monthly','annual')),amount_minor bigint NOT NULL CHECK(amount_minor>0),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','creating','ready','uncertain','failed','expired','cancelled')),
 provider_id text CHECK(provider_id ~ '^[a-zA-Z0-9_-]{1,200}$'),created_at timestamptz NOT NULL DEFAULT now(),claimed_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '70 minutes',updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(environment,provider_id));
CREATE UNIQUE INDEX one_open_checkout ON licensing_private.checkout_requests(license_id)
 WHERE state IN ('reserved','creating','ready','uncertain');
ALTER TABLE licensing_private.checkout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing_private.checkout_requests FROM PUBLIC,anon,authenticated;
GRANT ALL ON licensing_private.checkout_requests TO service_role;

CREATE FUNCTION licensing_private.checkout_view(p_row licensing_private.checkout_requests) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('request_id',p_row.id,'state',p_row.state,'environment',p_row.environment,'expires_at',p_row.expires_at,
 'url',CASE WHEN p_row.state='ready' AND p_row.provider_id IS NOT NULL THEN
 (CASE WHEN p_row.environment='sandbox' THEN 'https://sandbox.asaas.com' ELSE 'https://asaas.com' END)||'/checkoutSession/show?id='||p_row.provider_id ELSE NULL END)
$$;
CREATE FUNCTION licensing.reserve_checkout(p_license uuid,p_request uuid,p_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE lic licensing.licenses; req licensing_private.checkout_requests; BEGIN
 IF p_request IS NULL OR p_environment IS NULL OR p_environment NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'INVALID_CHECKOUT_REQUEST'; END IF;
 SELECT * INTO lic FROM licensing.licenses WHERE id=p_license FOR UPDATE;
 IF NOT FOUND OR lic.owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'VERIFIED_OWNER_REQUIRED'; END IF;
 UPDATE licensing_private.checkout_requests SET state='expired',updated_at=now()
 WHERE license_id=p_license AND state IN ('reserved','ready') AND expires_at<now();
 SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=p_request;
 IF FOUND THEN
  IF req.actor_id IS DISTINCT FROM auth.uid() OR req.license_id<>p_license OR req.environment<>p_environment THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
  IF req.state='ready' AND (lic.complimentary OR lic.status NOT IN ('pending','reactivation_requested')) THEN
   RETURN jsonb_build_object('request_id',req.id,'state','unavailable','url',NULL);
  END IF;
  RETURN licensing_private.checkout_view(req);
 END IF;
 IF lic.complimentary OR lic.status NOT IN ('pending','reactivation_requested') OR lic.amount_minor<=0 THEN RAISE EXCEPTION 'CHECKOUT_NOT_ALLOWED'; END IF;
 -- Reservas não utilizadas expiram; resultados incertos nunca são repetidos automaticamente.
 IF EXISTS(SELECT 1 FROM licensing_private.checkout_requests WHERE license_id=p_license AND state IN ('reserved','creating','ready','uncertain')) THEN RAISE EXCEPTION 'CHECKOUT_ALREADY_PENDING'; END IF;
 INSERT INTO licensing_private.checkout_requests(id,actor_id,license_id,environment,label,period,amount_minor)
 VALUES(p_request,auth.uid(),p_license,p_environment,lic.label,lic.period,lic.amount_minor) RETURNING * INTO req;
 RETURN licensing_private.checkout_view(req);
END $$;
CREATE FUNCTION licensing.claim_checkout(p_actor uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req licensing_private.checkout_requests; lic licensing.licenses; BEGIN
 SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=p_request;
 IF NOT FOUND OR req.actor_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
 -- Mesma ordem de locks das ações do proprietário: primeiro licença, depois reserva.
 SELECT * INTO lic FROM licensing.licenses WHERE id=req.license_id FOR UPDATE;
 SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=p_request FOR UPDATE;
 IF req.state<>'reserved' THEN RETURN NULL; END IF;
 IF req.created_at<now()-interval '5 minutes' OR lic.owner_id IS DISTINCT FROM p_actor OR lic.complimentary OR lic.status NOT IN ('pending','reactivation_requested') OR lic.amount_minor<>req.amount_minor OR lic.period<>req.period THEN
  UPDATE licensing_private.checkout_requests SET state='failed',updated_at=now() WHERE id=p_request; RETURN NULL;
 END IF;
 UPDATE licensing_private.checkout_requests SET state='creating',claimed_at=now(),updated_at=now() WHERE id=p_request;
 RETURN jsonb_build_object('license_id',req.license_id,'request_id',req.id,'environment',req.environment,'label',req.label,'period',req.period,'amount_minor',req.amount_minor);
END $$;
CREATE FUNCTION licensing.finish_checkout(p_actor uuid,p_request uuid,p_provider_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req licensing_private.checkout_requests; lic licensing.licenses; BEGIN
 IF p_provider_id IS NULL OR p_provider_id !~ '^[a-zA-Z0-9_-]{1,200}$' THEN RAISE EXCEPTION 'INVALID_PROVIDER_ID'; END IF;
 SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=p_request;
 IF NOT FOUND OR req.actor_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
 SELECT * INTO lic FROM licensing.licenses WHERE id=req.license_id FOR UPDATE;
 SELECT * INTO req FROM licensing_private.checkout_requests WHERE id=p_request FOR UPDATE;
 IF req.state='ready' AND req.provider_id=p_provider_id THEN RETURN licensing_private.checkout_view(req); END IF;
 IF req.state<>'creating' THEN RAISE EXCEPTION 'CHECKOUT_STATE_CONFLICT'; END IF;
 UPDATE licensing_private.checkout_requests SET provider_id=p_provider_id,
 state=CASE WHEN lic.owner_id=p_actor AND lic.status IN ('pending','reactivation_requested') AND NOT lic.complimentary AND lic.amount_minor=req.amount_minor AND lic.period=req.period THEN 'ready' ELSE 'uncertain' END,
 updated_at=now() WHERE id=p_request RETURNING * INTO req;
 RETURN licensing_private.checkout_view(req);
END $$;
CREATE FUNCTION licensing.mark_checkout_uncertain(p_actor uuid,p_request uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE licensing_private.checkout_requests SET state='uncertain',updated_at=now()
 WHERE id=p_request AND actor_id=p_actor AND state='creating'
$$;
REVOKE ALL ON FUNCTION licensing_private.checkout_view(licensing_private.checkout_requests),licensing.reserve_checkout(uuid,uuid,text),licensing.claim_checkout(uuid,uuid),licensing.finish_checkout(uuid,uuid,text),licensing.mark_checkout_uncertain(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION licensing.reserve_checkout(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION licensing.claim_checkout(uuid,uuid),licensing.finish_checkout(uuid,uuid,text),licensing.mark_checkout_uncertain(uuid,uuid) TO service_role;
COMMIT;
