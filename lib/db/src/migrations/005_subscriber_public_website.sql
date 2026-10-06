-- Additive CMS foundation. No subscriber, slug, account or subscription updates.
CREATE TABLE public_site_assets (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL REFERENCES subscribers(id),
  storage_key text NOT NULL UNIQUE CHECK (storage_key ~ '^[0-9a-f-]{36}\.(png|jpg)$'),
  content_type text NOT NULL CHECK (content_type IN ('image/png','image/jpeg')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  width integer NOT NULL CHECK (width > 0 AND width <= 4096),
  height integer NOT NULL CHECK (height > 0 AND height <= 4096),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id,subscriber_id)
);
CREATE INDEX public_site_assets_owner_idx ON public_site_assets(subscriber_id);

CREATE TABLE subscriber_public_sites (
  subscriber_id uuid PRIMARY KEY REFERENCES subscribers(id),
  display_name text NOT NULL DEFAULT '' CHECK (length(display_name)<=120),
  business_description text NOT NULL DEFAULT '' CHECK (length(business_description)<=500),
  primary_color text NOT NULL DEFAULT '#2563eb' CHECK (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  hero_badge text NOT NULL DEFAULT '' CHECK (length(hero_badge)<=120),
  hero_title text NOT NULL DEFAULT '' CHECK (length(hero_title)<=180),
  hero_description text NOT NULL DEFAULT '' CHECK (length(hero_description)<=1000),
  logo_asset_id uuid,
  hero_asset_id uuid,
  primary_cta_label text NOT NULL DEFAULT '' CHECK (length(primary_cta_label)<=60),
  primary_cta_destination text NOT NULL DEFAULT '' CHECK (length(primary_cta_destination)<=512),
  secondary_cta_label text NOT NULL DEFAULT '' CHECK (length(secondary_cta_label)<=60),
  secondary_cta_destination text NOT NULL DEFAULT '' CHECK (length(secondary_cta_destination)<=512),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(logo_asset_id,subscriber_id) REFERENCES public_site_assets(id,subscriber_id),
  FOREIGN KEY(hero_asset_id,subscriber_id) REFERENCES public_site_assets(id,subscriber_id)
);
-- Future CMS modules can reference subscriber_public_sites.subscriber_id.
-- Existing subscribers use renderer defaults until their first explicit save.
