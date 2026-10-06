-- Additive CMS Phase 2. No updates to existing subscribers, slugs or licences.
CREATE TABLE public_site_presentation (
  subscriber_id uuid PRIMARY KEY REFERENCES subscribers(id),
  logo_strip_enabled boolean NOT NULL DEFAULT false,
  announcements_enabled boolean NOT NULL DEFAULT false,
  custom_html_enabled boolean NOT NULL DEFAULT false,
  custom_html text NOT NULL DEFAULT '' CHECK (length(custom_html)<=4096),
  hero_mode text NOT NULL DEFAULT 'classic' CHECK (hero_mode IN ('classic','banner')),
  slider_autoplay boolean NOT NULL DEFAULT true,
  slider_interval integer NOT NULL DEFAULT 5 CHECK (slider_interval IN (3,5,7,10)),
  revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public_site_partner_logos (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL REFERENCES public_site_presentation(subscriber_id),
  asset_id uuid NOT NULL,
  label text NOT NULL DEFAULT '' CHECK(length(label)<=120),
  destination text NOT NULL DEFAULT '' CHECK(length(destination)<=512),
  new_tab boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL CHECK(sort_order BETWEEN 0 AND 5),
  UNIQUE(subscriber_id,sort_order),
  FOREIGN KEY(asset_id,subscriber_id) REFERENCES public_site_assets(id,subscriber_id)
);
CREATE TABLE public_site_announcements (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL REFERENCES public_site_presentation(subscriber_id),
  enabled boolean NOT NULL DEFAULT true,
  text text NOT NULL CHECK(length(text) BETWEEN 1 AND 500),
  destination text NOT NULL DEFAULT '' CHECK(length(destination)<=512),
  background_color text NOT NULL CHECK(background_color ~ '^#[0-9a-fA-F]{6}$'),
  text_color text NOT NULL CHECK(text_color ~ '^#[0-9a-fA-F]{6}$'),
  movement text NOT NULL CHECK(movement IN ('static','scrolling')),
  direction text NOT NULL CHECK(direction IN ('left','right')),
  speed text NOT NULL CHECK(speed IN ('slow','normal','fast')),
  sort_order integer NOT NULL CHECK(sort_order BETWEEN 0 AND 7),
  UNIQUE(subscriber_id,sort_order)
);
CREATE TABLE public_site_banners (
  id uuid PRIMARY KEY,
  subscriber_id uuid NOT NULL REFERENCES public_site_presentation(subscriber_id),
  asset_id uuid NOT NULL,
  alt_text text NOT NULL DEFAULT '' CHECK(length(alt_text)<=180),
  destination text NOT NULL DEFAULT '' CHECK(length(destination)<=512),
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL CHECK(sort_order BETWEEN 0 AND 7),
  UNIQUE(subscriber_id,sort_order),
  FOREIGN KEY(asset_id,subscriber_id) REFERENCES public_site_assets(id,subscriber_id)
);
CREATE INDEX public_site_partner_logos_asset_idx ON public_site_partner_logos(subscriber_id,asset_id);
CREATE INDEX public_site_banners_asset_idx ON public_site_banners(subscriber_id,asset_id);
