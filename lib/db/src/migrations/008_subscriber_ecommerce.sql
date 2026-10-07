-- Additive optional commerce module. Existing public-site/licence data is untouched.
ALTER TABLE public_site_assets ADD COLUMN media_scope text NOT NULL DEFAULT 'website' CHECK(media_scope IN ('website','commerce'));
CREATE TABLE subscriber_modules (
 subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
 module_key text NOT NULL CHECK(module_key ~ '^[a-z][a-z0-9_]{0,63}$'),
 enabled boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(subscriber_id,module_key)
);
CREATE TABLE store_settings (
 subscriber_id uuid PRIMARY KEY REFERENCES subscribers(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT false, title text NOT NULL DEFAULT 'Our Products',
 currency text NOT NULL DEFAULT 'DZD' CHECK(currency IN ('DZD','USD','EUR','GBP','MAD','TND')),
 featured_first boolean NOT NULL DEFAULT true,
 email_mode text NOT NULL DEFAULT 'optional' CHECK(email_mode IN ('hidden','optional','required')),
 address_mode text NOT NULL DEFAULT 'optional' CHECK(address_mode IN ('hidden','optional','required')),
 show_state boolean NOT NULL DEFAULT true, show_city boolean NOT NULL DEFAULT true, show_note boolean NOT NULL DEFAULT true,
 whatsapp text NOT NULL DEFAULT '', confirmation_message text NOT NULL DEFAULT 'Thank you. Your order has been received.',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE store_categories (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
 name text NOT NULL, slug text NOT NULL CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 description text NOT NULL DEFAULT '', image_id uuid, enabled boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
 UNIQUE(subscriber_id,id), UNIQUE(subscriber_id,slug),
 FOREIGN KEY(subscriber_id,image_id) REFERENCES public_site_assets(subscriber_id,id)
);
CREATE TABLE store_products (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE, category_id uuid,
 name text NOT NULL, slug text NOT NULL CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 short_description text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '', sku text NOT NULL DEFAULT '',
 price_minor bigint NOT NULL CHECK(price_minor BETWEEN 0 AND 999999999999),
 compare_at_minor bigint CHECK(compare_at_minor BETWEEN 0 AND 999999999999),
 active boolean NOT NULL DEFAULT false, archived boolean NOT NULL DEFAULT false, featured boolean NOT NULL DEFAULT false,
 in_stock boolean NOT NULL DEFAULT true, stock_quantity integer CHECK(stock_quantity>=0), sort_order integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,id), UNIQUE(subscriber_id,slug),
 FOREIGN KEY(subscriber_id,category_id) REFERENCES store_categories(subscriber_id,id),
 CHECK(compare_at_minor IS NULL OR compare_at_minor>=price_minor)
);
CREATE TABLE store_product_images (
 subscriber_id uuid NOT NULL, product_id uuid NOT NULL, asset_id uuid NOT NULL, sort_order integer NOT NULL DEFAULT 0,
 PRIMARY KEY(subscriber_id,product_id,asset_id),
 FOREIGN KEY(subscriber_id,product_id) REFERENCES store_products(subscriber_id,id) ON DELETE CASCADE,
 FOREIGN KEY(subscriber_id,asset_id) REFERENCES public_site_assets(subscriber_id,id)
);
CREATE TABLE store_orders (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
 reference text NOT NULL UNIQUE, checkout_key uuid NOT NULL, request_hash text NOT NULL,
 customer_name text NOT NULL, phone text NOT NULL, email text NOT NULL DEFAULT '', state text NOT NULL DEFAULT '',
 city text NOT NULL DEFAULT '', address text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
 subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0), total_minor bigint NOT NULL CHECK(total_minor>=0),
 currency text NOT NULL,
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','confirmed','processing','completed','cancelled')),
 payment_status text NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(subscriber_id,id), UNIQUE(subscriber_id,checkout_key)
);
CREATE TABLE store_order_items (
 id uuid PRIMARY KEY, subscriber_id uuid NOT NULL, order_id uuid NOT NULL, product_id uuid NOT NULL,
 product_name text NOT NULL, sku text NOT NULL, image_key text NOT NULL DEFAULT '',
 unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0), quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 99),
 line_total_minor bigint NOT NULL CHECK(line_total_minor>=0),
 FOREIGN KEY(subscriber_id,order_id) REFERENCES store_orders(subscriber_id,id) ON DELETE CASCADE,
 FOREIGN KEY(subscriber_id,product_id) REFERENCES store_products(subscriber_id,id)
);
CREATE TABLE store_order_status_history (
 id bigserial PRIMARY KEY, subscriber_id uuid NOT NULL, order_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('new','confirmed','processing','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(subscriber_id,order_id) REFERENCES store_orders(subscriber_id,id) ON DELETE CASCADE
);
CREATE INDEX store_products_catalog ON store_products(subscriber_id,active,sort_order,created_at DESC) WHERE NOT archived;
CREATE INDEX store_orders_recent ON store_orders(subscriber_id,created_at DESC);
CREATE INDEX store_orders_customer ON store_orders(subscriber_id,phone,created_at DESC);
CREATE INDEX store_product_asset ON store_product_images(subscriber_id,asset_id);
