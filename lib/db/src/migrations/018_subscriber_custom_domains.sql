CREATE TABLE subscriber_custom_domains (
 id uuid PRIMARY KEY,
 subscriber_id uuid NOT NULL REFERENCES subscribers(id),
 hostname text NOT NULL UNIQUE CHECK(hostname=lower(hostname) AND length(hostname)<=253),
 verification_token text NOT NULL CHECK(verification_token ~ '^[a-f0-9]{64}$'),
 verification_status text NOT NULL DEFAULT 'pending' CHECK(verification_status IN ('pending','verified')),
 dns_status text NOT NULL DEFAULT 'waiting' CHECK(dns_status IN ('waiting','ready','error')),
 tls_status text NOT NULL DEFAULT 'pending' CHECK(tls_status IN ('pending','ready','error')),
 is_primary boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz,
 activated_at timestamptz,
 last_checked_at timestamptz,
 dns_checked_at timestamptz,
 check_generation uuid,
 last_error text,
 CHECK(NOT is_primary OR (verification_status='verified' AND dns_status='ready' AND tls_status='ready'))
);
CREATE INDEX subscriber_custom_domains_owner ON subscriber_custom_domains(subscriber_id);
CREATE UNIQUE INDEX subscriber_custom_domains_one_primary ON subscriber_custom_domains(subscriber_id) WHERE is_primary;
