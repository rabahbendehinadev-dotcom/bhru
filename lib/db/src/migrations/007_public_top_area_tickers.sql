-- Additive display controls only. Existing items, ordering and per-item settings
-- remain intact. NULL settings are mapped on read from the first enabled bar.
ALTER TABLE public_site_presentation
  ADD COLUMN logo_strip_settings jsonb,
  ADD COLUMN announcement_ticker_settings jsonb,
  ADD CONSTRAINT public_logo_strip_settings_valid CHECK (
    logo_strip_settings IS NULL OR (
      jsonb_typeof(logo_strip_settings)='object'
      AND logo_strip_settings ?& ARRAY['display','speed','direction','pause_on_hover']
      AND logo_strip_settings->>'display' IN ('static','moving')
      AND logo_strip_settings->>'speed' IN ('slow','normal','fast')
      AND logo_strip_settings->>'direction' IN ('left','right')
      AND jsonb_typeof(logo_strip_settings->'pause_on_hover')='boolean'
    )
  ),
  ADD CONSTRAINT public_announcement_ticker_settings_valid CHECK (
    announcement_ticker_settings IS NULL OR (
      jsonb_typeof(announcement_ticker_settings)='object'
      AND announcement_ticker_settings ?& ARRAY['display','speed','direction','pause_on_hover','background_color','text_color','separator']
      AND announcement_ticker_settings->>'display' IN ('static','moving')
      AND announcement_ticker_settings->>'speed' IN ('slow','normal','fast')
      AND announcement_ticker_settings->>'direction' IN ('left','right')
      AND jsonb_typeof(announcement_ticker_settings->'pause_on_hover')='boolean'
      AND announcement_ticker_settings->>'background_color' ~ '^#[0-9a-fA-F]{6}$'
      AND announcement_ticker_settings->>'text_color' ~ '^#[0-9a-fA-F]{6}$'
      AND jsonb_typeof(announcement_ticker_settings->'separator')='string'
      AND length(announcement_ticker_settings->>'separator')<=16
    )
  );
ALTER TABLE public_site_announcements
  ADD COLUMN icon_text text NOT NULL DEFAULT '' CHECK(length(icon_text)<=32);
