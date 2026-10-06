-- Phase 1 only. No public HTTP routes, content, domains or licence changes.
-- The migration runner supplies the existing private entry as transaction-local
-- configuration; no private route value is hardcoded into source.
ALTER TABLE public.subscribers ADD COLUMN public_slug text;

CREATE FUNCTION public.bhru_slug_reserved(candidate text, private_segment text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(lower(candidate), '') = ANY(ARRAY[
    'login','register','dashboard','settings','m','api','admin','assets',
    'brand','pwa','healthz','src',coalesce(lower(private_segment), '')
  ]);
$$;

-- Versioned by this immutable migration. Registration and backfill use exactly
-- the same normalizer. Original business/company names are never rewritten.
CREATE FUNCTION public.bhru_slug_base(business_name text, subscriber_id uuid, private_segment text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  base text;
BEGIN
  base := lower(normalize(btrim(business_name), NFKD));
  base := replace(replace(replace(base, 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe');
  base := replace(base, 'þ', 'th');
  base := translate(base, 'øłđð', 'oldd');
  base := left(regexp_replace(base, '[^a-z0-9]', '', 'g'), 63);
  IF base = '' OR public.bhru_slug_reserved(base, private_segment) THEN
    base := 'business-' || left(md5(subscriber_id::text), 12);
  END IF;
  RETURN base;
END;
$$;

CREATE FUNCTION public.bhru_slug_candidate(base text, attempt integer)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN attempt = 1 THEN base
    ELSE left(base, 63 - length('-' || attempt::text)) || '-' || attempt::text END;
$$;

ALTER TABLE public.subscribers
  ADD CONSTRAINT subscribers_public_slug_unique UNIQUE (public_slug),
  ADD CONSTRAINT subscribers_public_slug_format CHECK (public_slug IS NULL OR (
    char_length(public_slug) BETWEEN 1 AND 63
    AND public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    AND NOT public.bhru_slug_reserved(public_slug, NULL)
  ));

-- ON CONFLICT only handles the slug constraint. Other errors still abort the
-- caller's transaction. Competing uncommitted inserts are arbitrated by the
-- unique index; rollback frees the candidate for another registration.
CREATE FUNCTION public.bhru_create_subscriber(
  subscriber_id uuid, business_name text, private_segment text
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  base text := public.bhru_slug_base(business_name, subscriber_id, private_segment);
  candidate text;
  allocated text;
  attempt integer := 1;
BEGIN
  IF private_segment IS NULL OR private_segment = '' THEN
    RAISE EXCEPTION 'Private entry reservation is required';
  END IF;
  LOOP
    candidate := public.bhru_slug_candidate(base, attempt);
    IF NOT public.bhru_slug_reserved(candidate, private_segment) THEN
      INSERT INTO public.subscribers(id, business, public_slug)
        VALUES(subscriber_id, business_name, candidate)
        ON CONFLICT ON CONSTRAINT subscribers_public_slug_unique DO NOTHING
        RETURNING public_slug INTO allocated;
      IF allocated IS NOT NULL THEN RETURN allocated; END IF;
    END IF;
    attempt := attempt + 1;
    -- The application's statement timeout also bounds the entire allocation.
    IF attempt > 100000 THEN
      RAISE EXCEPTION 'Public slug allocation limit exceeded' USING ERRCODE = '54000';
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.bhru_backfill_public_slugs(private_segment text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  subscriber record;
  base text;
  candidate text;
  attempt integer;
  assigned integer := 0;
BEGIN
  IF private_segment IS NULL OR private_segment = '' THEN
    RAISE EXCEPTION 'Private entry reservation is required';
  END IF;
  -- Block writers while preserving a deterministic ordering of legacy rows.
  -- The enclosing migration is atomic; an error rolls back all assignments.
  LOCK TABLE public.subscribers IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.subscribers
    WHERE public_slug = lower(private_segment)) THEN
    RAISE EXCEPTION 'Private entry conflicts with an assigned public slug';
  END IF;
  FOR subscriber IN SELECT id, business FROM public.subscribers
    WHERE public_slug IS NULL ORDER BY created_at, id
  LOOP
    base := public.bhru_slug_base(subscriber.business, subscriber.id, private_segment);
    attempt := 1;
    LOOP
      candidate := public.bhru_slug_candidate(base, attempt);
      IF NOT public.bhru_slug_reserved(candidate, private_segment)
        AND NOT EXISTS (SELECT 1 FROM public.subscribers WHERE public_slug = candidate) THEN
        UPDATE public.subscribers SET public_slug = candidate WHERE id = subscriber.id;
        assigned := assigned + 1;
        EXIT;
      END IF;
      attempt := attempt + 1;
    END LOOP;
  END LOOP;
  RETURN assigned;
END;
$$;

SELECT public.bhru_backfill_public_slugs(
  current_setting('bhru.private_admin_segment', true)
);
ALTER TABLE public.subscribers ALTER COLUMN public_slug SET NOT NULL;

CREATE FUNCTION public.bhru_guard_immutable_slug()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_slug IS DISTINCT FROM OLD.public_slug THEN
    RAISE EXCEPTION 'Subscriber public slug is immutable'
      USING ERRCODE = '23514', CONSTRAINT = 'subscribers_public_slug_immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER subscribers_public_slug_immutable
  BEFORE UPDATE OF public_slug ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.bhru_guard_immutable_slug();
