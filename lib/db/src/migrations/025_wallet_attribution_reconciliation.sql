-- Prospective attribution only: never UPDATE/DELETE a historical financial row.
ALTER TABLE customer_wallet_ledger
  DROP CONSTRAINT customer_wallet_ledger_created_by_type_check,
  ALTER COLUMN created_by_id DROP NOT NULL,
  ADD CONSTRAINT wallet_actor_type CHECK(created_by_type IN
    ('reseller','customer','subscriber_owner','subscriber_staff','system')),
  ADD CONSTRAINT wallet_actor_identity CHECK
    ((created_by_type='system' AND created_by_id IS NULL) OR
     (created_by_type<>'system' AND created_by_id IS NOT NULL)),
  ADD COLUMN actor_display_snapshot text,
  ADD COLUMN operation_source text CHECK(operation_source IN
    ('manual_wallet','service_order','service_order_refund','system')),
  ADD COLUMN correlation_id uuid,
  ADD COLUMN posting_sequence bigint CHECK(posting_sequence>0),
  ADD COLUMN reason text,
  ADD COLUMN customer_note text,
  ADD COLUMN correction_of_id uuid,
  ADD FOREIGN KEY(subscriber_id,customer_id,correction_of_id)
    REFERENCES customer_wallet_ledger(subscriber_id,customer_id,id);
CREATE UNIQUE INDEX wallet_posting_sequence
  ON customer_wallet_ledger(subscriber_id,customer_id,posting_sequence)
  WHERE posting_sequence IS NOT NULL;

-- Existing wallets originate at zero under migration 021's initialization guard.
-- This is an origin baseline, NOT a cutover balance or synthetic financial credit.
-- Never compute it from stored_balance - ledger_sum (that would hide discrepancies).
CREATE TABLE customer_wallet_baselines (
  subscriber_id uuid NOT NULL, customer_id uuid NOT NULL,
  account_currency text NOT NULL,
  opening_account_units numeric(24,0) NOT NULL DEFAULT 0 CHECK(opening_account_units=0),
  basis text NOT NULL DEFAULT 'guarded_zero_origin' CHECK(basis='guarded_zero_origin'),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(subscriber_id,customer_id),
  FOREIGN KEY(subscriber_id,customer_id) REFERENCES customer_wallets(subscriber_id,customer_id)
);
INSERT INTO customer_wallet_baselines(subscriber_id,customer_id,account_currency)
  SELECT subscriber_id,customer_id,accounting_currency FROM customer_wallets;
CREATE FUNCTION initialize_wallet_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO customer_wallet_baselines(subscriber_id,customer_id,account_currency)
    VALUES(NEW.subscriber_id,NEW.customer_id,NEW.accounting_currency);
  RETURN NEW;
END; $$;
CREATE TRIGGER wallet_origin_baseline AFTER INSERT ON customer_wallets
  FOR EACH ROW EXECUTE FUNCTION initialize_wallet_baseline();
CREATE TRIGGER wallet_baseline_immutable BEFORE UPDATE OR DELETE ON customer_wallet_baselines
  FOR EACH ROW EXECUTE FUNCTION immutable_wallet_ledger();

-- Runs before every future posting. Wallet lock serializes sequence allocation;
-- the existing AFTER INSERT trigger still applies/validates the exact balance.
CREATE FUNCTION attribute_wallet_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE display_name text;
BEGIN
  PERFORM 1 FROM customer_wallets
    WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  -- Compatibility with an older app writer during a coordinated rollout.
  -- Only FUTURE inserts are normalized. In this schema account_users contains
  -- exactly one tenant owner, so that existing verified actor is not guessed.
  IF NEW.created_by_type='reseller' THEN NEW.created_by_type:='subscriber_owner'; END IF;
  IF NEW.created_by_type='customer' THEN
    IF NEW.created_by_id IS DISTINCT FROM NEW.customer_id THEN RAISE EXCEPTION 'Invalid customer actor'; END IF;
    SELECT concat_ws(' ',first_name,last_name) INTO display_name FROM public_customer_accounts
      WHERE subscriber_id=NEW.subscriber_id AND id=NEW.created_by_id;
  ELSIF NEW.created_by_type='subscriber_owner' THEN
    SELECT full_name INTO display_name FROM account_users
      WHERE subscriber_id=NEW.subscriber_id AND id=NEW.created_by_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid subscriber actor'; END IF;
  ELSIF NEW.created_by_type='system' THEN
    display_name:='System';
  ELSE
    -- Historical reseller values remain intact. Staff identities are reserved;
    -- no staff authentication/membership model exists in this phase.
    RAISE EXCEPTION 'Unsupported new wallet actor';
  END IF;
  NEW.operation_source:=coalesce(NEW.operation_source,
    CASE NEW.type WHEN 'order_debit' THEN 'service_order'
      WHEN 'order_refund' THEN 'service_order_refund' ELSE 'manual_wallet' END);
  NEW.correlation_id:=coalesce(NEW.correlation_id,NEW.reference_id,NEW.id);
  IF NEW.type IN ('admin_credit','admin_debit','adjustment') THEN
    IF NEW.reason IS NULL THEN
      NEW.reason:=split_part(coalesce(NEW.internal_note,''),chr(10),1);
      NEW.customer_note:=CASE WHEN NEW.description=NEW.reason THEN '' ELSE NEW.description END;
    END IF;
    IF NEW.created_by_type<>'subscriber_owner' OR NEW.operation_source<>'manual_wallet'
       OR length(btrim(coalesce(NEW.reason,'')))=0 THEN
      RAISE EXCEPTION 'Manual wallet operation requires a verified owner and reason';
    END IF;
    NEW.description:=coalesce(nullif(NEW.customer_note,''),CASE NEW.type
      WHEN 'admin_credit' THEN 'Funds added' WHEN 'admin_debit' THEN 'Funds deducted' ELSE 'Wallet adjustment' END);
  ELSIF NEW.type='order_debit' THEN
    IF NEW.created_by_type<>'customer' OR NEW.operation_source<>'service_order' THEN
      RAISE EXCEPTION 'Invalid service order source';
    END IF;
  ELSIF NEW.type='order_refund' THEN
    IF NEW.created_by_type NOT IN ('subscriber_owner','system')
       OR NEW.operation_source<>'service_order_refund' THEN RAISE EXCEPTION 'Invalid refund source'; END IF;
  END IF;
  IF NEW.correction_of_id IS NOT NULL AND NEW.type<>'adjustment' THEN
    RAISE EXCEPTION 'Only a compensating adjustment can reference a correction';
  END IF;
  IF NEW.correction_of_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customer_wallet_ledger
    WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id AND id=NEW.correction_of_id) THEN
    RAISE EXCEPTION 'Correction must reference an existing same-account posting';
  END IF;
  NEW.actor_display_snapshot:=display_name;
  SELECT coalesce(max(posting_sequence),0)+1 INTO NEW.posting_sequence
    FROM customer_wallet_ledger WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER wallet_posting_attribution BEFORE INSERT ON customer_wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION attribute_wallet_movement();
