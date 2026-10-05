-- Preserve historical membership rows and subscriber/business data, but revoke
-- the old subscriber-backed administrative memberships. No credentials are
-- copied from account_users: the owner must bootstrap an independent account.
ALTER TABLE platform_admin_users DROP CONSTRAINT platform_admin_users_user_id_fkey;
ALTER TABLE platform_admin_users RENAME COLUMN user_id TO id;
ALTER TABLE platform_admin_users ADD COLUMN email text UNIQUE;
ALTER TABLE platform_admin_users ADD COLUMN password_hash text;
ALTER TABLE platform_admin_users ADD COLUMN full_name text NOT NULL DEFAULT 'Platform Administrator';
ALTER TABLE platform_admin_users ADD COLUMN last_login timestamptz;
UPDATE platform_admin_users SET enabled=false;
ALTER TABLE platform_admin_users ADD CONSTRAINT platform_admin_credentials
  CHECK (NOT enabled OR (email IS NOT NULL AND password_hash IS NOT NULL));
ALTER TABLE platform_admin_users ADD CONSTRAINT platform_admin_email_normalized
  CHECK (email IS NULL OR (email=lower(trim(email)) AND length(email)>3));

CREATE TABLE platform_admin_sessions (
  token_hash text PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES platform_admin_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX platform_admin_sessions_admin ON platform_admin_sessions(admin_id);
CREATE INDEX platform_admin_sessions_expiry ON platform_admin_sessions(expires_at);

-- Existing subscriber actors remain intact; new administrative events use
-- an independent FK and never require an account_users row.
ALTER TABLE audit_logs ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE audit_logs ADD COLUMN admin_actor_id uuid REFERENCES platform_admin_users(id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_exactly_one_actor
  CHECK (num_nonnulls(actor_id,admin_actor_id)=1);
ALTER TABLE activations ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE activations ADD COLUMN admin_actor_id uuid REFERENCES platform_admin_users(id);
ALTER TABLE activations ADD CONSTRAINT activation_exactly_one_actor
  CHECK (num_nonnulls(actor_id,admin_actor_id)=1);