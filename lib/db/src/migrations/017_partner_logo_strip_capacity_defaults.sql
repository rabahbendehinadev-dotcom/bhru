-- Widen the legacy six-position constraint, without adding a database count cap.
-- No existing logos, presentation values, asset references or monetary data change.
-- Serialize registrations while installing their new configuration initializer.
LOCK TABLE subscribers IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public_site_partner_logos
 DROP CONSTRAINT IF EXISTS public_site_partner_logos_sort_order_check;
ALTER TABLE public_site_partner_logos
 ADD CONSTRAINT public_partner_logo_order_nonnegative CHECK(sort_order>=0);

-- Defaults affect future rows only. Existing Static/Moving settings stay untouched.
ALTER TABLE public_site_presentation ALTER COLUMN logo_strip_enabled SET DEFAULT true;
ALTER TABLE public_site_presentation ALTER COLUMN logo_strip_settings
 SET DEFAULT '{"display":"moving","speed":"normal","direction":"left","pause_on_hover":true}'::jsonb;

-- Initialize future subscribers atomically, without adding sample logos.
CREATE FUNCTION bhru_initial_public_presentation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public_site_presentation(subscriber_id) VALUES(NEW.id)
 ON CONFLICT(subscriber_id) DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER bhru_initial_public_presentation
 AFTER INSERT ON subscribers FOR EACH ROW EXECUTE FUNCTION bhru_initial_public_presentation();
