# BHRU E-Commerce — Phase 1, Development/Preview

## Scope and ownership

An optional subscriber module controlled exclusively by the existing independent Platform Admin.
The module entitlement and subscriber-controlled Store Open setting are separate. Neither a
revoked entitlement nor a closed store deletes products, categories, images, orders or customers.
All private requests derive ownership from the authenticated subscriber; request bodies cannot
select another subscriber. Public requests resolve the immutable subscriber slug, existing
licence eligibility, entitlement and Store Open setting without using subscriber cookies.

No payment gateway, paid-module checkout, customer accounts, variants, shipping integration,
custom domains or production operations are included.

## Additive migration

`lib/db/src/migrations/008_subscriber_ecommerce.sql` adds:

- `subscriber_modules`
- `store_settings`
- `store_categories`
- `store_products`
- `store_product_images`
- `store_orders`
- `store_order_items`
- `store_order_status_history`

It also adds `public_site_assets.media_scope` with an existing-compatible `website` default.
Commerce assets use the same persistent directory, ownership validation and image adapter,
but do not consume the existing website-image upload quota.

Migrations 001–007, their checksums, the migration runner and production entrypoint are unchanged.
Migration 008 has been applied only to the existing Development database through `db:migrate`.
No module grants, store settings, products, categories, orders or customers are seeded.

## Implementation files

- Backend: `artifacts/api-server/src/routes/commerce.ts` and
  `artifacts/api-server/src/lib/commerce/{validation,data,checkout,navigation,public-render,public-script}.ts`.
- Private UI: `artifacts/bhru/src/pages/ecommerce.tsx` and `src/hooks/use-commerce.ts`.
- Integrations: existing route registration, anonymous public-document bridge, startup schema
  readiness checks, media-reference protection, CMS asset quota, subscriber navigation and
  existing Platform Admin subscriber detail.
- API contract: additive commerce operations in `lib/api-spec/openapi.yaml`, regenerated API
  client/Zod outputs and explicit Zod barrel exports.

## API surface

All private commerce paths live beneath `/api` and require the existing subscriber authentication,
licence authorization and (except the access flag) active module entitlement.

- `GET /api/commerce/access`
- `GET /api/commerce/{overview|products|categories|orders|customers|settings}`
- `POST /api/commerce/{products|categories|settings|orders}`
- `DELETE /api/commerce/{products|categories}/{id}` — archive/disable, not hard deletion.
- `POST /api/commerce/assets` — raw PNG/JPEG, existing persistent media adapter.
- `DELETE /api/commerce/assets/{id}` — only unreferenced assets owned by the subscriber.
- `GET/PUT /api/platform/subscribers/{id}/modules/ecommerce` — Platform Admin only.
- `GET /api/public/commerce/{slug}/catalog`
- `POST /api/public/commerce/{slug}/quote`
- `POST /api/public/commerce/{slug}/orders`

List endpoints paginate products, orders and customers, 24 records per page. Categories are
bounded to 300. Products are limited to eight owned images. Commerce upload limits are
500 assets and 256 MiB per subscriber, with PNG/JPEG normalization through the existing adapter.

## Public routes

- `/{public_slug}` — existing V2 homepage with an optional product section after Hero/Banner.
- `/{public_slug}/product/{product_slug}`
- `/{public_slug}/cart`
- `/{public_slug}/checkout`
- `/{public_slug}/confirmation`

Existing public pages remain unchanged when the module is not enabled or the store is closed.
Store subroutes return a neutral missing-page response in those cases. New commerce pages
retain the existing Top Area, header and footer. No existing public-template component is replaced.
Cart controls and product navigation are added only to commerce-enabled documents.

## Money, orders and retry safety

Phase 1 supports DZD, USD, EUR, GBP and MAD, using two-decimal prices. Money is parsed as
integer minor units and calculated with BigInt. Currency cannot be changed after products or
orders exist, avoiding reinterpretation of existing amounts.

Checkout does not accept a browser-supplied amount, subscriber ID or order status. The server
rechecks ownership, published product state and availability, locks product rows, snapshots
names/SKUs/prices/images, totals the order and decrements tracked stock in one transaction.
Order status editing changes only the status and appends history; it does not rewrite snapshots
or automatically restore stock.

A store-scoped UUID checkout key, canonical request hash, database uniqueness constraint and
transaction advisory lock prevent duplicate submissions. Matching retries return the existing
receipt. Changed payloads under an existing key are rejected. Confirmation uses the receipt
in store-scoped sessionStorage; refreshing it never creates an order or fetches private order
data by reference. Pending submission keys survive a reload. No automatic POST occurs on GET.

Cart persistence contains only product IDs and quantities, under a per-slug key. Every cart/
checkout display requests current server prices. Unavailable lines and excess quantities are
reconciled by the quote endpoint; checkout itself rejects invalid or insufficient-stock requests.

## Media safety

All images reuse `BHRU_MEDIA_DIR`, documented in `BHRU_PUBLIC_MEDIA.md`. No new host path,
storage provider, volume or production environment variable is introduced. Product/category
ownership uses composite foreign keys. Referenced store and historical-order images are
protected from the existing CMS cleanup/delete paths. Public image eligibility also checks
module/store availability. Public product images have stable aspect-ratio containers and lazy loading.

## Manual test in Replit Preview

1. Enter the existing private Platform Admin area. Open the subscriber detail and enable
   its E-Commerce module. No grant is made automatically.
2. Sign in as that subscriber. Open **E-Commerce** (`/m/ecommerce`). The retained workspace
   contains Overview, Products, Categories, Orders, Customers and Settings.
3. In Settings keep DZD, set the title/checkout fields and open the store. Save.
4. Create category **Tools**, then active product **Chimera Tool** at **5000 DZD**, assigned
   to Tools. Upload its own image and optionally gallery images; save.
5. Follow the Public Store Address. Test category filter, product detail, gallery, Add to
   Cart, quantity changes, checkout name/phone and optional fields.
6. Submit a guest order. Confirm its reference, exact total, stored order details, New status
   and customer in the subscriber panel. Refresh confirmation: no duplicate order is created.
7. Change order status and check history; product edits must not change the saved order snapshot.
8. Use a second subscriber to check that it cannot edit/view the first subscriber's data.
9. Revoke the module in Platform Admin: subscriber APIs and public commerce access must stop,
   while saved data remains. Re-enable and confirm that the data is retained.
10. Check desktop/mobile manually. Existing CMS, Partner Strip, Announcement Tickers,
    Hero/Banner and subscriber/public navigation remain separate.

## Verification boundary

Type/build checks, migration application and minimal startup/unauthenticated API sanity checks
only. No browser/E2E/full regression suite, production migration, seed/reset, push or deployment.
Full interactive acceptance is intentionally left to the user's manual Preview test.
