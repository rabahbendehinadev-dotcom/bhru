-- Public visibility is independent of the immutable product-base currency in store_settings.
-- Any non-default entry, including the base display entry, may be disabled/deleted.
DO $$
DECLARE constraint_name text;
BEGIN
 FOR constraint_name IN SELECT conname FROM pg_constraint
  WHERE conrelid='subscriber_currencies'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%is_base%'
 LOOP
  EXECUTE format('ALTER TABLE subscriber_currencies DROP CONSTRAINT %I',constraint_name);
 END LOOP;
END $$;
ALTER TABLE subscriber_currencies ADD CONSTRAINT subscriber_base_rate CHECK(NOT is_base OR rate=1);
CREATE OR REPLACE FUNCTION bhru_currency_invariant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant uuid;
BEGIN
 tenant:=coalesce(NEW.subscriber_id,OLD.subscriber_id);
 IF EXISTS(SELECT 1 FROM subscribers WHERE id=tenant)
  AND (SELECT count(*) FROM subscriber_currencies WHERE subscriber_id=tenant AND client_default)<>1 THEN
  RAISE EXCEPTION 'Exactly one enabled client default is required';
 END IF;
 RETURN NULL;
END $$;
