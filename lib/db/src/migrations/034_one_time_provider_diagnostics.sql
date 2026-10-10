-- Additive: no changes to existing jobs, providers, credentials or rate limits.
CREATE TABLE external_provider_test_authorizations (
 subscriber_id uuid NOT NULL,
 provider_id uuid NOT NULL,
 job_id uuid PRIMARY KEY,
 admin_actor_id uuid NOT NULL REFERENCES platform_admin_users(id),
 request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '5 minutes',
 consumed_at timestamptz,
 permit_lease uuid,
 state text NOT NULL DEFAULT 'AUTHORIZED' CHECK(state IN ('AUTHORIZED','CONSUMED','EXPIRED','REJECTED')),
 FOREIGN KEY(subscriber_id,provider_id,job_id)
   REFERENCES external_provider_jobs(subscriber_id,provider_id,id),
 UNIQUE(subscriber_id,admin_actor_id,request_key),
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes'),
 CHECK((consumed_at IS NULL AND permit_lease IS NULL AND state IN ('AUTHORIZED','EXPIRED','REJECTED'))
    OR (consumed_at IS NOT NULL AND permit_lease IS NOT NULL AND state IN ('CONSUMED','EXPIRED','REJECTED')))
);
