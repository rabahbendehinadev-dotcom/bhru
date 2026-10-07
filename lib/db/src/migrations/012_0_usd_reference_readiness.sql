-- Runs lexically before 012_usd_money_foundation. Version 010 permitted hiding/deleting
-- the USD display row even when USD remained the actual accounting reference.
-- Restore that permanent reference for existing USD businesses without changing prices,
-- non-USD rates, Client Default, or historical orders. Non-USD businesses are untouched.
LOCK TABLE subscribers IN SHARE ROW EXCLUSIVE MODE;
UPDATE subscriber_currencies c SET is_base=false
 FROM store_settings s WHERE c.subscriber_id=s.subscriber_id AND s.currency='USD' AND c.code<>'USD' AND c.is_base;
INSERT INTO subscriber_currencies(subscriber_id,code,name,prefix,suffix,rate,decimals,enabled,client_default,is_base)
 SELECT s.subscriber_id,'USD','US Dollar','$','USD',1,2,true,
 NOT EXISTS(SELECT 1 FROM subscriber_currencies c WHERE c.subscriber_id=s.subscriber_id AND c.client_default),true
 FROM store_settings s WHERE s.currency='USD'
 ON CONFLICT(subscriber_id,code) DO UPDATE SET rate=1,is_base=true,enabled=true;
