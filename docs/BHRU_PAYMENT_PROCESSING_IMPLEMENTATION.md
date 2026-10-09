# BHRU payment processing infrastructure (Slice 5B)

## Scope and environment

This is the provider-independent extension of the [Slice 5A foundation](./BHRU_PAYMENT_GATEWAY_ARCHITECTURE.md).
It **does not accept real payments**. PayPal, Cryptomus and USDT Portal still
report `NOT_IMPLEMENTED` and have no guessed credentials, endpoints, signatures,
rates or operational capabilities. The signed provider used by the focused
tests exists **only in the disposable test bundle**, not the running application.
No production database, VPS, Dokploy, code push or deployment is involved.
The existing PostgreSQL wallet ledger, payment receipt and exact-money
settlement kernel are reused. The retail checkout, service-order refund flow,
customer sign-in, private Platform Admin route and immutable account currency
are unchanged.

## Adapter contract

Trusted, code-installed adapters may implement `validateConfiguration`,
`createPayment`, `getPaymentStatus`, `verifyWebhook`,
`normalizeWebhookEvent`, and, where the actual provider supports them,
`cancelPayment`, `refundPayment`, and `getSupportedCurrencies`. Their declared
capabilities must reflect **verified provider documentation**; `idempotentCreation`
must never be guessed. Creation takes a frozen exact minor-unit amount,
currency, merchant scope, payment method, funding ID, stable idempotency key
and opaque server-owned callback path. Return data has an exact identity,
amount/currency, expiration, allowlisted HTTPS host, bounded instructions and
allowlisted metadata keys. Unrecognized fields, embedded credential values,
unapproved redirect hosts and malformed status events are rejected. The server
limits provider calls to 15 seconds with an abort signal. Implementers must
actually honour that signal and validate the provider-specific signature,
reference mapping, merchant identity, checkout URL, idempotency and status
lookup semantics. No generic JSON payment-success callback is accepted.

## Durable initiation and recovery

The authenticated customer uses the existing final server-calculated quote,
then POSTs the idempotency key to `/panel/funding/initiate`. The funding intent,
one initiation record, and one initiation job commit together. The HTTP
response is **202 accepted, not paid**; no provider call or wallet credit takes
place within that transaction. A short fenced lease marks `creation_started_at`
before an external side effect. The worker performs the call **outside** a
PostgreSQL transaction, using the immutable funding ID as the provider
idempotency key. An encrypted, funding-bound metadata envelope and safe result
are persisted only if the job lease is still current. If result persistence
fails, the next worker either safely retries the same provider idempotency key
(only if supported by the adapter) or retrieves the original obligation via
provider status lookup. If neither is reliable, it goes to **review** rather
than creating another charge. Provider validation similarly runs outside
a database transaction and applies a revision check before saving the result.

## Raw callbacks, proof and exact settlement

`POST /api/payments/webhooks/{code}/{binding}` is the only raw callback route.
`binding` is a UUID generated for the stored gateway configuration. The server
resolves its tenant from that binding and trusted adapter code; it does not
trust customer-supplied subscriber IDs, form results, status flags, redirect
parameters or cookies. The route accepts at most 256 KiB of raw, uninflated
body and authentic headers; provider-specific verification **precedes**
normalization. Authenticated events are durably enqueued with normalized
safe fields, digest, adapter version and timestamp, never raw payload, headers
or credentials. The HTTP 202 means only **authenticated and durably queued**.
A signed wrong-merchant event is stored in read-only review, with no
settlement capability. Duplicate identical events acknowledge idempotently;
different authenticated evidence with the same event identity enters review.

A worker restores the authenticated proof only from an immutable event job
under its live fenced lease and installed adapter version. Before the existing
receipt/ledger kernel, it checks tenant, merchant scope, frozen external amount
and currency, known provider reference (if initiation completed) and
provider-event time against the earliest frozen request/provider expiration.
Discrepancies and unknown funding enter review; they cannot credit a wallet.
The existing `recordVerifiedPayment` records the provider receipt before the
allocation attempt. Its verified receipt survives an allocation rollback. The
existing `settleVerifiedPayment` locks the customer account/funding, checks
that the customer remains active and that the payment is still eligible, then
adds exactly the **original requested account-currency amount** through the
single immutable wallet-ledger path. Provider currency may differ only under
the already-approved frozen commercial FX quote. Concurrent deliveries,
allocation retries and a stale processing worker cannot create two credits.
Failed and pending payment events do not credit.

## Worker lifecycle, expiry and review

Database jobs have bounded attempts, a 60-second lease with random token,
`FOR UPDATE SKIP LOCKED` claiming, conditional writes, backoff and a
terminal REVIEW state. Multiple replicas can claim different jobs; restarted
processes reclaim expired leases. Five exhausted attempts, including a
crashed fifth lease, remain visible for review rather than silently dropping.
An optional adapter status lookup uses the same proof and settlement kernel;
unknown/pending lookups back off and stop after the attempt bound. No background
call relies on a single in-process queue.

The worker expires unpaid requests at the earlier of request and validated
provider expiration. It skips an on-time authenticated paid event still queued
for processing. A subsequent signed late or cancelled payment retains a
verified receipt for review **without a wallet credit**; the owner must inspect
the original provider obligation. The app does not offer a manual "mark paid,"
refund, transfer or balance repair shortcut. Resolving an actual external
obligation requires an independently approved, audited provider-specific
operational procedure; **never** flip database statuses to simulate settlement.

Read-only per-request reconciliation compares provider receipts, settlement,
exact ledger amount/account currency, tenant/customer/reference links, late
payments, orphaned initiation and review jobs. It does not mutate financial
records. The closed client activity vocabulary adds payment initiated, expired
and review-required events, with funding references and system actors.

## Surfaces

- **Private Platform Admin → Payment Gateways:** aggregate-only counts of
  configured resellers, pending requests, verified/unsettled receipts, failed
  processing and review jobs by gateway; no tenant secrets or customer rows.
- **Subscriber → Payment Gateways / Funding Requests:** existing own settings,
  paginated status filters, safe per-request details, read-only reconciliation,
  and a separate tenant-scoped read-only review queue. Orphaned authenticated
  events appear in that queue even if no funding request matches them.
- **Customer Wallet:** final frozen payable, 202-in-progress, bounded
  visibility-aware status refresh, provider instructions and approved HTTPS
  checkout URL/address only while still payable. Paid time and wallet credit
  display **only after authoritative PAID/SETTLED**. Review presents a generic
  message; provider errors and owner diagnostics are not exposed to customers.
  With no available providers, the truthful reseller-funding fallback remains.

## Migration, testing and operational limits

`029_payment_processing_infrastructure.sql` is additive: a callback binding
on the existing configuration, immutable/fenced initiation and job records,
tenant/job evidence checks and new closed activity keys. Migrations 019–028
are untouched, and no stored balances, payment transactions, receipts,
service orders, authentication history or client activity are backfilled or
rewritten. The existing checked-checksum `db:migrate` runner applies pending
migrations only. **Do not run this procedure against production as part of
this Preview slice.** Before applying the development migration, compare
the Preview application's database fingerprint and the Replit development
database fingerprint and confirm migration 028's checksum agrees.

Focused disposable-PostgreSQL tests cover migration conservation, preflight
eligibility, idempotent/concurrent initiation, signed/unsigned and replayed
callbacks, wrong merchant/currency/amount/tenant/reference, exact money and
one credit, persistence and allocation failures, non-idempotent lookup recovery,
multi-worker leases, bounded retries, expiry, late/cancelled receipts, blocked
accounts, status lookup, redaction, scoped monitoring and read-only review.
These use a test-only in-memory fixture adapter with synthetic credentials.
Type checking and builds must pass separately. Live provider sandbox
credentials, actual provider webhook verification, external network outages,
real redirect behaviour, cross-process restarts against a real provider and
mobile/browser visual checks require later approved tests; this implementation
does **not** certify any named provider.

## Before the first real gateway is activated

Obtain its current official API and webhook documentation: validated merchant
credential names/format, supported payment methods and currencies,
webhook signature/replay and timestamp rules, callback URL requirements,
idempotency guarantee and lookup by stable funding ID, invoice lifecycle,
refund/cancellation capability, provider checkout hostnames, expected
timestamps/amount units, real expiry semantics and webhook delivery retries.
Implement and review one trusted adapter, check end-to-end sandbox operations
including ambiguous create-after-timeout and settlement failure, install
dedicated encryption secrets securely, approve an on-call review procedure,
and separately authorize migration/deployment. Cryptocurrency and USDT/USD
pricing assumptions remain expressly out of scope.
