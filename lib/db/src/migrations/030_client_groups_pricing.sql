-- Extend the existing canonical groups/assignments, never a second customer identity.
ALTER TABLE reseller_client_groups
 ADD COLUMN description text NOT NULL DEFAULT '' CHECK(length(description)<=1000),
 ADD COLUMN is_active boolean NOT NULL DEFAULT true,
 ADD COLUMN is_default boolean NOT NULL DEFAULT false,
 ADD COLUMN sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order BETWEEN 0 AND 100000),
 ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE reseller_client_groups ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE reseller_client_groups ADD CHECK(NOT is_default OR is_active);
-- Historical creation dates were not stored. Keep names/memberships; smallest existing UUID wins.
WITH ranked AS (
 SELECT id,row_number() OVER(PARTITION BY subscriber_id ORDER BY id) n
 FROM reseller_client_groups
) UPDATE reseller_client_groups g SET is_default=true FROM ranked r WHERE r.id=g.id AND r.n=1;
INSERT INTO reseller_client_groups(id,subscriber_id,name,is_default)
 SELECT gen_random_uuid(),s.id,'Standard',true FROM subscribers s
 WHERE NOT EXISTS(SELECT 1 FROM reseller_client_groups g WHERE g.subscriber_id=s.id);
-- Only previously unassigned customers receive the deterministic tenant default.
UPDATE public_customer_accounts c SET client_group_id=g.id
 FROM reseller_client_groups g WHERE c.subscriber_id=g.subscriber_id AND g.is_default AND c.client_group_id IS NULL;
CREATE UNIQUE INDEX client_group_one_default ON reseller_client_groups(subscriber_id) WHERE is_default;
CREATE INDEX customer_client_group_lookup ON public_customer_accounts(subscriber_id,client_group_id);
CREATE TABLE client_group_service_prices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscriber_id uuid NOT NULL,
 group_id uuid NOT NULL, service_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN('FIXED_PRICE','PERCENT_DISCOUNT','PERCENT_MARKUP')),
 value_units numeric(24,0) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,group_id,service_id),
 FOREIGN KEY(subscriber_id,group_id) REFERENCES reseller_client_groups(subscriber_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(subscriber_id,service_id) REFERENCES manual_services(subscriber_id,id) ON DELETE RESTRICT,
 CHECK((method='FIXED_PRICE' AND value_units>0 AND value_units<=999999999999999999999999)
 OR(method='PERCENT_DISCOUNT' AND value_units BETWEEN 0 AND 9999)
 OR(method='PERCENT_MARKUP' AND value_units BETWEEN 0 AND 1000000))
);
CREATE TABLE customer_service_prices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscriber_id uuid NOT NULL,
 customer_id uuid NOT NULL, service_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN('FIXED_PRICE','PERCENT_DISCOUNT','PERCENT_MARKUP')),
 value_units numeric(24,0) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,customer_id,service_id),
 FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(subscriber_id,service_id) REFERENCES manual_services(subscriber_id,id) ON DELETE RESTRICT,
 CHECK((method='FIXED_PRICE' AND value_units>0 AND value_units<=999999999999999999999999)
 OR(method='PERCENT_DISCOUNT' AND value_units BETWEEN 0 AND 9999)
 OR(method='PERCENT_MARKUP' AND value_units BETWEEN 0 AND 1000000))
);
ALTER TABLE service_orders ADD COLUMN pricing_snapshot jsonb,
 ADD COLUMN pricing_group_id uuid,
 ADD FOREIGN KEY(subscriber_id,pricing_group_id) REFERENCES reseller_client_groups(subscriber_id,id) ON DELETE RESTRICT;
-- Historical orders deliberately remain NULL, never reconstructed.
CREATE FUNCTION guard_order_pricing_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.pricing_snapshot IS DISTINCT FROM OLD.pricing_snapshot OR NEW.pricing_group_id IS DISTINCT FROM OLD.pricing_group_id
 THEN RAISE EXCEPTION 'Order pricing snapshot is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER order_pricing_snapshot_immutable BEFORE UPDATE ON service_orders FOR EACH ROW EXECUTE FUNCTION guard_order_pricing_snapshot();
-- Shared transaction lock for readers; exclusive for every pricing/config writer.
CREATE FUNCTION lock_pricing_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant uuid;
BEGIN
 IF TG_OP='DELETE' THEN tenant:=OLD.subscriber_id; ELSE tenant:=NEW.subscriber_id; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('bhru-client-pricing:'||tenant::text,0));
 IF TG_OP='UPDATE' AND NEW.subscriber_id IS DISTINCT FROM OLD.subscriber_id
 THEN RAISE EXCEPTION 'Pricing identity is immutable'; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME<>'subscriber_currencies' THEN
  IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Pricing identity is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER client_groups_pricing_lock BEFORE INSERT OR UPDATE OR DELETE ON reseller_client_groups FOR EACH ROW EXECUTE FUNCTION lock_pricing_write();
CREATE TRIGGER group_prices_pricing_lock BEFORE INSERT OR UPDATE OR DELETE ON client_group_service_prices FOR EACH ROW EXECUTE FUNCTION lock_pricing_write();
CREATE TRIGGER customer_prices_pricing_lock BEFORE INSERT OR UPDATE OR DELETE ON customer_service_prices FOR EACH ROW EXECUTE FUNCTION lock_pricing_write();
CREATE TRIGGER services_pricing_lock BEFORE INSERT OR UPDATE OR DELETE ON manual_services FOR EACH ROW EXECUTE FUNCTION lock_pricing_write();
CREATE TRIGGER service_groups_pricing_lock BEFORE INSERT OR UPDATE OR DELETE ON manual_service_groups FOR EACH ROW EXECUTE FUNCTION lock_pricing_write();
CREATE TRIGGER currency_pricing_lock BEFORE INSERT OR UPDATE OR DELETE ON subscriber_currencies FOR EACH ROW EXECUTE FUNCTION lock_pricing_write();
CREATE FUNCTION ensure_client_default_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO reseller_client_groups(subscriber_id,name,is_default) VALUES(NEW.id,'Standard',true);
 RETURN NEW;
END $$;
CREATE TRIGGER subscriber_client_default AFTER INSERT ON subscribers FOR EACH ROW EXECUTE FUNCTION ensure_client_default_group();
CREATE FUNCTION enforce_one_client_default() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tenant uuid;
BEGIN
 IF TG_OP='DELETE' THEN tenant:=OLD.subscriber_id; ELSE tenant:=NEW.subscriber_id; END IF;
 IF EXISTS(SELECT 1 FROM subscribers WHERE id=tenant)
 AND (SELECT count(*) FROM reseller_client_groups WHERE subscriber_id=tenant AND is_default AND is_active)<>1
 THEN RAISE EXCEPTION 'Exactly one active client default group is required'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER client_default_required AFTER INSERT OR UPDATE OR DELETE ON reseller_client_groups
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_one_client_default();
CREATE FUNCTION assign_client_default_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('bhru-client-pricing:'||NEW.subscriber_id::text,0));
  IF NEW.client_group_id IS NULL THEN SELECT id INTO NEW.client_group_id FROM reseller_client_groups WHERE subscriber_id=NEW.subscriber_id AND is_default AND is_active; END IF;
 ELSIF NEW.client_group_id IS NOT DISTINCT FROM OLD.client_group_id THEN RETURN NEW;
 ELSE PERFORM pg_advisory_xact_lock(hashtextextended('bhru-client-pricing:'||NEW.subscriber_id::text,0));
 END IF;
 IF NEW.client_group_id IS NULL OR NOT EXISTS(SELECT 1 FROM reseller_client_groups WHERE subscriber_id=NEW.subscriber_id AND id=NEW.client_group_id AND is_active)
 THEN RAISE EXCEPTION 'Customer must be assigned to an active tenant group'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_client_default BEFORE INSERT OR UPDATE OF client_group_id ON public_customer_accounts FOR EACH ROW EXECUTE FUNCTION assign_client_default_group();
CREATE TABLE client_group_admin_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscriber_id uuid NOT NULL REFERENCES subscribers(id),
 group_id uuid NOT NULL, actor_id uuid NOT NULL REFERENCES account_users(id), action text NOT NULL
 CHECK(action IN('created','updated','default_changed','deleted','pricing_changed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION immutable_client_group_admin_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM account_users WHERE id=NEW.actor_id AND subscriber_id=NEW.subscriber_id)
  THEN RAISE EXCEPTION 'Group audit requires its tenant owner'; END IF;
  RETURN NEW;
 END IF;
 RAISE EXCEPTION 'Group administration audit is immutable';
END $$;
CREATE TRIGGER validate_group_admin_events BEFORE INSERT ON client_group_admin_events FOR EACH ROW EXECUTE FUNCTION immutable_client_group_admin_event();
CREATE TRIGGER immutable_group_admin_events BEFORE UPDATE OR DELETE ON client_group_admin_events FOR EACH ROW EXECUTE FUNCTION immutable_client_group_admin_event();
-- Extend, not replace, the closed Activity validator from the preceding slice.
DO $$
DECLARE source text;
BEGIN
 SELECT pg_get_functiondef('validate_client_activity()'::regprocedure) INTO source;
 source:=replace(source,'(''profile_updated'',''PROFILE'',''customer_account'',''Profile updated''),',
 '(''customer_group_assigned'',''PROFILE'',''customer_account'',''Client group assigned''),(''customer_group_changed'',''PROFILE'',''customer_account'',''Client group changed''),(''customer_pricing_override_changed'',''PROFILE'',''customer_account'',''Customer service pricing changed''),(''profile_updated'',''PROFILE'',''customer_account'',''Profile updated''),');
 EXECUTE source;
END $$;
