-- Additive customer realm. No owner/admin accounts, orders or licence data change.
-- No tenant initialization/backfill is necessary: accounts are created on demand.
CREATE TABLE public_customer_accounts (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  first_name text NOT NULL CHECK (length(first_name) BETWEEN 1 AND 100),
  last_name text NOT NULL CHECK (length(last_name) BETWEEN 1 AND 100),
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 254 AND email=lower(btrim(email))),
  password_hash text NOT NULL CHECK (password_hash LIKE 'scrypt$%'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscriber_id,id),
  UNIQUE(subscriber_id,email)
);

CREATE TABLE public_customer_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  subscriber_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  FOREIGN KEY(subscriber_id,customer_id)
    REFERENCES public_customer_accounts(subscriber_id,id) ON DELETE CASCADE
);
CREATE INDEX public_customer_sessions_account ON public_customer_sessions(subscriber_id,customer_id);
CREATE INDEX public_customer_sessions_expiry ON public_customer_sessions(expires_at);
