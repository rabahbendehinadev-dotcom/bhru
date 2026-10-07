-- Expand only: preserve every historical order and every non-USD price interpretation.
LOCK TABLE subscribers IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE store_settings ADD COLUMN money_model_version smallint NOT NULL DEFAULT 1 CHECK(money_model_version IN (1,2));
ALTER TABLE subscriber_currencies ALTER COLUMN rate TYPE numeric(15,6);
ALTER TABLE subscriber_currencies ADD COLUMN rate_configured boolean NOT NULL DEFAULT true;
ALTER TABLE subscriber_currencies ADD CONSTRAINT currency_configured_live CHECK(rate_configured OR (NOT enabled AND NOT client_default));
ALTER TABLE store_products
 ADD COLUMN price_usd_units numeric(30,0) CHECK(price_usd_units>=0),
 ADD COLUMN compare_at_usd_units numeric(30,0) CHECK(compare_at_usd_units>=price_usd_units),
 ADD COLUMN provider_cost_usd_units numeric(30,0) CHECK(provider_cost_usd_units>=0);
ALTER TABLE store_orders
 ADD COLUMN money_model_version smallint NOT NULL DEFAULT 1 CHECK(money_model_version IN(1,2)),
 ADD COLUMN subtotal_usd_units numeric(30,0) CHECK(subtotal_usd_units>=0),
 ADD COLUMN total_usd_units numeric(30,0) CHECK(total_usd_units>=0);
ALTER TABLE store_order_items
 ADD COLUMN unit_price_usd_units numeric(30,0) CHECK(unit_price_usd_units>=0),
 ADD COLUMN line_total_usd_units numeric(30,0) CHECK(line_total_usd_units>=0),
 ADD COLUMN provider_cost_usd_units numeric(30,0) CHECK(provider_cost_usd_units>=0);
ALTER TABLE store_orders ADD CONSTRAINT usd_order_snapshot_complete CHECK(money_model_version=1 OR (
 currency='USD' AND subtotal_usd_units IS NOT NULL AND total_usd_units IS NOT NULL
 AND currency_snapshot IS NOT NULL AND currency_snapshot->>'money_model_version'='2'
 AND currency_snapshot->>'canonical_scale'='12'
 AND currency_snapshot->>'base_currency'='USD'
 AND currency_snapshot->>'base_total_usd_units'=total_usd_units::text
));

-- An explicit, approved exact rational basis is required for monetary legacy cutovers.
-- This migration does NOT create a basis or convert a populated non-USD business.
CREATE TABLE currency_conversion_provenance (
 subscriber_id uuid PRIMARY KEY REFERENCES subscribers(id),
 original_reference text NOT NULL,
 usd_basis_numerator numeric(30,0) NOT NULL CHECK(usd_basis_numerator>0),
 usd_basis_denominator numeric(30,0) NOT NULL CHECK(usd_basis_denominator>0),
 original_money jsonb NOT NULL CHECK(jsonb_typeof(original_money)='object'),
 approval_note text NOT NULL CHECK(length(approval_note)>0),
 approved_at timestamptz NOT NULL
);

-- Existing USD-denominated products can be expanded exactly (cents × 10^10).
UPDATE store_products p SET price_usd_units=p.price_minor::numeric*10000000000,
 compare_at_usd_units=p.compare_at_minor::numeric*10000000000
 FROM store_settings s WHERE s.subscriber_id=p.subscriber_id AND s.currency='USD';
UPDATE store_settings SET money_model_version=2 WHERE currency='USD';
INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,rate,decimals,enabled,client_default,is_base)
 SELECT s.subscriber_id,'USD','US Dollar','$','USD',1,2,
 NOT EXISTS(SELECT 1 FROM subscriber_currencies c WHERE c.subscriber_id=s.subscriber_id AND c.client_default),
 NOT EXISTS(SELECT 1 FROM subscriber_currencies c WHERE c.subscriber_id=s.subscriber_id AND c.client_default),true
 FROM store_settings s WHERE s.money_model_version=2
 ON CONFLICT(subscriber_id,code) DO UPDATE SET rate=1,is_base=true,rate_configured=true;
ALTER TABLE store_settings ALTER COLUMN money_model_version SET DEFAULT 2;

CREATE FUNCTION bhru_usd_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.money_model_version=2 AND NEW.currency<>'USD' THEN
  RAISE EXCEPTION 'USD is the permanent accounting reference';
 END IF;
 IF NEW.money_model_version=2 AND EXISTS(SELECT 1 FROM store_products WHERE subscriber_id=NEW.subscriber_id
  AND (price_usd_units IS NULL OR price_minor<>round(price_usd_units/10000000000)
   OR (compare_at_usd_units IS NULL)<>(compare_at_minor IS NULL)
   OR (compare_at_usd_units IS NOT NULL AND compare_at_minor<>round(compare_at_usd_units/10000000000)))) THEN
  RAISE EXCEPTION 'All legacy product prices must be reconciled before USD cutover';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.money_model_version=2 AND NEW.money_model_version<>2 THEN
   RAISE EXCEPTION 'USD money model cannot be downgraded';
  END IF;
  IF OLD.money_model_version=1 AND NEW.money_model_version=2 AND OLD.currency<>'USD'
   AND (EXISTS(SELECT 1 FROM store_products WHERE subscriber_id=OLD.subscriber_id)
     OR EXISTS(SELECT 1 FROM store_orders WHERE subscriber_id=OLD.subscriber_id))
   AND NOT EXISTS(SELECT 1 FROM currency_conversion_provenance WHERE subscriber_id=OLD.subscriber_id AND original_reference=OLD.currency) THEN
   RAISE EXCEPTION 'Approved legacy USD conversion basis is required';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bhru_usd_reference_guard BEFORE INSERT OR UPDATE ON store_settings
 FOR EACH ROW EXECUTE FUNCTION bhru_usd_reference_guard();

CREATE OR REPLACE FUNCTION bhru_currency_invariant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant uuid;
BEGIN
 tenant:=coalesce(NEW.subscriber_id,OLD.subscriber_id);
 IF EXISTS(SELECT 1 FROM subscribers WHERE id=tenant) THEN
  IF (SELECT count(*) FROM subscriber_currencies WHERE subscriber_id=tenant AND client_default AND enabled AND rate_configured)<>1 THEN
   RAISE EXCEPTION 'Exactly one enabled Client Default is required';
  END IF;
  IF EXISTS(SELECT 1 FROM store_settings WHERE subscriber_id=tenant AND money_model_version=2)
   AND NOT EXISTS(SELECT 1 FROM subscriber_currencies WHERE subscriber_id=tenant AND code='USD' AND is_base AND rate=1 AND rate_configured AND enabled) THEN
   RAISE EXCEPTION 'Permanent USD reference at rate 1 is required';
  END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER bhru_settings_currency_invariant AFTER INSERT OR UPDATE ON store_settings
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bhru_currency_invariant();

CREATE FUNCTION bhru_product_usd_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM store_settings WHERE subscriber_id=NEW.subscriber_id AND money_model_version=2) THEN
  IF NEW.price_usd_units IS NULL OR NEW.price_minor<>round(NEW.price_usd_units/10000000000)
   OR (NEW.compare_at_usd_units IS NULL)<>(NEW.compare_at_minor IS NULL)
   OR (NEW.compare_at_usd_units IS NOT NULL AND NEW.compare_at_minor<>round(NEW.compare_at_usd_units/10000000000)) THEN
   RAISE EXCEPTION 'Canonical USD units and derived cent projection must agree';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bhru_product_usd_guard BEFORE INSERT OR UPDATE ON store_products
 FOR EACH ROW EXECUTE FUNCTION bhru_product_usd_guard();

CREATE FUNCTION bhru_order_money_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='store_orders' THEN
  IF ROW(NEW.currency,NEW.total_minor,NEW.subtotal_minor,NEW.money_model_version,NEW.total_usd_units,NEW.subtotal_usd_units)
    IS DISTINCT FROM ROW(OLD.currency,OLD.total_minor,OLD.subtotal_minor,OLD.money_model_version,OLD.total_usd_units,OLD.subtotal_usd_units) THEN
   RAISE EXCEPTION 'Historical order money is immutable';
  END IF;
 ELSE
  IF ROW(NEW.unit_price_minor,NEW.quantity,NEW.line_total_minor,NEW.unit_price_usd_units,NEW.line_total_usd_units,NEW.provider_cost_usd_units)
    IS DISTINCT FROM ROW(OLD.unit_price_minor,OLD.quantity,OLD.line_total_minor,OLD.unit_price_usd_units,OLD.line_total_usd_units,OLD.provider_cost_usd_units) THEN
   RAISE EXCEPTION 'Historical order line money is immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bhru_order_money_immutable BEFORE UPDATE ON store_orders FOR EACH ROW EXECUTE FUNCTION bhru_order_money_immutable();
CREATE TRIGGER bhru_order_line_money_immutable BEFORE UPDATE ON store_order_items FOR EACH ROW EXECUTE FUNCTION bhru_order_money_immutable();
CREATE FUNCTION bhru_conversion_provenance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM store_settings WHERE subscriber_id=OLD.subscriber_id AND money_model_version=2) THEN
  RAISE EXCEPTION 'Completed conversion provenance is immutable';
 END IF;
 RETURN coalesce(NEW,OLD);
END $$;
CREATE TRIGGER bhru_conversion_provenance_immutable BEFORE UPDATE OR DELETE ON currency_conversion_provenance
 FOR EACH ROW EXECUTE FUNCTION bhru_conversion_provenance_immutable();
