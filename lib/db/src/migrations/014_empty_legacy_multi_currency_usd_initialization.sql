-- Correct 013's single-currency restriction without modifying tracked migrations.
-- Currency configuration alone is not monetary business data. Never infer FX rates.
-- Block concurrent registration/tenant writes and monetary/configuration changes
-- while determining emptiness. Plain reads remain available; locks end at commit.
LOCK TABLE subscribers IN EXCLUSIVE MODE;
LOCK TABLE store_settings, subscriber_currencies, subscriber_general_settings,
 store_products, store_orders, store_order_items, currency_conversion_provenance
 IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE tenant uuid;
BEGIN
 FOR tenant IN
  SELECT s.subscriber_id FROM store_settings s
  WHERE s.money_model_version=1 AND s.currency<>'USD'
   -- Include inactive/archived products and every order status, even zero totals.
   AND NOT EXISTS(SELECT 1 FROM store_products p WHERE p.subscriber_id=s.subscriber_id)
   AND NOT EXISTS(SELECT 1 FROM store_orders o WHERE o.subscriber_id=s.subscriber_id)
   AND NOT EXISTS(SELECT 1 FROM store_order_items i WHERE i.subscriber_id=s.subscriber_id)
   -- Preserve any explicit conversion workflow/original-money record.
   AND NOT EXISTS(SELECT 1 FROM currency_conversion_provenance c WHERE c.subscriber_id=s.subscriber_id)
   -- These are configuration, not balances, but nonzero legacy-denominated
   -- fund/balance limits also require an explicit preservation decision.
   AND NOT EXISTS(
    SELECT 1 FROM subscriber_general_settings g WHERE g.subscriber_id=s.subscriber_id
     AND (coalesce(g.minimum_add_fund,0)>0 OR coalesce(g.maximum_add_fund,0)>0
      OR coalesce(g.maximum_balance,0)>0)
   )
  ORDER BY s.subscriber_id
 LOOP
  -- Keep every row and its name/format/precision/old rate. Its old rate is
  -- historical configuration only, NOT a configured USD-relative rate.
  -- Clear unique base/default flags before the USD upsert (also covers existing USD).
  UPDATE subscriber_currencies
   SET client_default=false,enabled=false,is_base=false,rate_configured=false,
    updated_at=now()
   WHERE subscriber_id=tenant;

  INSERT INTO subscriber_currencies(
   subscriber_id,code,name,prefix,suffix,rate,decimals,
   enabled,client_default,is_base,rate_configured
  ) VALUES(tenant,'USD','US Dollar','$','USD',1.000000,2,true,true,true,true)
  ON CONFLICT(subscriber_id,code) DO UPDATE
   SET rate=1.000000,enabled=true,client_default=true,is_base=true,
    rate_configured=true,updated_at=now();

  UPDATE store_settings SET currency='USD',money_model_version=2,updated_at=now()
   WHERE subscriber_id=tenant;
 END LOOP;
END;
$$;
