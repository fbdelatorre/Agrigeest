BEGIN;
CREATE TABLE licensing_private.asaas_inbox(
 environment text NOT NULL CHECK(environment IN ('sandbox','production')),event_id text NOT NULL,event_type text NOT NULL,
 payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','processed','failed')),
 received_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz,PRIMARY KEY(environment,event_id));
ALTER TABLE licensing_private.asaas_inbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON licensing_private.asaas_inbox FROM PUBLIC,anon,authenticated;
GRANT ALL ON licensing_private.asaas_inbox TO service_role;
CREATE FUNCTION licensing.ingest_asaas_event(p_environment text,p_event jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF p_environment NOT IN ('sandbox','production') OR p_environment IS NULL OR jsonb_typeof(p_event)<>'object' OR p_event->>'id' IS NULL OR p_event->>'id' !~ '^evt_' OR p_event->>'event' IS NULL OR p_event->>'event' !~ '^(PAYMENT|SUBSCRIPTION|CHECKOUT)_[A-Z_]+$' THEN RAISE EXCEPTION 'INVALID_ASAAS_EVENT'; END IF;
 INSERT INTO licensing_private.asaas_inbox(environment,event_id,event_type,payload) VALUES(p_environment,p_event->>'id',p_event->>'event',p_event) ON CONFLICT(environment,event_id) DO NOTHING;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION licensing.ingest_asaas_event(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION licensing.ingest_asaas_event(text,jsonb) TO service_role;
COMMIT;
