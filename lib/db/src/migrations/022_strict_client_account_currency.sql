-- Existing 021 wallets are USD. Keep their money and historical audit columns
-- unchanged; the former mutable preference becomes the fixed account currency.
UPDATE public_customer_accounts c SET preferred_currency=w.accounting_currency
FROM customer_wallets w WHERE w.subscriber_id=c.subscriber_id AND w.customer_id=c.id
AND c.preferred_currency IS DISTINCT FROM w.accounting_currency;
ALTER TABLE public_customer_accounts ALTER COLUMN preferred_currency SET NOT NULL;
ALTER TABLE public_customer_accounts ADD CONSTRAINT customer_account_currency_unique UNIQUE(subscriber_id,id,preferred_currency);
ALTER TABLE customer_wallets DROP CONSTRAINT customer_wallets_accounting_currency_check;
ALTER TABLE customer_wallets ADD CONSTRAINT wallet_account_currency_code CHECK(accounting_currency ~ '^[A-Z]{3}$');
ALTER TABLE customer_wallets ADD CONSTRAINT wallet_matches_account_currency
 FOREIGN KEY(subscriber_id,customer_id,accounting_currency)
 REFERENCES public_customer_accounts(subscriber_id,id,preferred_currency);

-- USD columns retain historical/source pricing meaning. New non-USD manual
-- movements need no USD equivalent and perform no funding FX conversion.
ALTER TABLE customer_wallet_ledger ALTER COLUMN amount_usd_units DROP NOT NULL;
ALTER TABLE customer_wallet_ledger ADD COLUMN amount_account_units numeric(24,0);
ALTER TABLE customer_wallet_ledger ADD COLUMN account_currency_snapshot jsonb;
ALTER TABLE service_orders ADD COLUMN price_account_units numeric(24,0);
ALTER TABLE service_orders ADD COLUMN account_currency_snapshot jsonb;
-- Disable only the legacy mutation guard inside this transaction for the
-- additive historical backfill. Original money/snapshots are not updated.
ALTER TABLE customer_wallet_ledger DISABLE TRIGGER wallet_ledger_immutable;
UPDATE customer_wallet_ledger SET amount_account_units=amount_usd_units,
 account_currency_snapshot=CASE WHEN currency_snapshot->>'code'='USD' THEN currency_snapshot ELSE
 jsonb_build_object('code','USD','name','US Dollar','prefix','$','suffix','USD',
 'number_format','1,000.99','rate','1.000000','decimals',2,'enabled',true,'is_base',true,'rate_configured',true) END;
ALTER TABLE customer_wallet_ledger ENABLE TRIGGER wallet_ledger_immutable;
UPDATE service_orders SET price_account_units=price_usd_units,
 account_currency_snapshot=CASE WHEN currency_snapshot->>'code'='USD' THEN currency_snapshot ELSE
 jsonb_build_object('code','USD','name','US Dollar','prefix','$','suffix','USD',
 'number_format','1,000.99','rate','1.000000','decimals',2,'enabled',true,'is_base',true,'rate_configured',true) END;
-- Drain the legacy deferred order-money checks before subsequent table DDL.
-- Otherwise databases containing real orders raise "pending trigger events".
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE customer_wallet_ledger ALTER COLUMN amount_account_units SET NOT NULL;
ALTER TABLE customer_wallet_ledger ALTER COLUMN account_currency_snapshot SET NOT NULL;
ALTER TABLE customer_wallet_ledger ADD CONSTRAINT ledger_account_amount_limit CHECK(amount_account_units BETWEEN 1 AND 9999999999990000000000);
ALTER TABLE service_orders ALTER COLUMN price_account_units SET NOT NULL;
ALTER TABLE service_orders ALTER COLUMN account_currency_snapshot SET NOT NULL;
ALTER TABLE service_orders ADD CONSTRAINT order_account_amount_limit CHECK(price_account_units BETWEEN 1 AND 9999999999990000000000);

CREATE FUNCTION protect_customer_account_currency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE chosen text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.preferred_currency IS DISTINCT FROM OLD.preferred_currency THEN
   RAISE EXCEPTION 'Account currency is immutable after registration';
  END IF;
 ELSE
  SELECT code INTO chosen FROM subscriber_currencies
   WHERE subscriber_id=NEW.subscriber_id AND enabled AND rate_configured
   AND (code=NEW.preferred_currency OR (NEW.preferred_currency IS NULL AND client_default))
   FOR SHARE;
  IF chosen IS NULL THEN RAISE EXCEPTION 'Choose an enabled account currency'; END IF;
  NEW.preferred_currency=chosen;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER customer_account_currency_guard BEFORE INSERT OR UPDATE ON public_customer_accounts
 FOR EACH ROW EXECUTE FUNCTION protect_customer_account_currency();
CREATE OR REPLACE FUNCTION initialize_customer_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO customer_wallets(subscriber_id,customer_id,accounting_currency)
 VALUES(NEW.subscriber_id,NEW.id,NEW.preferred_currency);
 RETURN NEW;
END; $$;
CREATE FUNCTION protect_used_client_currency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE used bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.enabled AND NEW.code=OLD.code AND NEW.subscriber_id=OLD.subscriber_id THEN RETURN NEW; END IF;
 END IF;
 SELECT count(*) INTO used FROM public_customer_accounts WHERE subscriber_id=OLD.subscriber_id AND preferred_currency=OLD.code;
 IF used>0 THEN RAISE EXCEPTION 'This currency is currently used by % client accounts and cannot be disabled or deleted',used; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER client_currency_usage_guard BEFORE UPDATE OR DELETE ON subscriber_currencies
 FOR EACH ROW EXECUTE FUNCTION protect_used_client_currency();

CREATE OR REPLACE FUNCTION protect_wallet_balances() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.subscriber_id,NEW.customer_id,NEW.accounting_currency) IS DISTINCT FROM ROW(OLD.subscriber_id,OLD.customer_id,OLD.accounting_currency)
 THEN RAISE EXCEPTION 'Wallet account currency and identity are immutable'; END IF;
 IF pg_trigger_depth()<2 THEN RAISE EXCEPTION 'Wallet balances change only through immutable ledger entries'; END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION apply_wallet_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior numeric; code text; refundable numeric; original customer_wallet_ledger%ROWTYPE;
BEGIN
 IF NEW.created_by_type='customer' AND NEW.created_by_id<>NEW.customer_id THEN RAISE EXCEPTION 'Invalid customer actor'; END IF;
 IF NEW.created_by_type='reseller' AND NOT EXISTS(SELECT 1 FROM account_users WHERE id=NEW.created_by_id AND subscriber_id=NEW.subscriber_id) THEN RAISE EXCEPTION 'Invalid reseller actor'; END IF;
 SELECT available_balance,accounting_currency INTO prior,code FROM customer_wallets
 WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id FOR UPDATE;
 IF NEW.account_currency_snapshot->>'code' IS DISTINCT FROM code THEN RAISE EXCEPTION 'Ledger currency must equal account currency'; END IF;
 IF NEW.direction='credit' THEN
  IF NEW.balance_after<>prior+NEW.amount_account_units THEN RAISE EXCEPTION 'Invalid ledger credit balance'; END IF;
 ELSE
  IF NEW.balance_after<>prior-NEW.amount_account_units THEN RAISE EXCEPTION 'Invalid ledger debit balance'; END IF;
 END IF;
 IF NEW.direction='credit' AND NEW.type<>'order_refund' THEN
  SELECT coalesce(sum(price_account_units),0) INTO refundable FROM service_orders WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id AND status IN ('pending','processing');
  IF NEW.balance_after+refundable>9999999999990000000000 THEN RAISE EXCEPTION 'Credit must preserve capacity for pending refunds'; END IF;
 END IF;
 IF NEW.type='order_refund' THEN
  SELECT * INTO original FROM customer_wallet_ledger WHERE id=NEW.original_debit_id AND subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id;
  IF original.type IS DISTINCT FROM 'order_debit' OR original.reference_id IS DISTINCT FROM NEW.reference_id
   OR original.amount_account_units IS DISTINCT FROM NEW.amount_account_units
   OR original.account_currency_snapshot IS DISTINCT FROM NEW.account_currency_snapshot
   OR original.amount_usd_units IS DISTINCT FROM NEW.amount_usd_units
   OR original.currency_snapshot IS DISTINCT FROM NEW.currency_snapshot THEN RAISE EXCEPTION 'Refund must restore original charge'; END IF;
 END IF;
 UPDATE customer_wallets SET available_balance=NEW.balance_after,updated_at=now() WHERE subscriber_id=NEW.subscriber_id AND customer_id=NEW.customer_id;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION protect_service_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.subscriber_id,NEW.customer_id,NEW.service_id,NEW.service_type,NEW.customer_input_snapshot,NEW.service_name_snapshot,NEW.price_usd_units,NEW.currency_snapshot,NEW.wallet_debit_reference,NEW.idempotency_key,NEW.request_hash,NEW.price_account_units,NEW.account_currency_snapshot)
 IS DISTINCT FROM ROW(OLD.id,OLD.subscriber_id,OLD.customer_id,OLD.service_id,OLD.service_type,OLD.customer_input_snapshot,OLD.service_name_snapshot,OLD.price_usd_units,OLD.currency_snapshot,OLD.wallet_debit_reference,OLD.idempotency_key,OLD.request_hash,OLD.price_account_units,OLD.account_currency_snapshot)
 THEN RAISE EXCEPTION 'Service order identity and snapshots are immutable'; END IF;
 IF NEW.status<>OLD.status AND NOT ((OLD.status='pending' AND NEW.status IN ('processing','completed','rejected')) OR(OLD.status='processing' AND NEW.status IN ('completed','rejected'))) THEN RAISE EXCEPTION 'Invalid service order transition'; END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION validate_service_order_money() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o service_orders%ROWTYPE; d customer_wallet_ledger%ROWTYPE; code text;
BEGIN
 SELECT * INTO o FROM service_orders WHERE id=NEW.id;
 SELECT * INTO d FROM customer_wallet_ledger WHERE id=o.wallet_debit_reference;
 SELECT accounting_currency INTO code FROM customer_wallets WHERE subscriber_id=o.subscriber_id AND customer_id=o.customer_id;
 IF d.type IS DISTINCT FROM 'order_debit' OR d.reference_id IS DISTINCT FROM o.id
  OR d.amount_account_units IS DISTINCT FROM o.price_account_units
  OR d.account_currency_snapshot IS DISTINCT FROM o.account_currency_snapshot
  OR d.amount_usd_units IS DISTINCT FROM o.price_usd_units
  OR o.account_currency_snapshot->>'code' IS DISTINCT FROM code THEN RAISE EXCEPTION 'Service order requires exact account-currency debit'; END IF;
 IF o.status='rejected' AND NOT EXISTS(SELECT 1 FROM customer_wallet_ledger WHERE reference_id=o.id AND type='order_refund') THEN RAISE EXCEPTION 'Rejected service order requires refund'; END IF;
 RETURN NULL;
END; $$;
