-- Additive tenant-owned manual commercial currencies. Existing prices/orders remain base-valued.
CREATE TABLE subscriber_currencies (
 subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
 code text NOT NULL CHECK(code ~ '^[A-Z]{3}$'), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 prefix text NOT NULL DEFAULT '' CHECK(length(prefix)<=24),
 suffix text NOT NULL DEFAULT '' CHECK(length(suffix)<=24),
 number_format text NOT NULL DEFAULT '1,234.56' CHECK(number_format IN ('1,234.56','1.234,56','1 234,56','1234.56')),
 rate numeric(15,5) NOT NULL CHECK(rate>0 AND rate<=999999999),
 decimals smallint NOT NULL CHECK(decimals BETWEEN 0 AND 4),
 enabled boolean NOT NULL DEFAULT true, client_default boolean NOT NULL DEFAULT false,
 is_base boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(subscriber_id,code),
 CHECK(NOT client_default OR enabled),
 CHECK(NOT is_base OR (enabled AND rate=1))
);
CREATE UNIQUE INDEX subscriber_currency_default ON subscriber_currencies(subscriber_id) WHERE client_default;
CREATE UNIQUE INDEX subscriber_currency_base ON subscriber_currencies(subscriber_id) WHERE is_base;
INSERT INTO subscriber_currencies(subscriber_id,code,name,suffix,rate,decimals,client_default,is_base)
 SELECT s.id,coalesce(st.currency,'DZD'),coalesce(st.currency,'DZD'),coalesce(st.currency,'DZD'),1,2,true,true
 FROM subscribers s LEFT JOIN store_settings st ON st.subscriber_id=s.id;

CREATE FUNCTION bhru_initial_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO subscriber_currencies(subscriber_id,code,name,suffix,rate,decimals,client_default,is_base)
 VALUES(NEW.id,'DZD','Algerian Dinar','DZD',1,2,true,true);
 RETURN NEW;
END $$;
CREATE TRIGGER bhru_initial_currency AFTER INSERT ON subscribers
 FOR EACH ROW EXECUTE FUNCTION bhru_initial_currency();

-- Deferred validation permits atomic default switches, but never commits zero/two defaults or bases.
CREATE FUNCTION bhru_currency_invariant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant uuid;
BEGIN
 tenant:=coalesce(NEW.subscriber_id,OLD.subscriber_id);
 IF EXISTS(SELECT 1 FROM subscribers WHERE id=tenant) THEN
  IF (SELECT count(*) FROM subscriber_currencies WHERE subscriber_id=tenant AND client_default)<>1
   OR (SELECT count(*) FROM subscriber_currencies WHERE subscriber_id=tenant AND is_base)<>1 THEN
   RAISE EXCEPTION 'Exactly one client default and base currency are required';
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bhru_currency_invariant AFTER INSERT OR UPDATE OR DELETE ON subscriber_currencies
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bhru_currency_invariant();

-- Immutable order metadata contains base amounts and the commercial rates/formats at submission.
-- Historical orders are intentionally untouched; NULL means the original base-currency receipt.
ALTER TABLE store_orders ADD COLUMN currency_snapshot jsonb;
CREATE FUNCTION bhru_immutable_currency_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.currency_snapshot IS DISTINCT FROM OLD.currency_snapshot THEN
  RAISE EXCEPTION 'Order currency snapshots are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bhru_immutable_currency_snapshot BEFORE UPDATE ON store_orders
 FOR EACH ROW EXECUTE FUNCTION bhru_immutable_currency_snapshot();
