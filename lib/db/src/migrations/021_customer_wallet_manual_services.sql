-- Canonical clients retained. Exact USD accounting: 12 decimal places as integer units.
CREATE TABLE reseller_client_groups (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL REFERENCES subscribers(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), UNIQUE(subscriber_id,id), UNIQUE(subscriber_id,name)
);
ALTER TABLE public_customer_accounts ADD COLUMN client_group_id uuid;
ALTER TABLE public_customer_accounts ADD FOREIGN KEY(subscriber_id,client_group_id) REFERENCES reseller_client_groups(subscriber_id,id);
CREATE TABLE manual_service_groups (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL REFERENCES subscribers(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), UNIQUE(subscriber_id,id), UNIQUE(subscriber_id,name)
);
CREATE TABLE manual_services (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL REFERENCES subscribers(id),
 service_type text NOT NULL CHECK(service_type IN ('imei','server','file','remote')),
 group_id uuid, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 description text NOT NULL DEFAULT '', selling_price_usd_units numeric(24,0) NOT NULL
 CHECK(selling_price_usd_units BETWEEN 1 AND 9999999999990000000000),
 estimated_time text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true,
 display_order integer NOT NULL DEFAULT 0 CHECK(display_order BETWEEN 0 AND 100000),
 requirements jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(requirements)='array' AND jsonb_array_length(requirements)<=12),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,id), FOREIGN KEY(subscriber_id,group_id) REFERENCES manual_service_groups(subscriber_id,id)
);
CREATE INDEX manual_services_catalog ON manual_services(subscriber_id,active,service_type,display_order,id);
CREATE TABLE customer_wallets (
 subscriber_id uuid NOT NULL, customer_id uuid NOT NULL,
 available_balance numeric(24,0) NOT NULL DEFAULT 0 CHECK(available_balance BETWEEN 0 AND 9999999999990000000000),
 locked_balance numeric(24,0) NOT NULL DEFAULT 0 CHECK(locked_balance BETWEEN 0 AND 9999999999990000000000),
 accounting_currency text NOT NULL DEFAULT 'USD' CHECK(accounting_currency='USD'),
 credit_limit numeric(24,0) NOT NULL DEFAULT 0 CHECK(credit_limit=0),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(subscriber_id,customer_id),
 FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id)
);
INSERT INTO customer_wallets(subscriber_id,customer_id) SELECT subscriber_id,id FROM public_customer_accounts;
CREATE FUNCTION initialize_customer_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO customer_wallets(subscriber_id,customer_id) VALUES(NEW.subscriber_id,NEW.id);
 RETURN NEW;
 END; $$;
CREATE TRIGGER customer_wallet_initialization AFTER INSERT ON public_customer_accounts FOR EACH ROW EXECUTE FUNCTION initialize_customer_wallet();
CREATE TABLE service_orders (
 id uuid PRIMARY KEY, reference text NOT NULL UNIQUE, subscriber_id uuid NOT NULL, customer_id uuid NOT NULL, service_id uuid NOT NULL,
 service_type text NOT NULL CHECK(service_type IN ('imei','server','file','remote')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','rejected','cancelled')),
 customer_input_snapshot jsonb NOT NULL CHECK(jsonb_typeof(customer_input_snapshot)='object'),
 service_name_snapshot text NOT NULL, price_usd_units numeric(24,0) NOT NULL CHECK(price_usd_units>0),
 currency_snapshot jsonb NOT NULL, wallet_debit_reference uuid NOT NULL,
 idempotency_key uuid NOT NULL, request_hash text NOT NULL,
 result text NOT NULL DEFAULT '', rejection_reason text NOT NULL DEFAULT '', internal_note text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, rejected_at timestamptz,
 UNIQUE(subscriber_id,id), UNIQUE(subscriber_id,customer_id,id), UNIQUE(subscriber_id,customer_id,idempotency_key),
 FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id),
 FOREIGN KEY(subscriber_id,service_id) REFERENCES manual_services(subscriber_id,id)
);
CREATE INDEX service_orders_owner ON service_orders(subscriber_id,status,created_at DESC,id);
CREATE INDEX service_orders_customer ON service_orders(subscriber_id,customer_id,created_at DESC,id);
CREATE TABLE customer_wallet_ledger (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL, customer_id uuid NOT NULL,
 type text NOT NULL CHECK(type IN ('admin_credit','admin_debit','adjustment','order_debit','order_refund')),
 direction text NOT NULL CHECK(direction IN ('credit','debit')),
 amount_usd_units numeric(24,0) NOT NULL CHECK(amount_usd_units BETWEEN 1 AND 9999999999990000000000),
 balance_after numeric(24,0) NOT NULL CHECK(balance_after>=0),
 currency_snapshot jsonb NOT NULL, description text NOT NULL,
 method text NOT NULL DEFAULT '', transaction_reference text NOT NULL DEFAULT '', internal_note text NOT NULL DEFAULT '',
 created_by_type text NOT NULL CHECK(created_by_type IN ('reseller','customer')),
 created_by_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 reference_type text NOT NULL CHECK(reference_type IN ('manual','service_order')), reference_id uuid,
 original_debit_id uuid, idempotency_key uuid NOT NULL, request_hash text NOT NULL,
 UNIQUE(subscriber_id,id), UNIQUE(subscriber_id,customer_id,id), UNIQUE(subscriber_id,customer_id,idempotency_key),
 FOREIGN KEY(subscriber_id,customer_id) REFERENCES customer_wallets(subscriber_id,customer_id),
 FOREIGN KEY(subscriber_id,customer_id,reference_id) REFERENCES service_orders(subscriber_id,customer_id,id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(subscriber_id,customer_id,original_debit_id) REFERENCES customer_wallet_ledger(subscriber_id,customer_id,id),
 CHECK((type IN ('admin_credit','order_refund') AND direction='credit') OR
       (type IN ('admin_debit','order_debit') AND direction='debit') OR type='adjustment'),
 CHECK((type IN ('order_debit','order_refund') AND reference_type='service_order' AND reference_id IS NOT NULL)
       OR(type IN ('admin_credit','admin_debit','adjustment') AND reference_type='manual' AND reference_id IS NULL)),
 CHECK((type='order_refund')=(original_debit_id IS NOT NULL))
);
ALTER TABLE service_orders ADD FOREIGN KEY(subscriber_id,customer_id,wallet_debit_reference)
 REFERENCES customer_wallet_ledger(subscriber_id,customer_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE UNIQUE INDEX service_order_single_debit ON customer_wallet_ledger(subscriber_id,reference_id) WHERE type='order_debit';
CREATE UNIQUE INDEX service_order_single_refund ON customer_wallet_ledger(subscriber_id,reference_id) WHERE type='order_refund';
CREATE UNIQUE INDEX wallet_debit_single_refund ON customer_wallet_ledger(original_debit_id) WHERE type='order_refund';
CREATE INDEX wallet_statement ON customer_wallet_ledger(subscriber_id,customer_id,created_at DESC,id);
CREATE FUNCTION immutable_wallet_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Wallet ledger is immutable'; END; $$;
CREATE TRIGGER wallet_ledger_immutable BEFORE UPDATE OR DELETE ON customer_wallet_ledger FOR EACH ROW EXECUTE FUNCTION immutable_wallet_ledger();
CREATE FUNCTION protect_wallet_balances() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Wallet balances change only through immutable ledger entries'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER wallet_balance_guard BEFORE UPDATE ON customer_wallets FOR EACH ROW EXECUTE FUNCTION protect_wallet_balances();
CREATE FUNCTION protect_wallet_initialization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Canonical wallets cannot be deleted'; END IF;
 IF NEW.available_balance<>0 OR NEW.locked_balance<>0 OR NEW.credit_limit<>0 THEN RAISE EXCEPTION 'Wallets initialize at zero without artificial credit'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER wallet_initial_guard BEFORE INSERT OR DELETE ON customer_wallets FOR EACH ROW EXECUTE FUNCTION protect_wallet_initialization();
CREATE FUNCTION apply_wallet_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior numeric; refundable numeric; original customer_wallet_ledger%ROWTYPE;
BEGIN
 IF NEW.created_by_type='customer' AND NEW.created_by_id<>NEW.customer_id THEN RAISE EXCEPTION 'Invalid customer actor'; END IF;
 IF NEW.created_by_type='reseller' AND NOT EXISTS(SELECT 1 FROM account_users WHERE id=NEW.created_by_id AND subscriber_id=NEW.subscriber_id) THEN RAISE EXCEPTION 'Invalid reseller actor'; END IF;
 SELECT available_balance INTO prior FROM customer_wallets WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id FOR UPDATE;
 IF NEW.direction='credit' THEN
  IF NEW.balance_after<>prior+NEW.amount_usd_units THEN RAISE EXCEPTION 'Invalid ledger credit balance'; END IF;
 ELSE
  IF NEW.balance_after<>prior-NEW.amount_usd_units THEN RAISE EXCEPTION 'Invalid ledger debit balance'; END IF;
 END IF;
 IF NEW.direction='credit' AND NEW.type<>'order_refund' THEN
  SELECT coalesce(sum(price_usd_units),0) INTO refundable FROM service_orders WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id AND status IN ('pending','processing');
  IF NEW.balance_after+refundable>9999999999990000000000 THEN RAISE EXCEPTION 'Credit must preserve capacity for pending refunds'; END IF;
 END IF;
 IF NEW.type='order_refund' THEN
  SELECT * INTO original FROM customer_wallet_ledger WHERE id=NEW.original_debit_id AND subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id;
  IF original.type IS DISTINCT FROM 'order_debit' OR original.reference_id IS DISTINCT FROM NEW.reference_id OR original.amount_usd_units IS DISTINCT FROM NEW.amount_usd_units OR original.currency_snapshot IS DISTINCT FROM NEW.currency_snapshot THEN RAISE EXCEPTION 'Refund must restore original charge'; END IF;
 END IF;
 UPDATE customer_wallets SET available_balance=NEW.balance_after,updated_at=now() WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id;
 RETURN NEW;
END; $$;
CREATE TRIGGER wallet_apply_movement AFTER INSERT ON customer_wallet_ledger FOR EACH ROW EXECUTE FUNCTION apply_wallet_movement();
CREATE FUNCTION protect_service_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.subscriber_id,NEW.customer_id,NEW.service_id,NEW.service_type,NEW.customer_input_snapshot,NEW.service_name_snapshot,NEW.price_usd_units,NEW.currency_snapshot,NEW.wallet_debit_reference,NEW.idempotency_key,NEW.request_hash)
 IS DISTINCT FROM ROW(OLD.id,OLD.subscriber_id,OLD.customer_id,OLD.service_id,OLD.service_type,OLD.customer_input_snapshot,OLD.service_name_snapshot,OLD.price_usd_units,OLD.currency_snapshot,OLD.wallet_debit_reference,OLD.idempotency_key,OLD.request_hash)
 THEN RAISE EXCEPTION 'Service order identity and snapshots are immutable'; END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='pending' AND NEW.status IN ('processing','completed','rejected')) OR(OLD.status='processing' AND NEW.status IN ('completed','rejected'))) THEN RAISE EXCEPTION 'Invalid service order transition'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER service_order_guard BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION protect_service_order();
CREATE FUNCTION validate_service_order_money() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o service_orders%ROWTYPE; d customer_wallet_ledger%ROWTYPE;
BEGIN
 SELECT * INTO o FROM service_orders WHERE id=NEW.id;
 SELECT * INTO d FROM customer_wallet_ledger WHERE id=o.wallet_debit_reference;
 IF d.type IS DISTINCT FROM 'order_debit' OR d.reference_id IS DISTINCT FROM o.id OR d.amount_usd_units IS DISTINCT FROM o.price_usd_units THEN RAISE EXCEPTION 'Service order requires exact debit'; END IF;
 IF o.status='rejected' AND NOT EXISTS(SELECT 1 FROM customer_wallet_ledger WHERE reference_id=o.id AND type='order_refund') THEN RAISE EXCEPTION 'Rejected service order requires refund'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER service_order_money_guard AFTER INSERT OR UPDATE ON service_orders DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_service_order_money();
ALTER TABLE public_customer_activity DROP CONSTRAINT public_customer_activity_action_check;
ALTER TABLE public_customer_activity ADD CONSTRAINT public_customer_activity_action_check CHECK(action IN (
 'registered','login','profile_updated','blocked','reactivated','note_added','funds_added','funds_deducted','wallet_adjustment',
 'service_order_placed','service_order_processing','service_order_completed','service_order_refunded','group_assigned'
));
