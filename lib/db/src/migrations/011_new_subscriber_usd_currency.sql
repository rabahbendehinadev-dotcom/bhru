-- Preserve existing tenants' accounting references before changing future defaults.
-- Never update existing settings, currency rows, rates, prices or order snapshots.
-- Serialize with subscriber INSERTs so no registration can use the old trigger
-- between preserving legacy references and installing future USD initialization.
LOCK TABLE subscribers IN SHARE ROW EXCLUSIVE MODE;
-- Persist an existing base row's reference where settings have not yet been saved.
INSERT INTO store_settings(subscriber_id,currency)
 SELECT s.id,c.code FROM subscribers s
 JOIN subscriber_currencies c ON c.subscriber_id=s.id AND c.is_base
 WHERE NOT EXISTS(SELECT 1 FROM store_settings st WHERE st.subscriber_id=s.id)
 ON CONFLICT(subscriber_id) DO NOTHING;

-- Where the base display row was removed, retain the pre-existing database default
-- (migration 008) before changing that default. All other settings keep their
-- existing implicit values; enabled remains false.
INSERT INTO store_settings(subscriber_id)
 SELECT s.id FROM subscribers s
 WHERE NOT EXISTS(SELECT 1 FROM store_settings st WHERE st.subscriber_id=s.id)
 ON CONFLICT(subscriber_id) DO NOTHING;

ALTER TABLE store_settings ALTER COLUMN currency SET DEFAULT 'USD';

-- The existing AFTER INSERT trigger calls this function only for NEW subscribers.
-- Registration remains atomic; no subscriber/licence/authentication code changes.
CREATE OR REPLACE FUNCTION bhru_initial_currency() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO store_settings(subscriber_id,currency) VALUES(NEW.id,'USD');
 INSERT INTO subscriber_currencies
   (subscriber_id,code,name,prefix,suffix,number_format,rate,decimals,enabled,client_default,is_base)
 VALUES(NEW.id,'USD','US Dollar','$','USD','1,234.56',1.00000,2,true,true,true);
 RETURN NEW;
END $$;
