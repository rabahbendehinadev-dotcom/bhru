-- Separate safe initialization from schema expansion. Never guess a legacy FX rate.
LOCK TABLE subscribers IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE tenant uuid;
BEGIN
 FOR tenant IN SELECT s.subscriber_id FROM store_settings s
  WHERE s.money_model_version=1
   AND NOT EXISTS(SELECT 1 FROM store_products p WHERE p.subscriber_id=s.subscriber_id)
   AND NOT EXISTS(SELECT 1 FROM store_orders o WHERE o.subscriber_id=s.subscriber_id)
   AND (SELECT count(*) FROM subscriber_currencies c WHERE c.subscriber_id=s.subscriber_id)=1
   AND EXISTS(SELECT 1 FROM subscriber_currencies c WHERE c.subscriber_id=s.subscriber_id AND c.code=s.currency AND c.rate=1 AND c.is_base)
 LOOP
  -- Preserve the old display entry, but it is NOT an invented 1:1 USD exchange rate.
  UPDATE subscriber_currencies SET client_default=false,enabled=false,is_base=false,rate_configured=false
   WHERE subscriber_id=tenant;
  INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,rate,decimals,enabled,client_default,is_base)
   VALUES(tenant,'USD','US Dollar','$','USD',1,2,true,true,true);
  UPDATE store_settings SET currency='USD',money_model_version=2 WHERE subscriber_id=tenant;
 END LOOP;
END $$;
ALTER TABLE account_users ADD COLUMN panel_display_currency text CHECK(panel_display_currency IS NULL OR panel_display_currency ~ '^[A-Z]{3}$');
