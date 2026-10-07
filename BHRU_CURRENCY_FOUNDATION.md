# BHRU USD money foundation

Source implementation in Replit. The real application/database run on Dokploy/VPS;
Replit Development subscriber data is not evidence of the real installation's state.
The user pushes/deploys and manually tests against the VPS database. Nothing here
directly accesses, deploys or migrates the VPS.

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
  The subscriber explicitly chooses the amount of each currency equal to 1 USD.
  BHRU does not recommend a numeric commercial rate or use an external FX service.
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
4. `014_empty_legacy_multi_currency_usd_initialization.sql`: corrects 013's
   single-currency restriction for demonstrably empty non-USD legacy stores.
   Currency rows alone no longer prevent safe initialization; existing USD is
   upserted rather than duplicated.

No previously tracked migrations were edited. The existing checksum ledger, transaction and
advisory-lock migration runner and Docker startup command remain unchanged:
`node migrate.mjs && exec node index.mjs`.
The runner applies only pending files, checks the checksum of already applied files,
and commits each migration together with its ledger entry. A failure rolls back that
migration and prevents application startup. On rerun, applied 014 is skipped;
its body is also repeat-safe because initialized stores are no longer model 1.

## Legacy DZD and other non-USD references

Migration 014 only initializes **model 1, non-USD** stores with:

- **Zero products**, including inactive/archived products and zero-priced products.
- **Zero orders**, including cancelled/unpaid orders and zero-total orders.
- **Zero order items** (explicit defensive check; their foreign keys also require
  parent orders/products).
- **No conversion-provenance record**, so an approved preservation workflow is not
  overridden.
- **No nonzero General Settings fund/balance limits** (`minimum_add_fund`,
  `maximum_add_fund`, `maximum_balance`). Null/zero limits contain no amount to
  convert; positive limits are conservatively left for explicit review even when
  the corresponding feature is disabled.

The migration locks subscriber writes and the checked tables until transaction
commit, preventing a concurrent monetary/configuration write from invalidating
the emptiness check. Normal reads remain available.

There is no restriction on currency-row count. USD is inserted or updated to
rate `1.000000`, enabled, configured, Base / Reference and initial Client Default.
Existing USD presentation fields are preserved. Every existing non-USD row,
including DZD, retains its name, prefix/suffix, number format, precision and stored
legacy rate, but becomes non-base, disabled, non-default and `rate_configured=false`.
That retained numeric rate is **not** treated as USD-relative or used for conversion.
The editor presents it as requiring a manual rate. The subscriber chooses that
rate, enables the currency, and may independently choose it as Client Default.

Schema review: product selling/compare-at/provider-cost values live in products;
order canonical totals, currency snapshots and line money live in orders/items.
There are no implemented subscriber wallet, payment, fund transaction or separate
provider-cost ledger tables. Fund/balance limits are monetary settings, not balances,
but are conservatively checked above. Platform plan prices/subscription references
belong to SaaS billing, not subscriber-store denomination; they are never changed.
Categories, images, availability and CMS content do not contain canonical money.

Non-USD stores failing any safety condition remain model 1, entirely unchanged.
Their current reference/prices/history are preserved.
Ordinary currency/reference and product-price writes are blocked pending approval;
legacy storefront quoting/checkout remain compatible with the legacy denomination.

No populated non-USD conversion is performed. `currency_conversion_provenance`
requires an approved exact rational USD basis, original reference, original-money
record and approval note/time. Cutover additionally requires reconciled canonical
product amounts and cent projections. Completed provenance is immutable.
This phase does **not** provide a legacy conversion operator/UI; an explicit reviewed
conversion procedure is required before any populated legacy cutover.

## Manual acceptance after the user's Git Push + Dokploy deployment

- Check startup logs for `Applied: 014_empty_legacy_multi_currency_usd_initialization.sql`
  (or `Already applied` on subsequent startup).
- **Currencies:** `/m/currencies` on the deployed application. For a qualifying
  empty legacy subscriber, the conversion warning must disappear, accounting
  reference must be USD, and retained DZD must require a manual rate.
  Choose your own manual rates for DZD/EUR, enable the currencies, and optionally
  choose one as Client Default. USD must stay fixed at `1.000000`.
- **Products:** `/m/ecommerce` → Products. Create `Selling Price (USD) = 50.00`.
  Also reopen/edit `0.125`, `0.4875`, `1.0032`, `19.230769` to check precision.
- **Panel header:** select USD and your enabled currencies; verify
  the corresponding converted amount at your configured rates and formats.
  Reopen product edit: still 50 USD.
  Sign out/in to check persistence; remove/disable a non-default display selection
  to check fallback.
- **Public store:** `/{public_slug}` (use E-Commerce's View Store link). With store
  enabled, first-visit currency is DZD; switch USD/EUR and reload.
- **Cart/checkout:** `/{public_slug}/cart`, `/{public_slug}/checkout`. Place a manual
  guest order at your chosen rate; then change that rate. Current prices update,
  while **Orders** and `/{public_slug}/confirmation` retain the original receipt.
- Product, category, order and store availability still follow existing entitlement,
  licence and eligibility rules.

Short validation only: relevant type/build checks, pure money calculation checks
and migration/schema sanity without inspecting real subscriber data. No browser/E2E
or full regression run. No direct Production access, push or deployment by the agent.
