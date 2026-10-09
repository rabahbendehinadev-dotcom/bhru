-- Additive operational state. No financial history, rates or account currencies are rewritten.
ALTER TABLE reseller_payment_gateways ADD COLUMN callback_binding uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX gateway_callback_binding_unique ON reseller_payment_gateways(callback_binding);
CREATE TABLE payment_initiations (
 funding_request_id uuid PRIMARY KEY REFERENCES payment_funding_requests(id),
 subscriber_id uuid NOT NULL, customer_id uuid NOT NULL, gateway_code text NOT NULL,
 creation_started_at timestamptz,
 provider_reference text, result jsonb, provider_metadata_encrypted jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(subscriber_id,customer_id,funding_request_id) REFERENCES payment_funding_requests(subscriber_id,customer_id,id),
 CHECK(provider_reference IS NULL OR length(provider_reference) BETWEEN 1 AND 180),
 CHECK((provider_reference IS NULL)=(result IS NULL)),
 CHECK(result IS NULL OR (jsonb_typeof(result)='object' AND octet_length(result::text)<=8192))
);
CREATE UNIQUE INDEX initiated_provider_identity ON payment_initiations(subscriber_id,gateway_code,provider_reference) WHERE provider_reference IS NOT NULL;
CREATE TABLE payment_processing_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subscriber_id uuid NOT NULL REFERENCES subscribers(id),gateway_code text NOT NULL REFERENCES payment_gateway_policies(gateway_code),
 funding_request_id uuid REFERENCES payment_funding_requests(id),
 kind text NOT NULL CHECK(kind IN ('INITIATION','EVENT','STATUS')),
 dedup_key text NOT NULL CHECK(length(dedup_key) BETWEEN 1 AND 256),
 payload jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=8192),
 adapter_version text NOT NULL CHECK(length(adapter_version) BETWEEN 1 AND 100),
 authenticated_at timestamptz,
 state text NOT NULL DEFAULT 'READY' CHECK(state IN ('READY','LEASED','DONE','REVIEW','FAILED')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,lease_token uuid,
 safe_error text CHECK(safe_error IN ('PROVIDER_TIMEOUT','PROVIDER_UNAVAILABLE','INITIATION_UNCERTAIN','ADAPTER_UNAVAILABLE',
  'CONFIGURATION_CHANGED','AMOUNT_MISMATCH','CURRENCY_MISMATCH','MERCHANT_MISMATCH','UNKNOWN_FUNDING','LATE_PAYMENT',
  'TERMINAL_FUNDING','CONFLICTING_EVENT','DUPLICATE_PROVIDER_REFERENCE','PROVIDER_REFERENCE_MISMATCH','SETTLEMENT_RETRY','RETRY_EXHAUSTED','CUSTOMER_INELIGIBLE','INVALID_PROVIDER_RESULT')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,
 UNIQUE(subscriber_id,gateway_code,kind,dedup_key),
 CHECK((state='LEASED')=(lease_token IS NOT NULL) AND (state='LEASED')=(lease_until IS NOT NULL)),
 CHECK(kind<>'EVENT' OR authenticated_at IS NOT NULL)
);
CREATE INDEX payment_jobs_due ON payment_processing_jobs(next_attempt_at,created_at) WHERE state IN ('READY','LEASED');
CREATE INDEX payment_jobs_funding ON payment_processing_jobs(subscriber_id,funding_request_id,state);
CREATE FUNCTION validate_payment_job_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.funding_request_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM payment_funding_requests
   WHERE id=NEW.funding_request_id AND subscriber_id=NEW.subscriber_id AND gateway_code=NEW.gateway_code)
 THEN RAISE EXCEPTION 'Payment job must use its own tenant and gateway'; END IF;
 IF NEW.kind='EVENT' AND (NOT (NEW.payload ?& ARRAY['event','digest','method'])
   OR NEW.payload->>'method'<>'trusted_adapter' OR length(NEW.payload->>'digest')<>64)
 THEN RAISE EXCEPTION 'Authenticated job evidence required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_job_scope BEFORE INSERT ON payment_processing_jobs FOR EACH ROW EXECUTE FUNCTION validate_payment_job_scope();
CREATE FUNCTION protect_payment_job_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment processing evidence cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['state','attempts','next_attempt_at','lease_until','lease_token','safe_error','updated_at','completed_at'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','attempts','next_attempt_at','lease_until','lease_token','safe_error','updated_at','completed_at'])
 THEN RAISE EXCEPTION 'Payment job identity and authenticated evidence are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_job_evidence_immutable BEFORE UPDATE OR DELETE ON payment_processing_jobs FOR EACH ROW EXECUTE FUNCTION protect_payment_job_evidence();
CREATE FUNCTION protect_payment_initiation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f payment_funding_requests%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Provider initiation history cannot be deleted'; END IF;
 IF TG_OP='UPDATE' AND (NEW.funding_request_id<>OLD.funding_request_id OR NEW.subscriber_id<>OLD.subscriber_id
  OR NEW.customer_id<>OLD.customer_id OR NEW.gateway_code<>OLD.gateway_code
  OR OLD.creation_started_at IS NOT NULL AND NEW.creation_started_at IS DISTINCT FROM OLD.creation_started_at
  OR OLD.result IS NOT NULL AND (NEW.result IS DISTINCT FROM OLD.result OR NEW.provider_reference IS DISTINCT FROM OLD.provider_reference
     OR NEW.provider_metadata_encrypted IS DISTINCT FROM OLD.provider_metadata_encrypted))
 THEN RAISE EXCEPTION 'Initiated provider obligations are immutable'; END IF;
 SELECT * INTO f FROM payment_funding_requests WHERE id=NEW.funding_request_id;
 IF f.subscriber_id<>NEW.subscriber_id OR f.customer_id<>NEW.customer_id OR f.gateway_code<>NEW.gateway_code
  OR NEW.result IS NOT NULL AND (NEW.result->>'providerReference' IS DISTINCT FROM NEW.provider_reference
     OR NEW.result->>'amountMinor' IS DISTINCT FROM f.expected_payment_minor::text
     OR NEW.result->>'currency' IS DISTINCT FROM f.payment_currency
     OR NEW.result->>'merchantScope' IS DISTINCT FROM f.snapshot->>'merchantScope')
 THEN RAISE EXCEPTION 'Provider initiation does not match frozen funding'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER provider_obligation_immutable BEFORE INSERT OR UPDATE OR DELETE ON payment_initiations FOR EACH ROW EXECUTE FUNCTION protect_payment_initiation();
-- Closed activity keys reuse funding references and existing actor/reference validation.
DO $outer$
DECLARE source text;
BEGIN
 SELECT pg_get_functiondef('validate_client_activity()'::regprocedure) INTO source;
 IF position('FROM (VALUES' IN source)=0 THEN RAISE EXCEPTION 'Activity registry anchor missing'; END IF;
 source:=replace(source,'FROM (VALUES',$add$FROM (VALUES
  ('payment_initiated','FINANCIAL','funding_request','Payment initiated'),
  ('payment_expired','FINANCIAL','funding_request','Payment expired'),
  ('payment_review_required','FINANCIAL','funding_request','Payment requires review'),$add$);
 source:=replace(source,$a$(NEW.event_type='payment_pending' AND NEW.actor_type<>'system')$a$,
  $b$(NEW.event_type IN ('payment_pending','payment_initiated','payment_expired','payment_review_required') AND NEW.actor_type<>'system')$b$);
 EXECUTE source;
END $outer$;
