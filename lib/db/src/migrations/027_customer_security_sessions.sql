-- Prospective customer security. Preserve all credentials, session tokens and expiry.
ALTER TABLE public_customer_sessions
  ADD COLUMN session_public_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN revoked_at timestamptz,
  ADD COLUMN ip_address inet,
  ADD COLUMN user_agent text CHECK(length(user_agent)<=500),
  ADD COLUMN device_label text CHECK(length(device_label)<=120);
CREATE UNIQUE INDEX public_customer_sessions_public_id ON public_customer_sessions(session_public_id);
CREATE INDEX public_customer_sessions_active ON public_customer_sessions(subscriber_id,customer_id,expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE customer_security_state (
  subscriber_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  failed_count integer NOT NULL DEFAULT 0 CHECK(failed_count>=0),
  failure_window_started_at timestamptz,
  locked_until timestamptz,
  password_changed_at timestamptz,
  PRIMARY KEY(subscriber_id,customer_id),
  FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id)
);
CREATE TABLE customer_login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  result text NOT NULL CHECK(result IN ('success','failed','locked','blocked')),
  session_public_id uuid,
  ip_address inet,
  user_agent text CHECK(length(user_agent)<=500),
  device_label text NOT NULL CHECK(length(device_label)<=120),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id)
);
CREATE INDEX customer_login_history_recent ON customer_login_history(subscriber_id,customer_id,created_at DESC,id DESC);
CREATE INDEX customer_login_history_success ON customer_login_history(subscriber_id,customer_id,created_at DESC,id DESC)
  WHERE result='success';
CREATE TRIGGER customer_login_history_immutable BEFORE UPDATE OR DELETE ON customer_login_history
  FOR EACH ROW EXECUTE FUNCTION immutable_wallet_ledger();

CREATE TABLE customer_password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id),
  CHECK(expires_at>created_at)
);
CREATE INDEX customer_password_resets_account ON customer_password_resets(subscriber_id,customer_id,created_at DESC);
CREATE INDEX customer_password_resets_expiry ON customer_password_resets(expires_at) WHERE used_at IS NULL;

-- Extend ONLY the closed taxonomy in the existing validator. Its actor/reference,
-- immutable financial attribution and metadata validation remain byte-for-byte intact.
-- Fail closed if the expected approved registry is not present.
DO $migration$
DECLARE definition text;
  anchor text := '(''customer_logged_out'',''SECURITY'',''customer_account'',''Customer logged out'')';
BEGIN
  SELECT pg_get_functiondef('validate_client_activity()'::regprocedure) INTO definition;
  IF strpos(definition,anchor)=0 THEN RAISE EXCEPTION 'Expected Slice 3 activity registry is missing'; END IF;
  EXECUTE replace(definition,anchor,anchor || $registry$,
    ('login_success','SECURITY','customer_account','Successful login'),
    ('login_failed','SECURITY','customer_account','Login denied'),
    ('login_locked','SECURITY','customer_account','Temporary login lockout'),
    ('password_changed','SECURITY','customer_account','Password changed'),
    ('password_reset_requested','SECURITY','customer_account','Password reset requested'),
    ('password_reset_completed','SECURITY','customer_account','Password reset completed'),
    ('session_revoked','SECURITY','customer_account','Session revoked'),
    ('all_other_sessions_revoked','SECURITY','customer_account','Other sessions signed out'),
    ('reseller_force_logout','SECURITY','customer_account','Reseller signed out client sessions')
  $registry$);
END $migration$;
