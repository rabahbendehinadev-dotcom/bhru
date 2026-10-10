# Legacy extension status

Slice 7A.1 adds verified read-only DHRU Fusion Legacy v6.1 support. Historical
Legacy "not implemented" findings below describe the original Slice 7A only.
See `BHRU_LEGACY_PROVIDERS.md` for the exact implemented POST contract, reference
files, key-replacement verification, migration 033 and focused test results.

# BHRU Slice 7A — architecture and protocol audit

## Status and execution boundary

**SLICE 7A IMPLEMENTED IN REPLIT PREVIEW; FOCUSED VERIFICATION PASSED.**

The audit below records the source inspection completed before implementation.
The three uploaded archives were extracted
under `/tmp/bhru-protocol-references` and inspected as source text. Their examples
were not executed. No upstream HTTP requests or paid orders were submitted.

The initial audit stopped because the dedicated encryption configuration was absent.
The user subsequently supplied `BHRU_PROVIDER_ENCRYPTION_KEY_V1` through the secure
configuration flow. Implementation then continued; its report and operating
instructions are in `BHRU_EXTERNAL_PROVIDERS.md`. Secret values have not been
displayed. No production/VPS/Dokploy access occurred.

## Existing BHRU architecture

| Area | Observed architecture | Required integration boundary |
|---|---|---|
| Reseller identity | `account_users` and `sessions`; `bhru_session`; `subscriberContext()` rejects administrator identities and derives the tenant from the authenticated user | Reseller-only provider endpoints; tenant predicates on every query; composite foreign keys |
| Platform Admin | Separate `platform_admin_users`, `platform_admin_sessions`, cookie and private entry; header selects realm, never grants privileges | Do not change private entry or allow administrator/customer sessions to substitute for reseller authentication |
| Customers | `public_customer_accounts` and `public_customer_sessions`; customer middleware resolves public tenant and customer identity separately | Never expose provider credentials or management operations through customer APIs |
| Catalog | Shared canonical `manual_services` and `manual_service_groups`; service types `imei`, `server`, `file`, `remote`; no parallel per-type catalogs | Import into the canonical catalog; preserve provider identity in a tenant-scoped linkage |
| Requirements | Controlled keys, labels, required state and types `text`, `textarea`, `number`, `select`, `imei`, `reference`; maximum 12 fields; configured choices and IMEI checks | Stage unsupported upstream fields/constraints for review; do not discard constraints or invent substitute fields |
| Orders | Canonical `service_orders`; explicit lifecycle, immutable service/input/price/account-currency/pricing snapshots; request idempotency | Provider staging/import must not modify order placement, transitions or manual fulfillment |
| Money | Catalog prices use integer units at 10^12 scale; exact `parseUsd`, `rateUnits`, BigInt arithmetic and bounded monetary ranges | Parse upstream decimal values without float arithmetic; preserve source cost/currency separately |
| Currency | USD-based catalog with configured subscriber commercial rates; immutable customer account currency; conversion at the existing account-price boundary | Non-USD provider cost conversion must require an explicit configured USD-relative rate; no invented FX or funding conversion |
| Slice 6A | `reseller_client_groups`, `client_group_service_prices`, `customer_service_prices`; customer override > active group rule > standard price; tenant pricing locks | Reuse the existing group/rule engine; preserve existing overrides |
| Slice 6B | Canonical customer/group service-access rules and `resolve_client_service_access()` | Do not bypass access resolution or reset customer/group permissions |
| Wallet | `customer_wallets`, immutable `customer_wallet_ledger`; account-first row protection, exact atomic debit/order creation, original-amount idempotent refunds | Provider balance is informational only; no wallet, ledger, baseline or financial backfill |
| Audit | Platform `audit_logs`, client activity infrastructure and protected historical attribution | Record reseller provider/configuration/import actions without credentials or upstream personal data |
| Jobs | Payment-domain PostgreSQL durable jobs, SKIP LOCKED claiming, leases, bounded attempts and application worker lifecycle already exist | Reuse the design pattern, not payment jobs or payment adapters; separate provider sync job identity and lease ownership |
| Secrets | Session secret and dedicated gateway AES-256-GCM envelope utility; gateway key is payment-specific | Separate provider encryption key, versioned metadata and tenant/provider-bound authenticated data; no plaintext or restart-generated fallback |
| UI | Subscriber navigation includes Settings → API Settings; module router, workspace tabs, scoped hooks and compact shared components | Add the provider page to the existing navigation slot; no shell redesign |
| API | Express routers under `/api`, `X-BHRU-Request: 1`, same-origin checks, separate auth realms, SQL-backed rate limits; OpenAPI/codegen contracts | Extend the existing contract and routing flow; strict bounded input validation and no arbitrary outbound headers |
| Migrations | Canonical source in `lib/db/src/migrations`; latest observed `031_client_service_access.sql` after `030_client_groups_pricing.sql` | Next observed free number is 032; recheck immediately before creating it |
| Migration execution | Existing runner uses advisory lock, filename/checksum ledger, one transaction per pending migration; changed applied checksums fail | Additive migration only; never modify prior applied files; verify development target before any Preview migration |

### Source entry points inspected

- `artifacts/api-server/src/lib/auth.ts`
- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/client-finance.ts`
- `artifacts/api-server/src/routes/customer-panel.ts`
- `artifacts/api-server/src/routes/payments.ts`
- `artifacts/api-server/src/lib/commerce/data.ts`
- `artifacts/api-server/src/lib/commerce/currency-money.ts`
- `artifacts/api-server/src/lib/client-finance/catalog.ts`
- `artifacts/api-server/src/lib/client-finance/orders.ts`
- `artifacts/api-server/src/lib/client-finance/pricing.ts`
- `artifacts/api-server/src/lib/client-finance/access.ts`
- `artifacts/api-server/src/lib/client-finance/wallet.ts`
- `artifacts/api-server/src/lib/customer-auth/profile.ts`
- `artifacts/api-server/src/lib/platform.ts`
- `artifacts/api-server/src/lib/payments/credentials.ts`
- `artifacts/api-server/src/lib/payments/decimal.ts`
- `artifacts/api-server/src/lib/payments/queue.ts`
- `artifacts/api-server/src/lib/payments/worker.ts`
- `artifacts/bhru/src/components/subscriber/nav-data.ts`
- `artifacts/bhru/src/pages/module.tsx`
- `artifacts/bhru/src/hooks/use-commerce.ts`
- `artifacts/bhru/src/hooks/use-payment-gateways.ts`
- `lib/db/src/index.ts`
- `lib/db/src/migrate.ts`
- `lib/db/src/migrations/021_customer_wallet_manual_services.sql`
- `lib/db/src/migrations/030_client_groups_pricing.sql`
- Migration inventory through `031_client_service_access.sql`

This list identifies inspected entry points, not files modified by Slice 7A.

## Protocol comparison

### 1. DHRU Fusion Pro REST Reseller API

Verified API base: `https://<workspace>/api/reseller/v1`.

Authentication: `Authorization: Bearer <API_TOKEN>` and
`Accept: application/json`. The separately returned API key is not the token.
Token currency, expiry and optional source-IP allowlist affect authorization.

Documented reads:

- `GET /account`
- `GET /products`
- `GET /products?product_id=...`
- `GET /order?order_uuid=...`

Slice 7A will expose only account/catalog reads. There is no need to introduce
order reads until a separately approved order integration requires them.
`POST /order` creates paid orders and has no dry-run mode; it is excluded.

The account envelope includes `status`, `code` and `data`, with documented
`currency`, `balance`, `name`, `email`. Catalog data includes currency,
category objects and products keyed by upstream product ID. Documented product
fields include `name`, `type`, `cid`, `cids`, `price`, `time`, and `fields`.
The sample field contract includes `type`, `name`, `required`.

Both HTTP status and JSON `status`/`code` must indicate success. HTTP 2xx alone
is insufficient. Authentication failures include 401/402; other documented
statuses include 404, 429 and 503. Raw upstream messages must not be surfaced
without sanitization. Examples' timeout handling is not a complete SSRF defense.

No explicit enabled/availability flag or pagination/completeness token is
established by the supplied catalog example. Do not invent either. Validate
the entire received catalog before classifying missing records; failure or
truncation must leave prior staging/public services unchanged. Unknown field
metadata and types require review rather than automatic import.

Callbacks lack a general cryptographic signature according to this README.
Neither callbacks nor order submissions are part of Slice 7A.

### 2. Legacy DHRU Fusion API standards V6.1

The uploaded repository is an example upstream listener, not a verified reseller
client with real authentication.

It reads POST variables `username`, `apiaccesskey`, `action`, and optional
base64-encoded JSON `parameters`. Documented read actions include
`accountinfo` and `imeiservicelist`; the response uses `SUCCESS`/`ERROR`
arrays, `apiversion`, and legacy keys including `AccoutInfo`, `LIST`,
`GROUPTYPE`, `SERVICETYPE`, `CREDIT`, and `Requires.Custom`.

The example `validateAuth()` and `validateCredits()` return `true` unconditionally.
It does not verify an actual upstream deployment's authentication, endpoint
location, authorization policy or network behavior. It also exposes legacy
constraints such as quantity options and field types not supported by the
current BHRU controlled requirement model.

Decision: document/register legacy as unavailable for this slice rather than
advertise a production-grade working adapter based on this stub.

### 3. Fusion Pro Simple API Request Listener

This is the supplier-side `Custom Simple Request` protocol.
Actions are selected with `?action=...`; reads can use
`account_info` and `products` with `api_key`. JSON POST `place-order` is
separate, paid-capable and excluded.

The example listener's `expected_api_key` is empty by default, so the example
does not authenticate unless configured. Its response has `status`, `message`,
`data`, `order_id`, `replay`; it does not establish the REST Reseller API's
mandatory `code` envelope.

Its README documents fields including text/imei/number/enum, but those details
must not automatically be transferred to another protocol's adapter.
The separate single-service example immediately produces a demo success and
does not verify its API key.

Decision: protocol reference only. No functioning BHRU adapter in Slice 7A.

## Exact uploaded protocol reference files inspected

Paths below are relative to the extracted archive roots.
All executable examples were read as text only.

### `reseller-api-main`

- `README.md`
- `examples/nodejs/config.js`
- `examples/nodejs/helpers.js`
- `examples/nodejs/examples/get-account-info.js`
- `examples/nodejs/examples/get-products.js`
- `examples/nodejs/examples/get-order-details.js`
- `examples/nodejs/examples/place-new-order.js`
- `examples/nodejs/examples/receive-order-feedback.js`
- `examples/php/config.php`
- `examples/php/helpers.php`
- `examples/php/examples/get-account-info.php`
- `examples/php/examples/get-products.php`
- `examples/php/examples/get-order-details.php`
- `examples/php/examples/place-new-order.php`
- `examples/php/examples/receive-order-feedback.php`
- `postman/Dhru_Fusion_Pro_Reseller_API.postman_collection.json`

### `dhru-fusion-api-standards-master`

- `README.md`
- `api/index.php`

### `fusion-pro-simple-api-request-listener-main`

- `README.md`
- `index.php`
- `simple_single_service_get_example.php`

Archive inventories were also inspected. The REST `.gitignore` was read;
REST MIT and legacy GPL license headers were inspected. No reference code
has been copied into application code.

## Implemented architecture

1. Separate tenant-scoped connections, staging catalog, canonical-service links
   and sync jobs/history with composite ownership constraints.
2. Dedicated AES-256-GCM provider envelope: persisted version 1 metadata,
   tenant/provider-bound authenticated data, secret
   `BHRU_PROVIDER_ENCRYPTION_KEY_V1` containing one persistent 32-byte
   base64 key. Never reuse `BHRU_GATEWAY_ENCRYPTION_KEY` or `SESSION_SECRET`.
   Missing/invalid key must fail closed. No plaintext API response or logs.
3. Typed read-only adapter registry; only verified REST account/catalog methods.
   Legacy/Simple explicitly unavailable. No generic arbitrary method/path input.
4. HTTPS/443-only outbound transport, URL credentials/query rejection, bounded
   DNS/connection/response deadlines and byte limits, no redirects, no proxy.
   Validate all DNS answers and pin a validated public destination address in
   the actual TLS socket lookup while retaining original-host certificate/SNI
   verification. Ordinary preflight DNS validation alone is insufficient.
5. Separate PostgreSQL durable jobs using SKIP LOCKED, 90-second fenced leases,
   tenant/provider concurrency limits and bounded retry/backoff. Reclaim only
   expired leases; stale workers cannot finalize a newer worker's job.
6. Whole-catalog validation before one atomic staging update; normalized safe
   snapshots/hashes; repeated sync without duplication. Keep prior successful
   state when a fetch is partial, malformed or failed.
7. Exact cost/FX/markup preview; reuse USD 10^12 money utilities. Initial standard
   price = converted cost × (1 + percentage) + fixed USD markup. Missing FX
   blocks pricing. Existing customer/group overrides must remain untouched.
8. Transactional selected-service import with tenant/provider/upstream uniqueness.
   Reuse catalog/group validation. External imports must stay server-enforced
   non-orderable until Slice 7B; a reseller cannot bypass the gate by enabling
   them in ordinary manual-service editing.
9. Existing API Settings navigation slot, scoped generated API hooks, truthful
   credential-masked connection states, pagination and job polling.

## Final status inventory

| Feature | Status |
|---|---|
| Uploaded reference extraction/inspection and architecture audit | IMPLEMENTED AND INSPECTED; no live upstream test |
| Dedicated provider encryption configuration | IMPLEMENTED AND TESTED in development; production configuration not inspected |
| Provider persistence/migration | IMPLEMENTED AND TESTED; migration 032 applied only to identity-verified development DB |
| Safe outbound REST adapter | IMPLEMENTED AND TESTED with mocked DNS/HTTPS and exact reference envelopes; live provider NOT TESTED |
| Provider management UI | IMPLEMENTED BUT NOT TESTED in a signed-in browser; TypeScript/build passed |
| Durable sync/staging/history | IMPLEMENTED AND TESTED with development SQL and mocked upstream transport |
| Pricing preview/canonical import | IMPLEMENTED AND TESTED, including concurrent HTTP imports |
| Focused provider acceptance/security tests | IMPLEMENTED AND TESTED: 25 focused checks passed |
| Live provider connection | NOT TESTED; no provider is claimed connected |
| Paid dispatch/order callbacks/reconciliation | NOT IMPLEMENTED — intentionally deferred to Slice 7B |

API TypeScript/build, frontend TypeScript/build and shared-library type checks
passed. No browser/E2E/full regression suite was run. No real provider is claimed
connected. No paid order was sent. No commit, push, publish or deployment occurred.
