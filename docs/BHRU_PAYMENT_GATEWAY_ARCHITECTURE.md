# BHRU Slice 5A: multi-tenant payment gateway foundation

## Scope and Preview

This is a foundation, not a payment-provider integration. PayPal, Cryptomus and
USDT Portal are registered **NOT_IMPLEMENTED**. Their provider capabilities,
credentials and methods are intentionally unspecified. There is no real payment
initiation, redirect, webhook HTTP endpoint, provider call, fake success button,
customer-accessible confirmation endpoint or checkout modification.

Manual testing:

- Existing private Platform Admin interface → Payment Gateways.
- Subscriber Settings → Payment Gateways and Funding Requests.
- Authenticated customer panel → Wallet → Add Funds and Funding history.

All three planned gateways are non-operational regardless of global flags.
The customer sees a truthful reseller-contact fallback. There is no funding form
for an ineligible gateway. Pending requests are not wallet money. Existing manual
reseller credits continue through the existing wallet workflow.

## Existing boundaries

The existing customer account owns its immutable currency and wallet. The exact
wallet ledger is authoritative. Service orders debit/refund that same currency.
Retail/E-Commerce checkout remains entirely separate.

Slices 25–27 supply financial attribution/reconciliation, client activity, and
customer security/history. This slice extends their closed vocabularies without
rewriting financial history, security history, credentials, sessions, account
currency, service orders or old ledger rows. Migrations 019–027 are unchanged.

## Trusted registry and global catalog

`artifacts/api-server/src/lib/payments/registry.ts` defines a typed, code-only
registry, the common configuration JSON schema, credential field whitelist,
capabilities, version and integration status. No uploads, database scripts,
dynamic executable plugins or subscriber-defined adapters are accepted.

An operational definition must be AVAILABLE and have a trusted adapter. Global
policy only controls enabled/disabled availability and reseller exposure; it
cannot implement a gateway or change its code-defined capabilities/status.

Private admin routes reuse the existing admin session and CSRF requirements.
Reseller sessions cannot control global policies. Policy changes create an
existing platform audit entry without credentials.

## Reseller configuration and credentials

Each `(subscriber_id, gateway_code)` has its own activation, instructions,
configured payment-currency limits/fees, validation state and credential envelope.
Activation requires an implemented, globally allowed/exposed gateway. Supported
methods and currencies are trusted-definition whitelists. Duplicate currency
rules, invalid amounts/precision and unsupported fees/currencies are rejected.
Limits are in **payment currency and apply to total payable, including fees**.
Percentage fees use integer basis points; fixed fees use exact decimal strings.

Credential values are encrypted server-side using AES-256-GCM:

- Dedicated environment variable: **`BHRU_GATEWAY_ENCRYPTION_KEY`**.
- Value: a stable, separately provisioned, base64-encoded **32-byte random key**.
- Never reuse SESSION_SECRET; never bundle the key or echo it in logs.
- Unique random 12-byte nonce per envelope, authentication tag, versioned envelope.
- Authenticated associated data includes tenant ID, gateway code and version.
- Swapping ciphertext between subscribers or modifying its tag fails closed.
- Only credential **field names** and validation state return to the owner.
  Customer responses omit configured credential field state. Values/ciphertext
  are never returned by configuration/history APIs or placed in browser source.
- Blank browser fields mean unchanged; submitted fields merge safely with the
  encrypted existing set. First configuration must include all required fields.
- Replacement invalidates connection validation and is blocked while unpaid
  requests or verified/unallocated receipts depend on that merchant's keys.
- Missing/invalid encryption key fails closed. No real provider/key is configured
  as part of Slice 5A.

Before a future operational integration, provision the key through the deployment
secret mechanism, keep a secure backup, and preserve it across application
restarts. Losing/changing it without re-encryption makes old credentials unreadable.
For an operator generating a *new* key, `openssl rand -base64 32` is suitable;
do not paste a generated key into chat, source control, logs or documentation.
Online key-ring rotation/re-encryption is not implemented in this slice.

Connection validation calls the actual trusted adapter. No locally invented
"connected" result is used. All current planned definitions refuse validation.

## Funding intent and exact currency policy

The customer specifies requested wallet credit in their immutable **account
currency**, plus an eligible gateway/method/payment currency. Browser prices,
tenant/customer IDs and arbitrary fields are not authoritative.

Current payment currencies must be enabled currencies in the subscriber's
existing ISO-three-letter currency configuration. Cross-currency payment requires
the verified USD pricing basis and explicitly configured manual commercial rates.
No cryptocurrency support, stablecoin parity, provider schema or live rate is
invented for the planned gateways.

For differing currencies, with each rate expressed as units per USD:

```
payment base minor units =
  ceil(account credit units × payment rate /
       (account rate × account-unit-to-payment-minor quantum))
percentage fee minor units = ceil(base minor units × fee basis points / 10000)
total payable minor units = base minor units + percentage fee + fixed fee
wallet credit = exactly the original requested account credit units
```

Same currency has no FX. BigInt, numeric integer storage and existing exact decimal
parsers are used; no JS floating-point arithmetic is authoritative for money.
Quantities are checked for positivity, supported precision, configured limits,
wallet capacity and outstanding service-refund capacity.

Creation recalculates and freezes the final account/payment presentations,
amounts, both commercial rates, rate scale, rounding rule, fees, merchant scope
and configuration revision. A preliminary quote is not a payment authorization:
Slice 5B must show/use the final request snapshot before initiating payment.
Later edits to rates, fees, names or formatting cannot change that request.
No existing balance, manual credit or service refund is converted.

## Models and statuses

Migration: `lib/db/src/migrations/028_payment_gateway_foundation.sql`.

- `payment_gateway_policies`: code-only catalog global availability.
- `reseller_payment_gateways`: tenant configuration and encrypted credentials.
- `payment_funding_requests`: tenant/customer intent, immutable snapshots,
  request hash, idempotency key, exact amounts, expiry and lifecycle.
- `payment_transactions`: separate verified provider receipt, exact external
  amount/currency, merchant/reference, safe verification metadata and allocation.
- `payment_gateway_events`: immutable authenticated callback-event deduplication.
- Existing wallet ledger: nullable canonical payment transaction FK and
  `payment_credit` vocabulary. Its original service-order FK is preserved.

Funding transitions:

```
CREATED         → PENDING_PAYMENT | PAID | FAILED | EXPIRED | CANCELLED
PENDING_PAYMENT → PAID | FAILED | EXPIRED | CANCELLED
PAID / FAILED / EXPIRED / CANCELLED → no status changes
```

Payment states are separate: `VERIFIED` (received/authenticated but unallocated),
`SETTLED` (wallet allocation committed), or `FAILED` (verified failure).
Only VERIFIED → SETTLED is allowed. A PENDING callback creates no financial receipt.
PAID funding and SETTLED receipts require the correct ledger allocation at commit.
Expiry processing/queue scheduling belongs to Slice 5B; reads do not expire or
repair history. Late or terminal-request receipts cannot credit the wallet.

Uniqueness:

- Funding submission: `(subscriber, customer, idempotency key)` plus normalized
  intent hash. An identical retry returns the original frozen request; changing
  its intent returns conflict.
- Provider transaction: `(subscriber, gateway, merchant scope, provider reference)`.
- Callback event: `(subscriber, gateway, merchant scope, event ID)` plus data hash.
- One SETTLED payment per funding request; one ledger credit per payment.

No card number, CVV, credentials, raw callbacks or request headers are stored as
payment metadata. Metadata is restricted to trusted adapter method/version and
payload digest. Customers do not receive provider transaction references.

## Verified callback and settlement boundary

No callback HTTP route is installed now. Future gateway-specific routes must
preserve the authentic raw body, use the provider's documented signature or
server-query protocol, resolve a trusted tenant/merchant binding, and normalize
only authenticated provider evidence. A browser redirect or `payment_success`
flag is never proof.

The trusted adapter contract contains merchant identity, real connection
validation and authentic callback verification. Runtime proof is a private,
non-serializable capability. Callers cannot construct it from JSON or a session.
Verification validates payload bounds, merchant scope, controlled receipt shape,
timestamps and explicit PAID/FAILED/PENDING state. Scope/evidence must match the
frozen funding request exactly. Unknown adapters and unauthenticated evidence
are rejected before any wallet mutation.

Two transactions intentionally distinguish **receipt** from **allocation**:

1. Canonical customer-account lock → owned funding lock → event/receipt locks.
   Authenticate exact gateway/merchant/request/amount/currency; record the
   verified receipt and deduplicated event durably. No wallet credit yet.
2. Account lock → funding lock → payment lock → wallet lock. Validate active
   funding/customer, expiry, proof ownership and immutable amount/currency.
   Append one system-attributed payment credit, update receipt SETTLED, mark
   funding PAID, and emit ledger-derived activity in the same transaction.

If allocation or financial activity fails, **all allocation changes roll back**
but the authenticated receipt remains VERIFIED for safe retry/review. It must
not be mislabeled as a payment failure. Retries return the existing allocation.
Cancelled/expired/failed intents, conflicting receipts or capacity/account
problems require review rather than fabricated wallet credit. Slice 5B must add
the delivery acknowledgement, durable retry/review worker and operator workflow.

## Financial activity and history

Controlled events:

- funding_request_created / funding_request_cancelled
- payment_pending / payment_confirmed / payment_failed
- wallet_funded_from_payment

`payment_confirmed` means receipt verified, not wallet allocated. The last event
comes from the authoritative ledger trigger and only commits with the credit.
These do not grant financial authority to the activity log.

Owner histories/details are subscriber-scoped. Customer histories are both
subscriber- and customer-scoped, paginated, and separate from Account Statement.
They display frozen account credit, external payable/fees, lifecycle, payment
receipt/allocation state and dates. Credentials, unsafe raw metadata and other
tenants' data are excluded. The original Account Statement remains ledger-based.

## Focused validation

`scripts/test-payment-foundation.mjs` is integrated into the disposable
PostgreSQL SQL/HTTP harness `scripts/test-financial-summary.mjs`.

The test-only signed adapter is injected **only into the ephemeral test bundle**.
It is not an application plugin, environment flag, production route or shipped
gateway. Fake credentials/key are generated solely in the isolated test process.

Focused payment checks cover admin/owner boundaries, NI activation refusal,
missing-key fail-closed behavior, encryption/redaction/AAD/tampering/replacement,
eligibility, exact same/cross-currency fees, frozen snapshots, submission
concurrency, customer/tenant history isolation, forged/mismatched receipts,
pending versus settled money, callback replay/conflicts, no double credit,
cancelled/failed/expired requests, transactional failure with durable receipt and
safe retry, CSRF/blocked customers, inline JavaScript and exact CSP hashes.

The harness compares original rows before/after additive migrations and retains
the existing focused wallet/service/refund/retail/security checks. No browser,
E2E, broad full-regression suite or production test is required.

## Slice 5B prerequisites and limitations

1. Select a real provider; review its actual methods, currencies, credential
   schema, merchant identity, API and verification documentation.
2. Provision the stable encryption key securely.
3. Implement provider initiation using the final frozen request, authentic raw
   callback/server verification, tenant callback binding and replay rules.
4. Add durable delivery acknowledgements, allocation retry/review and expiry
   scheduling without exposing a manual "mark paid" bypass.
5. Add provider-specific end-to-end sandbox tests and credential rotation.
6. Explicitly approve any new crypto currency/rate model; do not assume USDT=USD.

That list describes the completed **Slice 5A only**. Slice 5B adds the
provider-independent initiation, authenticated callback, leased processing,
expiry, read-only reconciliation and monitoring infrastructure documented in
[BHRU_PAYMENT_PROCESSING_IMPLEMENTATION.md](./BHRU_PAYMENT_PROCESSING_IMPLEMENTATION.md).
PayPal, Cryptomus and USDT Portal remain NOT_IMPLEMENTED. Chargebacks,
payment refunds, real notifications and key rotation remain deferred.
Retail checkout, service-order refund rules, immutable client account currency,
Platform Admin authentication/private path, public storefront, media and tenant
isolation are unchanged. This documentation does not authorize deployment.
