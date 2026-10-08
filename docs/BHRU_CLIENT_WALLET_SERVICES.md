# BHRU customer wallet and manual services

## Scope and migration

Migration `021_customer_wallet_manual_services.sql` is additive and follows 019 (public customer authentication) and 020 (onboarding). Run the project's normal `db:migrate` procedure **only against the intended development database** when preparing Preview. This feature does not run migrations at app startup and does not apply anything to the VPS or production database. The migration backfills one zero-balance wallet per canonical `public_customer_accounts` record and installs a zero-only wallet initialization trigger for future registrations. It does not synthesize historic credits, reset accounts, alter passwords/sessions or move retail orders. Old `schema_migrations` entries are preserved; rerunning `db:migrate` skips files whose applied checksums match.

New tables: `reseller_client_groups`, `manual_service_groups`, `manual_services`, `customer_wallets`, `customer_wallet_ledger`, `service_orders`. They all carry the owning subscriber ID; references to clients, services and groups use composite foreign keys to preserve tenant isolation. No provider or invoice tables are introduced.

## Money and client wallet

- The wallet accounting basis is USD, persisted as integer units in `numeric(24,0)` at **12 decimal places**. API JSON represents exact units and prices as decimal **strings**. Local currency funding amounts are decimal strings in the currency's supported precision (up to six places); the backend obtains the current enabled, configured subscriber currency/rate and converts exactly with BigInt and half-up rounding. No browser price or JS floating-point money controls a transaction.
- The owner credits, deducts or adjusts a client on `/api/clients/{id}/wallet`, giving currency, direction, reason, method, optional reference/internal and customer-visible notes, and an idempotency UUID. A locked client row and wallet row serialize mutations. The ledger INSERT verifies the calculated after-balance and updates the wallet through a database trigger. The ledger stores a snapshot of the rate/currency and entered amount, actor, method, reference and after-balance; it cannot be edited or deleted. Direct balance updates are rejected. The immutable ledger is the audit record. Reusing a key with a different action returns a conflict.
- Available and locked balances start at zero. Locked balance and credit limit exist as zero-only foundations; there is **no negative balance, credit spending, credit-limit increase or lock/unlock API** in this phase. Owners may correct a blocked client's balance; blocking still prevents the customer from placing an order.
- `/api/clients/{id}/statement` and `/api/public/customer/{slug}/panel/statement` expose paginated ledger activity. The public DTO omits internal notes and staff actor IDs. Totals are actual ledger credits, debits and net service spend (order debits less order refunds). Pending orders are included in spend until refunded. The displayed wallet balance uses the customer's currently effective enabled currency; **historical entries retain their original currency/rate snapshot**.
- Currency safety: older non-USD-base rate configurations are not silently interpreted as USD exchange rates. New wallet values are never taken from old retail/accounting balances. USD wallet presentation stays canonical; non-USD wallet operations require a verified USD-based rate configuration. A subscriber with no usable USD wallet currency needs the separately approved currency conversion/configuration before manual funding can be used. This does not migrate or modify the existing retail currency architecture.

## Manual services and groups

One shared `manual_services` catalog supports `imei`, `server`, `file` and `remote`. Services have a subscriber, optional subscriber-owned group, name, description, strictly positive canonical USD selling price, estimated time, active flag, display order, and a maximum of 12 structured input requirements. Supported field types are `text`, `textarea`, `number`, `select` (configured unique choices), `imei` (15 digits and valid checksum), and `reference` (also usable for serial/reference). Unknown fields/options are rejected. File services accept configured reference/text inputs; file binary uploads and external-provider integration are **not** implemented. Existing public E-Commerce products are separate.

The reseller can list, create, edit and deactivate services via `/api/manual-services`, and list/create groups via `/api/service-groups`. Client groups are separate (`/api/client-groups`, `/api/clients/{id}/group`) and have **no pricing engine**. Customer `/panel/services` returns only active services in the current subscriber's catalog, with optional search/type/group filters. New catalog prices do not rewrite old order snapshots.

## Order lifecycle and transaction

`service_orders` is separate from `store_orders`. It stores immutable customer/service/type/input, name, USD price, selected-currency snapshot, original wallet debit reference, client idempotency key and request hash, result/reason and timestamps. The reseller can inspect and transition orders via `/api/service-orders`. The customer can quote, place and view **only their own** orders via `/api/public/customer/{slug}/panel/quote|orders`.

```
new → pending
pending → processing | completed | rejected
processing → completed | rejected
completed, rejected → terminal
```

`cancelled` is reserved in the database model; this phase has no cancellation transition. Completing requires a result/response, and rejecting requires a reason. Completed orders do not trigger additional wallet movements. A retry of an already-applied status has no further financial side effects; invalid jumps return a conflict.

To place an order, the server authenticates the active client, checks the subscriber's active service and controlled inputs, validates a fresh server quote's expected price against the **current locked service price** (the client cannot set the price), locks the account and wallet, verifies available balance, writes the immutable order snapshot, inserts the exact ledger debit, records client activity and commits one PostgreSQL transaction. A stable client-generated idempotency UUID protects retry/double-click; a mismatched replay is rejected. An insufficient balance, stale quote or failed insert rolls back everything. Cross-tenant service/order IDs are not resolved.

To reject an order, the server locks the client and order, looks up the original order debit and inserts an exact **USD-unit and currency-snapshot** refund before setting the terminal status in the same transaction. Database constraints enforce one debit and one refund per order, validate refund equality and require a debit/refund for relevant order states. A pending refund must fit even if the owner later tops up the wallet: non-refund credits reserve capacity against outstanding refundable orders. A completed order cannot be changed to rejected to refund it. Any future manual refund must be a separate auditable workflow.

The order's customer-facing schema is provider-independent. A future provider adapter can add a mapping from a provider service to a BHRU service and update the **same** order after submission; it should not bypass BHRU pricing or wallet ledger rules. Invoicing is not present; an invoice would reference the existing service order and immutable ledger entries.

## Where to use it

- Reseller: **Products / Services** (IMEI, Server, File, Remote), **Orders → Service Orders**, **Clients/Suppliers → Clients → client detail** (Financial, Orders, Profile groups) and **Client Groups**.
- Customer: signed-in `/{public_slug}/customer/account`, `/services`, `/orders`, `/wallet`, `/profile`; on a verified custom domain use `/customer/...`. Their sign-in and public website header stay in the existing realm.
- The customer dashboard uses real wallet, status and recent-order values. The statement and owner financial screens paginate and filter. There is no customer self-service Add Funds payment gateway.
- The existing retail checkout/order storage and ownership rules were not changed. Service debits do not create retail orders or affect retail guest checkout.

## Focused checks and limitations

Run `node scripts/test-public-customer-onboarding.mjs` only in the repository's development environment. Its PostgreSQL database is a new isolated `/tmp` cluster with a Unix socket; it never uses an operator-supplied production `DATABASE_URL`. The test covers old auth/onboarding and retail-guest compatibility plus the 021 upgrade/backfill, zero initialization, tenant boundaries, blocked customers, all four service families, service validation, insufficient funds, owner funding/idempotency, snapshots, concurrent double-spend prevention, exact rejection/refund after rate changes, no double refund, terminal transitions, deliberate ledger-failure rollback and direct SQL wallet tamper guards.

No external providers, file upload for service requests, payment top-up, invoice creation, automated fulfillment, client-group pricing, cancellation API or credit-line spending are implemented. Replit Preview requires a development PostgreSQL database with migration 021 applied to start the API; an existing un-migrated development database will intentionally fail the startup schema guard. **Do not point Preview or its migration procedure at the VPS production database.**
