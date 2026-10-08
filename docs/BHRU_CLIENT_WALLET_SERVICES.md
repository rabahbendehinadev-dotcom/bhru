# BHRU customer wallet and manual services

## Scope and migration

Migration `021_customer_wallet_manual_services.sql` is additive and follows 019 (public customer authentication) and 020 (onboarding). Run the project's normal `db:migrate` procedure **only against the intended development database** when preparing Preview. This feature does not run migrations at app startup and does not apply anything to the VPS or production database. The migration backfills one zero-balance wallet per canonical `public_customer_accounts` record and installs a zero-only wallet initialization trigger for future registrations. It does not synthesize historic credits, reset accounts, alter passwords/sessions or move retail orders. Old `schema_migrations` entries are preserved; rerunning `db:migrate` skips files whose applied checksums match.

New tables: `reseller_client_groups`, `manual_service_groups`, `manual_services`, `customer_wallets`, `customer_wallet_ledger`, `service_orders`. They all carry the owning subscriber ID; references to clients, services and groups use composite foreign keys to preserve tenant isolation. No provider or invoice tables are introduced.

## Money and client wallet

- Migration 022 supersedes the original USD-only wallet basis. The registration-selected `public_customer_accounts.preferred_currency` is the immutable account currency; each wallet's existing `accounting_currency` must match it. Balances remain exact integer units in `numeric(24,0)` at **12 decimal places in that account currency**. API money is serialized as decimal strings. Funding, deductions and adjustments perform **no FX conversion**: adding 1000 DZD adds exactly 1000 DZD.
- The owner credits, deducts or adjusts a client on `/api/clients/{id}/wallet`, giving direction, reason, method, optional references/notes and an idempotency UUID. Currency is derived from the locked account; an optional supplied currency must match or is rejected. Profile, Financial and customer service-order currency controls are read-only. A locked client and wallet serialize mutations. Ledger `amount_account_units` and `account_currency_snapshot` drive the guarded balance update; the after-balance, actor and references remain immutable. Reusing a key with a different action returns a conflict.
- Available and locked balances start at zero. Locked balance and credit limit exist as zero-only foundations; there is **no negative balance, credit spending, credit-limit increase or lock/unlock API** in this phase. Owners may correct a blocked client's balance; blocking still prevents the customer from placing an order.
- `/api/clients/{id}/statement` and `/api/public/customer/{slug}/panel/statement` expose paginated activity in the fixed account currency. Totals use actual account-unit credits/debits and net service spend. The public DTO omits internal notes and staff actor IDs. No Client Default change, browser selection or current exchange rate revalues balances or past transactions.
- Only USD catalog service pricing converts: a verified existing manual USD-based rate converts to the account currency and rounds once to that currency's minor units using BigInt. Unverified legacy rates fail closed for non-USD service quotes. Funding never requires or applies this conversion. Retail pricing and checkout remain separate.

## Manual services and groups

One shared `manual_services` catalog supports `imei`, `server`, `file` and `remote`. Services have a subscriber, optional subscriber-owned group, name, description, strictly positive canonical USD selling price, estimated time, active flag, display order, and a maximum of 12 structured input requirements. Supported field types are `text`, `textarea`, `number`, `select` (configured unique choices), `imei` (15 digits and valid checksum), and `reference` (also usable for serial/reference). Unknown fields/options are rejected. File services accept configured reference/text inputs; file binary uploads and external-provider integration are **not** implemented. Existing public E-Commerce products are separate.

The reseller can list, create, edit and deactivate services via `/api/manual-services`, and list/create groups via `/api/service-groups`. Client groups are separate (`/api/client-groups`, `/api/clients/{id}/group`) and have **no pricing engine**. Customer `/panel/services` returns only active services in the current subscriber's catalog, with optional search/type/group filters. New catalog prices do not rewrite old order snapshots.

## Order lifecycle and transaction

`service_orders` is separate from `store_orders`. It retains the source USD catalog price and stores the immutable final `price_account_units` and `account_currency_snapshot`, including the rate used for pricing. Customer/service/input/name, debit reference, idempotency key and request hash are immutable. Non-USD purchases require the fresh quote's expected account-unit total, in addition to the source-price stale-quote guard; a rate change requires a new quote. The browser never sets the charge. Existing reseller/customer order routes and lifecycle remain unchanged.

```
new → pending
pending → processing | completed | rejected
processing → completed | rejected
completed, rejected → terminal
```

`cancelled` is reserved in the database model; this phase has no cancellation transition. Completing requires a result/response, and rejecting requires a reason. Completed orders do not trigger additional wallet movements. A retry of an already-applied status has no further financial side effects; invalid jumps return a conflict.

To place an order, the server authenticates the active client, checks the subscriber's active service and controlled inputs, validates a fresh server quote's expected price against the **current locked service price** (the client cannot set the price), locks the account and wallet, verifies available balance, writes the immutable order snapshot, inserts the exact ledger debit, records client activity and commits one PostgreSQL transaction. A stable client-generated idempotency UUID protects retry/double-click; a mismatched replay is rejected. An insufficient balance, stale quote or failed insert rolls back everything. Cross-tenant service/order IDs are not resolved.

To reject an order, the server locks the client and order, looks up the original debit and refunds exactly its **account units and account-currency snapshot**, without consulting today's rate. The original source/audit USD amount and legacy snapshot are retained as audit metadata. Database constraints enforce one debit/refund per order, exact refund equality and required debit/refund for relevant states. Credits reserve capacity for all outstanding account-unit refunds. Completed orders cannot become rejected to refund them; any future manual refund remains separately auditable.

The order's customer-facing schema is provider-independent. A future provider adapter can add a mapping from a provider service to a BHRU service and update the **same** order after submission; it should not bypass BHRU pricing or wallet ledger rules. Invoicing is not present; an invoice would reference the existing service order and immutable ledger entries.

## Where to use it

- Reseller: **Products / Services** (IMEI, Server, File, Remote), **Orders → Service Orders**, **Clients/Suppliers → Clients → client detail** (Financial, Orders, Profile groups) and **Client Groups**.
- Customer: signed-in `/{public_slug}/customer/account`, `/services`, `/orders`, `/wallet`, `/profile`; on a verified custom domain use `/customer/...`. Their sign-in and public website header stay in the existing realm.
- The customer dashboard uses real wallet, status and recent-order values. The statement and owner financial screens paginate and filter. There is no customer self-service Add Funds payment gateway.
- The existing retail checkout/order storage and ownership rules were not changed. Service debits do not create retail orders or affect retail guest checkout.

## Focused checks and limitations

Run `node scripts/test-public-customer-onboarding.mjs` only in development. Its database is an isolated `/tmp` PostgreSQL cluster; it never uses a live operator database URL. It runs the normal previous-release migration runner through 021, creates legacy USD money/order fixtures, then applies 022 and 023 to verify preservation and checksum-safe reruns. Focused SQL/HTTP cases include tenant-specific registration availability (USD-only initial state, reseller-added SAR/DZD/EUR, independent Client Default, existing clients after registration availability is removed), USD/DZD registration, direct account funding and adjustments, mismatch rejection, immutable currency controls, account-currency quotes/debits/statements, stale-rate quotes, exact refunds, used-currency protection and legacy refunds. Existing concurrency, tenant boundaries, blocked-client and retail-guest compatibility tests remain included. No browser suite is required.

The reseller's Currency Settings control three separate things: the panel display preference (in the panel header), Client Default Currency (initial selection for **new** customers), and `Available for Customer Registration` (which enabled currencies appear at this reseller's registration URL or verified custom domain). Newly created resellers start with USD only; no country or geographic inference adds DZD, SAR or any other currency. Migration 023 adds the independent registration flag to existing tenant currency rows, retaining the previously available enabled/configured entries and excluding disabled/unconfigured entries. Turning off registration availability does not disable a currency used by existing accounts or change their wallets. Currency deletion and disabling remain blocked while client accounts use it. Once selected at registration, a client's account currency remains immutable.

No external providers, service file upload, payment top-up, invoices, automated fulfillment, client-group pricing, cancellation API, credit-line spending or account-currency migration flow are implemented. Preview requires the dedicated development database with 022 applied; missing account-money columns fail the startup schema guard. **Never target the VPS production database from Preview.**

## Existing-account compatibility in 022

Migrations 019–021 are untouched. All pre-022 wallets were constrained to USD; 022 keeps their available/locked balances and original USD ledger/order amounts unchanged, including zero wallets. Their formerly mutable display preference is aligned to that actual wallet currency and then locked. This is not a money conversion or reassignment to the reseller's current default.

New account-unit columns are backfilled from the original USD units. Existing USD presentation snapshots are retained; older non-USD display/funding snapshots stay untouched in the legacy audit column while the new account snapshot records USD. Historical statement and refund amounts therefore use the actual original wallet money, not the old display preference. For new non-USD manual funding, the legacy USD amount is NULL, not a calculated hidden equivalent; new account units are authoritative.

Disabling or deleting any currency used by client accounts is rejected with an account count. Database guards and currency-row share locks protect the same rule during concurrent registration. Changing Client Default affects registration choices only, never existing accounts.
