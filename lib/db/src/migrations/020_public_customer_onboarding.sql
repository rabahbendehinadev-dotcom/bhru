-- Extend the existing canonical customer identity. Passwords/sessions are untouched.
ALTER TABLE public_customer_accounts
  ADD COLUMN client_code text,
  ADD COLUMN username text,
  ADD COLUMN whatsapp_phone text,
  ADD COLUMN preferred_language text,
  ADD COLUMN preferred_currency text,
  ADD COLUMN newsletter_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN address_line_1 text,
  ADD COLUMN address_line_2 text,
  ADD COLUMN country_code text,
  ADD COLUMN state text,
  ADD COLUMN city text,
  ADD COLUMN postal_code text,
  ADD COLUMN terms_accepted_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_login_at timestamptz,
  ADD CONSTRAINT public_customer_phone_format CHECK (whatsapp_phone IS NULL OR whatsapp_phone ~ '^\+[1-9][0-9]{6,14}$'),
  ADD CONSTRAINT public_customer_code_format CHECK (client_code IS NULL OR client_code ~ '^[A-Z0-9]{8}$'),
  ADD CONSTRAINT public_customer_username_format CHECK (username IS NULL OR username ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$');
CREATE UNIQUE INDEX public_customer_client_code_unique ON public_customer_accounts(subscriber_id,client_code);
CREATE UNIQUE INDEX public_customer_username_unique ON public_customer_accounts(subscriber_id,lower(username));

-- Backfill codes only, not identity/contact/consent information. Unique constraints
-- are present before allocation; a collision retries without changing any account ID.
DO $$
DECLARE account record; generated text;
BEGIN
  FOR account IN SELECT id,subscriber_id FROM public_customer_accounts WHERE client_code IS NULL ORDER BY id LOOP
    LOOP
      generated := upper(substr(md5(random()::text || account.id::text || clock_timestamp()::text),1,8));
      BEGIN
        UPDATE public_customer_accounts SET client_code=generated,username=coalesce(username,generated) WHERE id=account.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        NULL;
      END;
    END LOOP;
  END LOOP;
END $$;
ALTER TABLE public_customer_accounts ALTER COLUMN client_code SET NOT NULL;
ALTER TABLE public_customer_accounts ALTER COLUMN username SET NOT NULL;
CREATE FUNCTION bhru_customer_client_code_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.client_code IS DISTINCT FROM OLD.client_code THEN
    RAISE EXCEPTION 'Customer client code is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER public_customer_immutable_code BEFORE UPDATE OF client_code ON public_customer_accounts
  FOR EACH ROW EXECUTE FUNCTION bhru_customer_client_code_immutable();
CREATE INDEX public_customer_registered_clients ON public_customer_accounts(subscriber_id,enabled,created_at DESC,id);
CREATE INDEX public_customer_phone_lookup ON public_customer_accounts(subscriber_id,whatsapp_phone);

ALTER TABLE store_orders ADD COLUMN customer_id uuid,
  ADD CONSTRAINT store_order_registered_customer FOREIGN KEY(subscriber_id,customer_id)
    REFERENCES public_customer_accounts(subscriber_id,id) ON DELETE RESTRICT;
CREATE INDEX store_order_customer ON store_orders(subscriber_id,customer_id,created_at DESC);
-- Deliberately do not backfill guest orders using phone/email matching.

CREATE TABLE public_customer_registration_challenges (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  binding_hash text NOT NULL,
  answer_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX public_customer_challenge_expiry ON public_customer_registration_challenges(subscriber_id,expires_at);
CREATE TABLE reseller_client_notes (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  author_id uuid REFERENCES account_users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id) ON DELETE CASCADE
);
CREATE INDEX reseller_client_notes_account ON reseller_client_notes(subscriber_id,customer_id,created_at DESC);
CREATE TABLE public_customer_activity (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  actor_id uuid REFERENCES account_users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK(action IN ('registered','login','profile_updated','blocked','reactivated','note_added')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(subscriber_id,customer_id) REFERENCES public_customer_accounts(subscriber_id,id) ON DELETE CASCADE
);
CREATE INDEX public_customer_activity_account ON public_customer_activity(subscriber_id,customer_id,created_at DESC);
