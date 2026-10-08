-- Separate the currencies offered to new public customers from currencies
-- already used by existing customer wallets. Preserve all customer money.
ALTER TABLE subscriber_currencies
  ADD COLUMN registration_available boolean NOT NULL DEFAULT true;

-- Previously disabled/unconfigured rows were not offered at registration.
UPDATE subscriber_currencies
  SET registration_available=false
  WHERE NOT enabled OR NOT rate_configured;

CREATE OR REPLACE FUNCTION protect_customer_account_currency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE chosen text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.preferred_currency IS DISTINCT FROM OLD.preferred_currency THEN
   RAISE EXCEPTION 'Account currency is immutable after registration';
  END IF;
 ELSE
  SELECT code INTO chosen FROM subscriber_currencies
   WHERE subscriber_id=NEW.subscriber_id AND enabled AND rate_configured AND registration_available
   AND (code=NEW.preferred_currency OR (NEW.preferred_currency IS NULL AND client_default))
   FOR SHARE;
  IF chosen IS NULL THEN RAISE EXCEPTION 'Choose a currency offered for registration by this reseller'; END IF;
  NEW.preferred_currency=chosen;
 END IF;
 RETURN NEW;
END; $$;
