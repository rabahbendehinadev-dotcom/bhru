CREATE TABLE subscribers (
  id uuid PRIMARY KEY,
  business text NOT NULL,
  notes text NOT NULL DEFAULT '',
  domain text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE account_users (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL UNIQUE REFERENCES subscribers(id),
  full_name text NOT NULL,
  username text NOT NULL UNIQUE CHECK (username = lower(username)),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  phone text NOT NULL,
  country text NOT NULL,
  password_hash text NOT NULL,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_admin_users (
  user_id uuid PRIMARY KEY REFERENCES account_users(id),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE plans (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  description text NOT NULL DEFAULT '',
  highlights text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL UNIQUE REFERENCES subscribers(id),
  plan_id uuid REFERENCES plans(id),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','TRIAL','ACTIVE','SUSPENDED','EXPIRED','REVOKED')),
  expires_at timestamptz,
  licence_key text UNIQUE,
  activated_at timestamptz,
  approved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('ACTIVE','TRIAL') OR (plan_id IS NOT NULL AND expires_at IS NOT NULL AND licence_key IS NOT NULL))
);
CREATE INDEX subscriptions_status_expiry ON subscriptions(status, expires_at);
CREATE TABLE activations (
  id uuid PRIMARY KEY,
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  actor_id uuid NOT NULL REFERENCES account_users(id),
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES account_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES account_users(id),
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  target_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_time ON audit_logs(created_at DESC);
CREATE TABLE auth_rate_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL,
  window_until timestamptz NOT NULL
);