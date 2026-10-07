# BHRU USD money foundation

Development implementation only. Nothing here deploys or migrates the VPS.

## Money contract

- Model **2**: permanent accounting reference USD; rate `1.000000`.
- Canonical USD is an integer scaled by **10^12** (12 decimal places), stored as
  PostgreSQL `numeric(30,0)` and transported as a string. `50.00 USD` is
  `50000000000000` units. Arithmetic uses `BigInt`, never floating-point money.
- Product `price_usd_units` and `compare_at_usd_units` are authoritative.
  Existing `_minor` product fields are derived, rounded cent projections in model 2,
  not a second editable price. Model 1 keeps their original legacy meaning.
- `provider_cost_usd_units` prepares for precise provider costs. Future margins can
  be calculated as selling units minus cost units at the same scale. No provider,
  synchronization, markup or margin policy is implemented.
- Manual rate = **target currency units per USD**, at six decimal places.
  `260.000000 DZD` means 1 USD = 260 DZD. No external FX service.
- Conversion uses exact scaled integers and half-up presentation rounding.
  Customer totals sum rounded unit amounts × quantity, matching the displayed lines.
- Canonical base totals separately retain the exact unrounded USD economics.

## Independent choices

**Reference:** immutable USD, fixed rate and permanent required currency entry.
USD stays enabled and cannot be deleted. Prefix/suffix/format remain editable.

**Client Default:** exactly one enabled, rate-configured currency. It may be DZD,
EUR or USD without changing the accounting reference.

**Panel Display Currency:** stored on the authenticated subscriber user's account.
The server checks tenant ownership and enabled currencies. A removed/disabled
preference resolves to enabled USD, otherwise the enabled Client Default.
Only presentation changes; product editors explicitly accept USD.
Currency query data is refreshed on mount/focus and every 60 seconds, and is not
retained after the final subscriber observer unmounts.

**Visitor currency:** existing tenant-separated public preference. A first visit uses
Client Default; subsequent visits retain the visitor's enabled choice.

## Checkout and immutable history

The server quotes and checks out from canonical USD units. It validates the
submitted six-decimal rate against the current tenant rate and rejects a stale rate.
Orders and lines retain canonical USD units plus immutable customer currency,
rate, number format, precision, converted unit amounts, line amounts and total.
Order lists/details use the saved customer amounts, not today's rates or panel
selection. Confirmation locks to the original receipt currency. Legacy receipts
without snapshots retain their original currency/cent interpretation; today's
reference currency is never substituted.

## Additive migrations after 011

1. `012_0_usd_reference_readiness.sql`: compatibility preflight for existing **USD**
   reference stores whose USD display row was hidden/deleted under migration 010.
   Restores the required USD entry without changing monetary values or Client Default.
2. `012_usd_money_foundation.sql`: expanded precision and model/version columns,
   conversion-provenance structure, exact cent-to-unit expansion for existing USD
   products, permanent-reference and historical-money guards.
3. `013_empty_subscriber_usd_initialization.sql`: separately initializes eligible
   empty legacy stores and adds the per-user display preference.

No migrations 001–011 were edited. The existing checksum ledger, transaction and
advisory-lock migration runner and Docker startup command remain unchanged:
`node migrate.mjs && exec node index.mjs`.

## Legacy DZD and other non-USD references

An empty store is initialized only when it has **zero products (including archived)**,
**zero orders**, and exactly one original reference currency at rate 1.
The original currency row is retained but disabled and `rate_configured=false`.
USD becomes the initial enabled default. The old `DZD = 1` is **not** silently
treated as a USD-relative rate. Configure its explicit manual rate before enabling it.

Non-USD stores containing any product/order, or ambiguous existing currency
configuration, remain model 1. Their current reference/prices/history are preserved.
Ordinary currency/reference and product-price writes are blocked pending approval;
legacy storefront quoting/checkout remain compatible with the legacy denomination.

No populated non-USD conversion is performed. `currency_conversion_provenance`
requires an approved exact rational USD basis, original reference, original-money
record and approval note/time. Cutover additionally requires reconciled canonical
product amounts and cent projections. Completed provenance is immutable.
This phase does **not** provide a legacy conversion operator/UI; an explicit reviewed
conversion procedure is required before any populated legacy cutover.

## Manual acceptance in Replit Preview

- **Currencies:** `/m/currencies`. Set DZD to `260.000000`, enable it and make it
  Client Default. Add EUR with `0.860000`. USD must stay fixed at `1.000000`.
- **Products:** `/m/ecommerce` → Products. Create `Selling Price (USD) = 50.00`.
  Also reopen/edit `0.125`, `0.4875`, `1.0032`, `19.230769` to check precision.
- **Panel header:** select USD, DZD, EUR; verify approximately 50.00, 13,000.00,
  43.00 respectively with the configured formats. Reopen product edit: still 50 USD.
  Sign out/in to check persistence; remove/disable a non-default display selection
  to check fallback.
- **Public store:** `/{public_slug}` (use E-Commerce's View Store link). With store
  enabled, first-visit currency is DZD; switch USD/EUR and reload.
- **Cart/checkout:** `/{public_slug}/cart`, `/{public_slug}/checkout`. Place a manual
  guest order at DZD 260; change rate to 270. Current prices become 13,500 DZD while
  **Orders** and `/{public_slug}/confirmation` retain the saved 13,000 DZD receipt.
- Product, category, order and store availability still follow existing entitlement,
  licence and eligibility rules.

Short validation only: API/frontend/library type checks, API/frontend builds,
pure money calculation checks and Development migration sanity. No browser/E2E
or full regression run. No Production access, push or deployment.
