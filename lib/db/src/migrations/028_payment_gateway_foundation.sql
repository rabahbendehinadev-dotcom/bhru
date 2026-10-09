-- Additive foundation only. No operational gateways; no historical money is rewritten.
CREATE TABLE payment_gateway_policies (
 gateway_code text PRIMARY KEY CHECK(gateway_code~'^[a-z][a-z0-9_]{1,50}$'),
 global_enabled boolean NOT NULL DEFAULT false,
 reseller_available boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO payment_gateway_policies(gateway_code) VALUES('paypal'),('cryptomus'),('usdt_portal');
CREATE TABLE reseller_payment_gateways (
 subscriber_id uuid NOT NULL REFERENCES subscribers(id), gateway_code text NOT NULL REFERENCES payment_gateway_policies(gateway_code),
 enabled boolean NOT NULL DEFAULT false, instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=1000),
 currency_rules jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(currency_rules)='array'),
 credentials_encrypted jsonb CHECK(credentials_encrypted IS NULL OR (
   jsonb_typeof(credentials_encrypted)='object' AND credentials_encrypted ?& ARRAY['v','iv','tag','ciphertext']
   AND credentials_encrypted-ARRAY['v','iv','tag','ciphertext']='{}'::jsonb AND credentials_encrypted->>'v'='1')),
 credential_fields text[] NOT NULL DEFAULT '{}',
 validation_status text NOT NULL DEFAULT 'NOT_IMPLEMENTED' CHECK(validation_status IN ('NOT_IMPLEMENTED','NOT_CONFIGURED','NOT_VALIDATED','VALID','INVALID')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(subscriber_id,gateway_code)
);
CREATE TABLE payment_funding_requests (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL, customer_id uuid NOT NULL,
 gateway_code text NOT NULL, gateway_name_snapshot text NOT NULL, payment_method text NOT NULL,
 status text NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED','PENDING_PAYMENT','PAID','FAILED','EXPIRED','CANCELLED')),
 account_currency text NOT NULL CHECK(account_currency~'^[A-Z]{3}$'),
 payment_currency text NOT NULL CHECK(payment_currency~'^[A-Z]{3}$'),
 requested_credit_units numeric(24,0) NOT NULL CHECK(requested_credit_units BETWEEN 1 AND 9999999999990000000000),
 payment_base_minor numeric(24,0) NOT NULL CHECK(payment_base_minor>0),
 fee_minor numeric(24,0) NOT NULL CHECK(fee_minor>=0),
 expected_payment_minor numeric(24,0) NOT NULL CHECK(expected_payment_minor=payment_base_minor+fee_minor AND expected_payment_minor<=9223372036854775807),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 idempotency_key uuid NOT NULL, request_hash text NOT NULL CHECK(length(request_hash)=64),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
 paid_at timestamptz,
 UNIQUE(subscriber_id,customer_id,id), UNIQUE(subscriber_id,customer_id,idempotency_key),
 FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id),
 FOREIGN KEY(subscriber_id,gateway_code) REFERENCES reseller_payment_gateways(subscriber_id,gateway_code),
 CHECK(snapshot ?& ARRAY['account','payment','merchantScope','accountRate','paymentRate','rounding','mode','feeBps','fixedFeeMinor','configurationRevision']
   AND coalesce(snapshot->'account'->>'code'=account_currency AND snapshot->'payment'->>'code'=payment_currency,false)),
 CHECK(expires_at>created_at),
 CHECK((status='PAID')=(paid_at IS NOT NULL))
);
CREATE INDEX funding_history_customer ON payment_funding_requests(subscriber_id,customer_id,created_at DESC,id);
CREATE INDEX funding_history_reseller ON payment_funding_requests(subscriber_id,created_at DESC,id);
CREATE TABLE payment_transactions (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL, customer_id uuid NOT NULL, funding_request_id uuid NOT NULL,
 gateway_code text NOT NULL REFERENCES payment_gateway_policies(gateway_code), merchant_scope text NOT NULL,
 provider_reference text NOT NULL CHECK(length(provider_reference) BETWEEN 1 AND 180),
 status text NOT NULL CHECK(status IN ('VERIFIED','SETTLED','FAILED')),
 amount_minor numeric(24,0) NOT NULL CHECK(amount_minor BETWEEN 1 AND 9223372036854775807),
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),
 verification_metadata jsonb NOT NULL CHECK(jsonb_typeof(verification_metadata)='object'
   AND verification_metadata ?& ARRAY['verification_method','adapter_version','payload_digest']
   AND verification_metadata-ARRAY['verification_method','adapter_version','payload_digest']='{}'::jsonb
   AND verification_metadata->>'verification_method'='trusted_adapter'),
 provider_occurred_at timestamptz NOT NULL, wallet_ledger_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz,
 UNIQUE(subscriber_id,customer_id,id), UNIQUE(subscriber_id,gateway_code,merchant_scope,provider_reference),
 FOREIGN KEY(subscriber_id,customer_id,funding_request_id) REFERENCES payment_funding_requests(subscriber_id,customer_id,id),
 FOREIGN KEY(subscriber_id,customer_id,wallet_ledger_id) REFERENCES customer_wallet_ledger(subscriber_id,customer_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((status='SETTLED')=(wallet_ledger_id IS NOT NULL) AND (status='SETTLED')=(settled_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_settlement_per_funding_request ON payment_transactions(funding_request_id) WHERE status='SETTLED';
CREATE TABLE payment_gateway_events (
 subscriber_id uuid NOT NULL, gateway_code text NOT NULL, merchant_scope text NOT NULL,
 event_id text NOT NULL CHECK(length(event_id) BETWEEN 1 AND 180),
 funding_request_id uuid NOT NULL, customer_id uuid NOT NULL, request_hash text NOT NULL CHECK(length(request_hash)=64),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(subscriber_id,gateway_code,merchant_scope,event_id),
 FOREIGN KEY(subscriber_id,customer_id,funding_request_id) REFERENCES payment_funding_requests(subscriber_id,customer_id,id)
);
CREATE TRIGGER verified_gateway_events_immutable BEFORE UPDATE OR DELETE ON payment_gateway_events FOR EACH ROW EXECUTE FUNCTION immutable_wallet_ledger();

ALTER TABLE customer_wallet_ledger
 ADD COLUMN payment_transaction_id uuid,
 ADD FOREIGN KEY(subscriber_id,customer_id,payment_transaction_id) REFERENCES payment_transactions(subscriber_id,customer_id,id),
 DROP CONSTRAINT customer_wallet_ledger_type_check,
 DROP CONSTRAINT customer_wallet_ledger_reference_type_check,
 DROP CONSTRAINT customer_wallet_ledger_operation_source_check,
 ADD CONSTRAINT wallet_entry_type CHECK(type IN ('admin_credit','admin_debit','adjustment','order_debit','order_refund','payment_credit')),
 ADD CONSTRAINT wallet_reference_kind CHECK(reference_type IN ('manual','service_order','payment_transaction')),
 ADD CONSTRAINT wallet_operation_kind CHECK(operation_source IN ('manual_wallet','service_order','service_order_refund','system','payment_gateway'));
-- Replace only the two old type/direction and type/reference checks. Preserve
-- amount, actor, balance, original debit and all service-order foreign keys.
DO $$
DECLARE c record; n integer:=0;
BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='customer_wallet_ledger'::regclass AND contype='c'
  AND (pg_get_constraintdef(oid) LIKE '%direction%' AND pg_get_constraintdef(oid) LIKE '%order_refund%'
    OR pg_get_constraintdef(oid) LIKE '%reference_type%' AND pg_get_constraintdef(oid) LIKE '%reference_id%')
 LOOP EXECUTE format('ALTER TABLE customer_wallet_ledger DROP CONSTRAINT %I',c.conname); n:=n+1; END LOOP;
 IF n<>2 THEN RAISE EXCEPTION 'Unexpected wallet check definitions; migration refused'; END IF;
END $$;
ALTER TABLE customer_wallet_ledger
 ADD CONSTRAINT wallet_type_direction CHECK(
  (type IN ('admin_credit','order_refund','payment_credit') AND direction='credit') OR
  (type IN ('admin_debit','order_debit') AND direction='debit') OR type='adjustment'),
 ADD CONSTRAINT wallet_reference_scope CHECK(
  (type IN ('order_debit','order_refund') AND reference_type='service_order' AND reference_id IS NOT NULL AND payment_transaction_id IS NULL) OR
  (type IN ('admin_credit','admin_debit','adjustment') AND reference_type='manual' AND reference_id IS NULL AND payment_transaction_id IS NULL) OR
  (type='payment_credit' AND reference_type='payment_transaction' AND reference_id IS NULL AND payment_transaction_id IS NOT NULL));
CREATE UNIQUE INDEX one_credit_per_payment ON customer_wallet_ledger(payment_transaction_id) WHERE payment_transaction_id IS NOT NULL;
CREATE FUNCTION guard_payment_credit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p payment_transactions%ROWTYPE; f payment_funding_requests%ROWTYPE;
BEGIN
 IF NEW.type<>'payment_credit' THEN RETURN NEW; END IF;
 SELECT * INTO p FROM payment_transactions WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id AND id=NEW.payment_transaction_id FOR UPDATE;
 SELECT * INTO f FROM payment_funding_requests WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id AND id=p.funding_request_id;
 IF p.id IS NULL OR p.status<>'VERIFIED' OR f.status NOT IN ('CREATED','PENDING_PAYMENT')
  OR p.gateway_code<>f.gateway_code OR p.merchant_scope IS DISTINCT FROM f.snapshot->>'merchantScope'
  OR p.amount_minor<>f.expected_payment_minor OR p.currency<>f.payment_currency
  OR p.provider_occurred_at>f.expires_at
  OR NEW.created_by_type<>'system' OR NEW.created_by_id IS NOT NULL OR NEW.operation_source<>'payment_gateway'
  OR NEW.amount_account_units<>f.requested_credit_units OR NEW.account_currency_snapshot IS DISTINCT FROM f.snapshot->'account'
 THEN RAISE EXCEPTION 'Payment credit requires an exact verified same-tenant funding receipt'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_credit_guard BEFORE INSERT ON customer_wallet_ledger FOR EACH ROW EXECUTE FUNCTION guard_payment_credit();
CREATE FUNCTION protect_funding_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Funding history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','updated_at','paid_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','paid_at'])
 THEN RAISE EXCEPTION 'Funding identity and monetary snapshots are immutable'; END IF;
 IF NEW.status<>OLD.status AND NOT(
  OLD.status='CREATED' AND NEW.status IN ('PENDING_PAYMENT','PAID','FAILED','EXPIRED','CANCELLED') OR
  OLD.status='PENDING_PAYMENT' AND NEW.status IN ('PAID','FAILED','EXPIRED','CANCELLED'))
 THEN RAISE EXCEPTION 'Invalid funding transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER funding_snapshot_immutable BEFORE UPDATE OR DELETE ON payment_funding_requests FOR EACH ROW EXECUTE FUNCTION protect_funding_request();
CREATE FUNCTION protect_payment_transaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment history cannot be deleted'; END IF;
 IF (to_jsonb(NEW)-ARRAY['status','updated_at','settled_at','wallet_ledger_id']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','settled_at','wallet_ledger_id'])
 THEN RAISE EXCEPTION 'Verified payment evidence is immutable'; END IF;
 IF NEW.status<>OLD.status AND NOT(OLD.status='VERIFIED' AND NEW.status='SETTLED') THEN RAISE EXCEPTION 'Invalid payment transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_evidence_immutable BEFORE UPDATE OR DELETE ON payment_transactions FOR EACH ROW EXECUTE FUNCTION protect_payment_transaction();
CREATE FUNCTION validate_funding_money() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE f payment_funding_requests%ROWTYPE; p payment_transactions%ROWTYPE; l customer_wallet_ledger%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='payment_funding_requests' THEN
  SELECT * INTO f FROM payment_funding_requests WHERE id=NEW.id;
  IF f.status<>'PAID' THEN RETURN NULL; END IF;
  SELECT * INTO p FROM payment_transactions WHERE funding_request_id=f.id AND status='SETTLED';
 ELSE
  SELECT * INTO p FROM payment_transactions WHERE id=NEW.id;
  IF p.status<>'SETTLED' THEN RETURN NULL; END IF;
  SELECT * INTO f FROM payment_funding_requests WHERE id=p.funding_request_id;
 END IF;
 SELECT * INTO l FROM customer_wallet_ledger WHERE id=p.wallet_ledger_id;
 IF p.id IS NULL OR l.id IS NULL OR f.status<>'PAID' OR p.status<>'SETTLED'
  OR l.type<>'payment_credit' OR l.payment_transaction_id<>p.id
  OR l.subscriber_id<>f.subscriber_id OR l.customer_id<>f.customer_id
  OR l.amount_account_units<>f.requested_credit_units OR l.account_currency_snapshot IS DISTINCT FROM f.snapshot->'account'
 THEN RAISE EXCEPTION 'Paid funding requires one exact immutable wallet allocation'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER funding_allocation_guard AFTER INSERT OR UPDATE ON payment_funding_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_funding_money();
CREATE CONSTRAINT TRIGGER payment_allocation_guard AFTER INSERT OR UPDATE ON payment_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_funding_money();

ALTER TABLE client_activity_events DROP CONSTRAINT client_activity_events_reference_type_check,
 ADD CONSTRAINT client_activity_reference_kind CHECK(reference_type IN ('customer_account','service_order','wallet_ledger_entry','funding_request','payment_transaction'));
-- Extend the live validator, preserving all 026/027 account/security checks.
DO $outer$
DECLARE source text; anchor text;
BEGIN
 SELECT pg_get_functiondef('validate_client_activity()'::regprocedure) INTO source;
 anchor:='FROM (VALUES';
 IF position(anchor IN source)=0 THEN RAISE EXCEPTION 'Activity registry anchor missing'; END IF;
 source:=replace(source,anchor,$add$FROM (VALUES
  ('funding_request_created','FINANCIAL','funding_request','Funding request created'),
  ('funding_request_cancelled','FINANCIAL','funding_request','Funding request cancelled'),
  ('payment_pending','FINANCIAL','funding_request','Payment pending'),
  ('payment_confirmed','FINANCIAL','payment_transaction','Payment confirmed'),
  ('payment_failed','FINANCIAL','payment_transaction','Payment failed'),
  ('wallet_funded_from_payment','FINANCIAL','wallet_ledger_entry','Wallet funded from payment'),$add$);
 anchor:=E'  ELSE\n    SELECT * INTO ledger';
 IF position(anchor IN source)=0 THEN RAISE EXCEPTION 'Activity reference anchor missing'; END IF;
 source:=replace(source,anchor,$add$  ELSIF NEW.reference_type='funding_request' THEN
    IF NOT EXISTS(SELECT 1 FROM payment_funding_requests WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id AND id=NEW.reference_id)
      OR (NEW.event_type IN ('funding_request_created','funding_request_cancelled') AND NEW.actor_type<>'customer')
      OR (NEW.event_type='payment_pending' AND NEW.actor_type<>'system') THEN RAISE EXCEPTION 'Invalid funding activity reference'; END IF;
  ELSIF NEW.reference_type='payment_transaction' THEN
    IF NEW.actor_type<>'system' OR NOT EXISTS(SELECT 1 FROM payment_transactions WHERE subscriber_id=NEW.subscriber_id
      AND customer_id=NEW.customer_id AND id=NEW.reference_id
      AND ((NEW.event_type='payment_confirmed' AND status IN ('VERIFIED','SETTLED')) OR (NEW.event_type='payment_failed' AND status='FAILED')))
    THEN RAISE EXCEPTION 'Invalid verified payment activity reference'; END IF;
  ELSE
    SELECT * INTO ledger$add$);
 source:=replace(source,$a$WHEN 'order_refund' THEN 'service_order_refunded' END$a$,$b$WHEN 'payment_credit' THEN 'wallet_funded_from_payment' WHEN 'order_refund' THEN 'service_order_refunded' END$b$);
 EXECUTE source;
 SELECT pg_get_functiondef('capture_client_financial_activity()'::regprocedure) INTO source;
 source:=replace(source,$a$WHEN 'order_refund' THEN 'service_order_refunded' END$a$,$b$WHEN 'payment_credit' THEN 'wallet_funded_from_payment' WHEN 'order_refund' THEN 'service_order_refunded' END$b$);
 EXECUTE source;
END $outer$;
