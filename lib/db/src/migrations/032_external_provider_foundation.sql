-- Additive, read-only upstream integration. No paid dispatch in Slice 7A.
CREATE TABLE external_providers (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL REFERENCES subscribers(id),
 protocol text NOT NULL CHECK(protocol='fusion_rest'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 base_url text NOT NULL, credentials_encrypted jsonb NOT NULL,
 config_version integer NOT NULL DEFAULT 1,
 currency text CHECK(currency ~ '^[A-Z]{3}$'),
 enabled boolean NOT NULL DEFAULT true,
 health text NOT NULL DEFAULT 'NOT_TESTED' CHECK(health IN
 ('NOT_TESTED','CONNECTED','AUTH_FAILED','UNREACHABLE','INVALID_RESPONSE','DISABLED','SYNC_FAILED')),
 balance text, last_test_at timestamptz, last_sync_at timestamptz,
 safe_error text, pricing_policy jsonb NOT NULL DEFAULT '{"percentage":"0","fixedUsd":"0","groups":[]}',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,id)
);
CREATE TABLE external_provider_jobs (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL, provider_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES account_users(id),
 kind text NOT NULL CHECK(kind IN ('TEST','SYNC')),
 state text NOT NULL DEFAULT 'QUEUED' CHECK(state IN
 ('QUEUED','RUNNING','COMPLETED','COMPLETED_WITH_WARNINGS','FAILED')),
 config_version integer NOT NULL, attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 4),
 lease_token uuid, lease_until timestamptz, next_attempt_at timestamptz NOT NULL DEFAULT now(),
 started_at timestamptz, completed_at timestamptz, safe_error text,
 counts jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(subscriber_id,provider_id) REFERENCES external_providers(subscriber_id,id),
 UNIQUE(subscriber_id,provider_id,id)
);
CREATE UNIQUE INDEX external_provider_one_live_job ON external_provider_jobs(subscriber_id,provider_id)
 WHERE state IN ('QUEUED','RUNNING');
CREATE INDEX external_provider_job_claim ON external_provider_jobs(state,next_attempt_at,created_at);
CREATE INDEX external_provider_history ON external_provider_jobs(subscriber_id,provider_id,created_at DESC);
CREATE TABLE external_provider_catalog (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL, provider_id uuid NOT NULL,
 upstream_id text NOT NULL CHECK(length(upstream_id) BETWEEN 1 AND 128),
 name text NOT NULL, service_type text, category_id text, category_name text,
 cost_units numeric(24,0) NOT NULL CHECK(cost_units BETWEEN 0 AND 9999999999990000000000),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), estimated_time text NOT NULL,
 requirements jsonb NOT NULL, source_snapshot jsonb NOT NULL, source_hash text NOT NULL,
 previous_snapshot jsonb, changes jsonb NOT NULL DEFAULT '[]',
 review_reasons jsonb NOT NULL, availability boolean,
 missing boolean NOT NULL DEFAULT false, last_job_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,provider_id,upstream_id), UNIQUE(subscriber_id,provider_id,id),
 FOREIGN KEY(subscriber_id,provider_id) REFERENCES external_providers(subscriber_id,id),
 FOREIGN KEY(subscriber_id,provider_id,last_job_id) REFERENCES external_provider_jobs(subscriber_id,provider_id,id)
);
CREATE INDEX external_provider_catalog_browse ON external_provider_catalog(subscriber_id,provider_id,category_id,id);
ALTER TABLE manual_services ADD COLUMN fulfillment_source text NOT NULL DEFAULT 'manual'
 CHECK(fulfillment_source IN ('manual','external_provider'));
ALTER TABLE manual_services ADD CONSTRAINT external_service_not_dispatch_ready
 CHECK(fulfillment_source='manual' OR NOT active);
CREATE TABLE external_provider_service_links (
 subscriber_id uuid NOT NULL, provider_id uuid NOT NULL, catalog_id uuid NOT NULL,
 service_id uuid NOT NULL, imported_source_hash text NOT NULL,
 imported_cost_units numeric(24,0) NOT NULL, imported_currency text NOT NULL,
 imported_fx_rate text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(subscriber_id,provider_id,catalog_id), UNIQUE(subscriber_id,service_id),
 FOREIGN KEY(subscriber_id,provider_id,catalog_id) REFERENCES external_provider_catalog(subscriber_id,provider_id,id),
 FOREIGN KEY(subscriber_id,service_id) REFERENCES manual_services(subscriber_id,id)
);
-- Ordinary service editing cannot turn an external import into an active manual service.
CREATE FUNCTION bhru_preserve_fulfillment_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.fulfillment_source IS DISTINCT FROM OLD.fulfillment_source THEN
   RAISE EXCEPTION 'Fulfillment source is immutable in Slice 7A';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_service_fulfillment_source BEFORE UPDATE ON manual_services
 FOR EACH ROW EXECUTE FUNCTION bhru_preserve_fulfillment_source();
