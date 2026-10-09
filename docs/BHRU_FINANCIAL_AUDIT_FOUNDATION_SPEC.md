# BHRU Phase 1 design specification
## Financial semantics and client activity/audit baseline

Date: 2026-10-08  
Status: **design approved; Slices 1–4 implemented in Replit Preview only. Remaining slices are not implemented; future migrations require separate approval.**

### Implemented Slice 4 — customer security

See [Customer security](BHRU_CUSTOMER_SECURITY.md) for the current session/login
history models, compatibility, reset delivery limitation, password policy,
temporary lockout policy, transaction/idempotency rules, activity mapping,
customer/reseller permissions, proxy assumptions and privacy/retention boundary.

Additive migration `027_customer_security_sessions.sql` extends existing sessions
without invalidating them, and creates dedicated prospective login history,
temporary security state and hashed single-use reset grants. Migrations 019–026
and pre-existing credentials/financial history remain untouched.

The customer Security page and reseller Security tab are real. Password changes
keep the current session and revoke others; reset completion revokes all sessions.
Forgot/reset pages do not fake delivery: no existing mail sender exists, no email
is sent, and no raw reset grant is returned publicly. The secure lifecycle/reset
endpoint/UI are implemented; operational recovery delivery awaits separate approval.

Slice 3's `customer_logged_out` is retained as the logout event rather than
duplicating/renaming historical records. New security events augment the closed
registry and use verified customer/owner or truthful System attribution.

### Implemented Slice 3 — general client activity/audit baseline

Implemented on 2026-10-09. Activity is a chronological business/account audit
trail, NOT the financial ledger or authoritative service-order state. No password
recovery, 2FA, session-management UI, failed-login history, funding/payments,
invoices, credit, pricing/access policies, customer API or preferences are added.

#### Previous implementation and historical preservation

Client Detail previously loaded at most 50 persisted `public_customer_activity`
rows, tenant/customer-scoped, displaying only `action` and timestamp. Some owner
actions had `actor_id`; customer registration/login/service-order labels often
had none. Categories, snapshots, validated references and pagination were absent.
These are real old-format records, not reconstructed financial history.
The bounded legacy list remains in a clearly labelled, collapsed subsection;
existing compatibility writers remain intact. It can include old-format labels
corresponding to newer events. The new timeline reads ONLY the structured model.
No past events, actor identities or tracking-start baseline events are fabricated.

#### Model, taxonomy and references

Additive `026_client_activity_audit.sql` creates immutable `client_activity_events`:
UUID, tenant/customer composite FK, category/type, verified actor identity/display
snapshot, structured reference, unique event key, fixed summary, limited JSONB
metadata, optional IP/user agent, and database-generated timestamp.

| Category | Captured types |
| --- | --- |
| ACCOUNT | `account_created`, `account_blocked`, `account_unblocked` |
| PROFILE | `profile_updated`, `client_note_added` |
| FINANCIAL | `wallet_funds_added`, `wallet_deducted`, `wallet_adjusted`, `service_order_charged`, `service_order_refunded` |
| ORDER | `service_order_created`, `service_order_processing`, `service_order_completed`, `service_order_rejected` |
| SECURITY | `customer_logged_out` through the existing centralized logout |

API, PAYMENT and VERIFICATION remain reserved, not accepted/emitted. No fictional
activation or unsupported account states are added. Existing successful-login
labels remain legacy-format only; fuller login/security activity belongs to Slice 4.
The closed registry is mirrored in `customer-auth/activity.ts`, the database
validator and OpenAPI; future changes must update these together.

Actors are `customer` (canonical account ID), `subscriber_owner` (authenticated
tenant owner ID), or `system` (null ID). New staff identities are not invented.
The database resolves the display snapshot and rejects foreign actors.
Trusted server mutation code supplies transaction-local actor context. Direct
database-originated operations without human context are recorded as System,
never attributed to a guessed owner/customer.

Reference types are `customer_account`, `service_order`, `wallet_ledger_entry`;
all are UUIDs validated against BOTH tenant and customer. Financial events reuse
the exact Slice 2 ledger actor/reference, with one event per posting. Amount,
currency, direction and financial reason are joined from the immutable ledger
when reading; no financial truth is copied into event JSON. Order events reference
the canonical order, leaving its lifecycle validation and snapshots unchanged.
Reseller note events identify that a note was added, not its private contents.

#### Atomicity, immutability and retries

AFTER triggers capture actual account/profile changes, immutable ledger INSERTs,
service-order INSERT/status changes and note INSERTs within their authoritative
transactions. An activity failure rolls back the associated operation. No
asynchronous/eventual audit path exists. UPDATE/DELETE of posted events is blocked.

Account blocking still deletes existing customer sessions in the same transaction;
its semantics are unchanged. Registration identifies the new customer and captures
safe request context. Centralized logout emits only when a real tenant session is
deleted; retries without that session emit nothing and no session identifier is
stored. Login behavior, credential verification and authorization are unchanged.

Financial event keys/partial unique indexes enforce one event per posting.
Order keys/partial unique indexes enforce one event per actual supported
transition. Unchanged status/profile retries emit nothing; an actual reversal
creates a new event. Existing service/wallet idempotency remains authoritative.
Profile metadata lists supported changed field names, not old/new values;
login timestamps alone do not generate profile events.

#### Reseller surface, pagination, privacy and retention

`GET /api/clients/{id}/activity` uses existing subscriber authorization and
tenant/customer checks. Optional category filtering and microsecond-preserving
keyset cursor paginate 30 events newest-first by `(created_at DESC,id DESC)`.
Chronology/category indexes and scoped partial reference uniqueness indexes
support these queries without loading full history.

Only the Activity tab changes: compact event/actor/category/reference/details,
All/Account/Profile/Financial/Orders/Security filters, refresh, Previous/Next,
loading/error/empty states and bounded legacy records. Existing client/wallet/order
mutations invalidate its scoped cache; mount/window-focus/finite freshness and
explicit refresh handle changes made elsewhere.

The DTO explicitly projects approved fields; stored JSON/database rows are never
returned wholesale. Metadata allows only controlled changed fields and account
status/reason information. Financial internal notes, reseller note bodies,
passwords/hashes, tokens, cookies, session identifiers and arbitrary request bodies
are not included. IP and a control-character-stripped, 500-character maximum
user agent are captured only where request context is naturally available.
Customer statement/panel APIs never expose this reseller-only audit endpoint.

No automatic retention purge is added. Audit names and IP/user-agent data require
a separately approved retention/privacy policy; any future archival/deletion
mechanism must be explicitly privileged and must not mutate financial history.

#### Validation and Preview status

All **35 focused disposable PostgreSQL/HTTP groups passed**: existing wallet/order,
reconciliation/Retail checks remain intact, plus an empty historical cutover,
real customer registration, block/unblock/session revocation, profile changes,
ledger/order links, retry deduplication, atomic audit-failure rollback,
cross-tenant reference/read denial, immutable/allowlisted events, stable pagination,
category filters, customer access denial and safe centralized logout.
API/frontend TypeScript, generated libraries and API/frontend builds passed.
No broad browser/E2E suite was run.

Migration 026 is applied only to fingerprint-verified Replit development using
the existing tracked migration runner; migrations 019–025 are unchanged.
There is no commit, push, deployment, VPS/Dokploy/production access or project
memory/internal-note change in this slice.

### Implemented Slice 2 — ledger attribution and reconciliation

Implemented on 2026-10-08. No funding requests/gateways, invoices, credit facility,
client pricing/access policies, 2FA, customer API or general activity-log system
are implemented by this slice.

#### Mutation-path audit and financial authority

All five application posting paths converge on `appendMovement`: reseller Add
Funds (`admin_credit`), Deduct (`admin_debit`), Adjustment (`adjustment`), customer
service-order placement (`order_debit`) and reseller rejection (`order_refund`).
The immutable ledger INSERT invokes the existing database balance trigger. Client,
wallet and order locking, transaction boundaries, idempotency and exact original
refund snapshots remain intact. No completion debit exists. Account initialization
creates a guarded zero wallet and an origin baseline, not a financial entry.
No other application wallet writer was found; direct balance updates and ledger
UPDATE/DELETE remain blocked by existing guards.

#### Prospective actor/source/reference model

Migration `025_wallet_attribution_reconciliation.sql` reuses
`created_by_type/created_by_id` as the structured actor identity rather than adding
a competing actor pair. New customer charges use `customer`; signed-in tenant
owner operations and rejection refunds use `subscriber_owner`; `system` has a
null actor ID and a System snapshot for genuinely system-initiated internal
postings. There is no new system financial endpoint or worker.

`subscriber_staff` is reserved in the controlled taxonomy, but new staff postings
are rejected until an authoritative tenant staff membership model exists.
The current repository has exactly one `account_users` owner per subscriber;
this slice does not invent staff identities or alter authentication. Historical
`reseller` actor values remain unchanged, with no invented role/display backfill.

New immutable metadata:

- `actor_display_snapshot`: database-resolved owner/customer name at posting time.
- `operation_source`: `manual_wallet`, `service_order`, `service_order_refund`
  (with `system` reserved as a source category).
- `correlation_id`: server-selected manual ledger entry ID, or the existing order
  ID shared by its charge/refund; a business-operation correlation, not an HTTP
  request/session identifier.
- `posting_sequence`: allocated under the wallet row lock; unique per wallet;
  starts at 1 after cutover. Historical rows remain null.
- `reason` and `customer_note`: separate from `internal_note`; mandatory private
  reason for manual operations, with safe default customer descriptions.
- `correction_of_id`: optional same-tenant/customer link to an existing posting
  for a future compensating adjustment; no history-edit or new correction UI.

Order references reuse `reference_type/reference_id/original_debit_id` and all
existing exact-refund/unique-debit/refund constraints. No duplicate order-link
column is added. Manual statement references expose the immutable entry ID as
the manual operation's identifier; the existing physical `manual` reference
representation is preserved.

Before balance is derived exactly: credit `after - amount`, debit `after + amount`.
After remains the existing stored snapshot. Both raw strings and historical
account-currency formatting are exposed only in the richer reseller projection.
No new monetary authority, float calculation or FX conversion is introduced.

The migration also safely accepts older application INSERT shapes: on NEW
postings only, the verified single tenant-owner identity becomes `subscriber_owner`,
source/correlation are derived from existing type/order/entry identifiers, and
the old mandatory private reason is separated from the customer description.
This compatibility path does not update any historical row. Missing/foreign
actors, empty manual reasons and inconsistent sources are rejected.

#### Reconciliation and opening history

`GET /api/clients/{id}/reconciliation` is authorized through the existing reseller
context, tenant-scoped and read-only. No customer reconciliation route exists.
One SQL/MVCC snapshot reads wallet, origin baseline, postings and service orders:

```text
ledger-derived Available = authoritative origin + ledger credits - ledger debits
difference = stored Available - ledger-derived Available
```

Amounts are exact 10^12-scale account units. Diagnostics also check snapshot
currency, prospective sequence/before-after continuity, service-order debit
linkage and exact rejected-order refunds. Status is `MATCH`, `MISMATCH`, or
`UNVERIFIED` when a valid origin baseline is unavailable. Missing origin returns
null derived balance/difference, never a fabricated zero-based MATCH.
No check writes, repairs, resets or compensates balances/history.

`customer_wallet_baselines` records an immutable `guarded_zero_origin` with zero
opening units and the fixed account currency. Existing repository wallets have
this origin because migration 021 initialized every wallet at zero and enforced
ledger-only balance movement; migration 022 preserved that authority. Therefore
all historical postings are included, not just post-cutover rows. The baseline
is NEVER inferred as stored balance minus ledger totals: that would hide a
discrepancy. It is not an opening credit or a snapshot resetting financial truth.
Future imported/nonzero-opening accounts need separately verified provenance and
an explicitly approved baseline policy; this slice does not import them.

Historical ledger rows are not rewritten or assigned invented actors, sequence,
notes or relations. Their amounts contribute to reconciliation, but timestamp
ordering alone does not certify their old per-entry chain. The reseller view
states this limitation. Per-client diagnostics are implemented; no tenant-wide
scan or new platform-admin diagnostic surface is added.

#### UI, Preview and validation

Reseller Financial contains a read-only Financial Integrity card with stored,
ledger-derived and difference amounts, status, refresh/error handling and
historical-coverage notice. The existing ledger table adds exact before balance,
actor snapshot/role, source/sequence, original charge reference and private reason
separate from internal note. Mutations invalidate/refetch the integrity query
using the existing tenant-scoped client cache path.

Customer Account Statement retains safe descriptions and public order references.
No new actor IDs, private reason/note, sequence, correlation or reconciliation
metadata is exposed. Historical private-description fallback remains redacted in
display AND search. Refund descriptions are safe; the ordinary order's existing
customer-visible rejection response remains separate.

All **25 focused disposable PostgreSQL/HTTP groups passed**, including existing
debit/refund/double-spend/idempotency/isolation/Retail checks, a real 024-to-025
cutover with historical-row preservation, new zero origins, manual atomic
rollback, concurrent sequence allocation, actor/reason/linkage/privacy checks,
older-writer compatibility and MATCH/MISMATCH/UNVERIFIED read-only diagnostics.
API/frontend TypeScript, generated-library types and API build passed. No broad
browser/E2E suite was run.

Before applying 025 to Preview through the normal tracked migration runner, the
configured connection's database/OID/startup-time/migration-checksum fingerprint
was matched against Replit development. Migrations 001–024 were skipped and only
025 applied. No VPS/Dokploy/production connection, commit, push or deployment
was performed. Startup now requires the attribution columns and baseline table.

### Implemented Slice 1 — truthful vocabulary and consistent reporting

Implemented on 2026-10-08. This status applies only to Slice 1; the future-domain
and additive-migration recommendations below are still design boundaries.

- **Available Balance:** stored, spendable prepaid account-currency balance.
- **Ledger Credits / Ledger Debits:** PostgreSQL exact sums of all posted credit /
  debit magnitudes, including manual adjustments and refunds.
- **Total Spent:** exact posted debit amounts referenced by **completed** service
  orders, joined on subscriber, customer and immutable debit reference. Pending,
  processing and rejected/refunded orders are excluded. Live catalog prices,
  current FX rates and Retail orders are not used.
- **Net Service Charges:** all service-order debits minus exact order refunds,
  including open orders. Shown in reseller Financial, not duplicated throughout
  the customer panel.
- **Account Currency:** unchanged immutable client account currency.

One batch-capable financial-summary path supplies customer Dashboard/Wallet/
Statement, reseller client detail/wallet and client-list financial summaries.
Wallet balance, ledger totals and completed charges are selected in one SQL
statement/MVCC snapshot. Currency presentation configuration is read separately;
there is no funding FX or second live wallet read within the calculation.
`reportingVersion: 2` identifies the new completed-only `totalSpent` semantics.
`totalCredits`/`totalDebits` and their formatting keys remain compatibility aliases
for the new explicit ledger-credit/debit fields. The OpenAPI contract and generated
clients document these meanings.

Due/Credit and fabricated credit-facility fields are removed from summaries/APIs.
Unused zero Locked Balance is hidden in customer Wallet/Statement and reseller
Financial/Overview/client lists; raw locked fields/schema remain unchanged.
Dashboard removes the unused Locked metric. Its wide DHRU-inspired main/sidebar
grid is retained; Available Balance occupies the former Due/Credit gap. Order
status, announcements, Top Area and navigation structure are unchanged.

Customer Transactions is titled **Account Statement**, retaining its existing
route. Rows show date/time, customer-visible description, credit/debit, amount,
resulting balance, posted context and an order link/reference when available.
It is explicitly not external payment history. Legacy manual descriptions that
equal the internal reason are redacted in the customer read projection and search,
while explicit separate customer notes and original immutable ledger rows remain
intact. Internal reseller ledger views remain unchanged.

Reseller Financial retains Add funds, Deduct and Adjustment, shows Account
Currency, and explains completed spending versus net service charges. No new
funding, payment, invoice, reservation, credit or authentication behavior exists.

**Schema/migrations:** none added or modified; migration 025 is not required.
No existing wallet balance, currency, order snapshot or ledger row is changed by
summary reads. Atomic debit, refund, idempotency and tenant isolation are unchanged.

**Validation:** all 16 dedicated finance SQL/HTTP groups passed. API TypeScript/build and frontend TypeScript passed; generated
contract/library typecheck passed. The dedicated finance harness uses a disposable
Unix-socket PostgreSQL cluster, not Preview/production databases. It exercises
pending/processing/completed/rejected semantics, identical summaries across
customer/reseller/list views, statement ledger totals, exact refunds, concurrent
spending, rollback, idempotency, immutable history/currency, tenant isolation,
Retail isolation, statement privacy/search and inline-JavaScript/CSP integrity.
The older onboarding harness stopped at its pre-existing server-rendered profile
address expectation after `/customer/account` became the Dashboard; no unrelated
application change was made to satisfy that assertion. No browser/E2E suite,
production access, push or deployment is part of this slice.

## A. Executive summary

Preserve BHRU's existing prepaid wallet and direct-debit service-order lifecycle.
Use immutable financial postings as money authority and stored wallet balances as
transactionally maintained operational projections. Add truthful terminology,
coherent reporting and attributable activity without creating a second client,
wallet, catalog or order system.

Decisions recommended for approval:

1. **Available Balance is prepaid spendable money.** It is never combined with an
   approved credit limit or pending funding.
2. **Keep direct debit on order placement and exact refund on rejection.** Do not
   introduce reservations merely to make Locked Balance look useful.
3. **Hide Due/Credit and unused credit metrics until an authoritative facility/
   receivable model exists.** Unsupported is not equivalent to a known zero.
4. **Total Spent means successful, completed service spending**, as requested.
   Current code instead calculates net service charges, including open orders.
   Keep those as distinct measures rather than silently changing their meaning.
5. **Retain the existing 12-decimal integer account-unit representation.** Do not
   rewrite money into ordinary cents or recalculate old amounts using current FX.
6. **Extend the existing ledger's attribution prospectively.** Preserve immutable
   historic values and report unknown historical attribution honestly.
7. **A richer immutable activity event stream references money and orders; it does
   not replace their ledgers/history.** Preserve the existing activity feed as
   legacy history.
8. Funding, payment, invoice and optional credit domains are future boundaries.
   No such functionality is implemented by this specification.

### Evidence and limits

Reviewed source:

- Migrations `019_public_customer_auth.sql`, `020_public_customer_onboarding.sql`,
  `021_customer_wallet_manual_services.sql`, `022_strict_client_account_currency.sql`,
  `023_customer_registration_currency_availability.sql`,
  `024_service_group_availability.sql`.
- `artifacts/api-server/src/lib/client-finance/wallet.ts`:
  `financialSummary`, `appendMovement`, `mutateWallet`, `statement`, `ledgerView`.
- `artifacts/api-server/src/lib/client-finance/orders.ts`:
  `purchaseService`, `transitionOrder`, order snapshots and status queries.
- `artifacts/api-server/src/lib/customer-auth/clients.ts`:
  client detail, activity projection, profile/status/notes.
- `artifacts/api-server/src/lib/platform.ts`: transaction wrapper.
- Reseller `client-detail.tsx`, customer `panel-ui.ts` and finance routes.
- `docs/BHRU_CLIENT_ACCOUNT_GAP_AUDIT.md`.

This is source-level analysis. No database was queried, no balances were examined,
no runtime tests were run, and production/VPS/Dokploy were not accessed. Assertions
about existing guards describe source, not a production-data certification.

## B. Pre-Slice 1 BHRU financial model — audit baseline

Sections B/C retain the original audit findings for traceability. The implemented
Slices 1–3 status above identifies the reporting, attribution, reconciliation,
activity baseline and privacy issues now resolved; fuller security/credit recommendations remain
future work.

### Canonical identity and boundaries

`public_customer_accounts` is the canonical client. Each client belongs to one
subscriber and has an immutable Account Currency. `customer_wallets` has the
composite key `(subscriber_id, customer_id)` and its currency must match that
account. Reseller registration currency availability is a separate policy, not
permission to change an existing wallet's currency.

Service orders and retail/E-Commerce orders remain separate. Registered retail
orders can reference a canonical client; guest checkout must not invent an
account or wallet. Neither retail totals nor subscriber licence/subscription
records become client service spending or receivables.

### Actual money implementation

| Component | Existing behavior |
|---|---|
| `customer_wallets.available_balance` | Integer-valued `numeric(24,0)`, nonnegative; updated by the ledger insertion trigger |
| `locked_balance` | Nonnegative stored field, initialized at zero; no current reserve/release workflow |
| `credit_limit` | Initialized at zero and constrained to zero; not an operating credit facility |
| `customer_wallet_ledger` | Immutable rows; direction, account amount, currency snapshot, after-balance, actor, references and idempotency |
| `amount_account_units` | Amount in the client's Account Currency at scale `10^12` |
| `amount_usd_units` | Historical/source USD amount, nullable for new non-USD manual movements; not wallet authority |
| Service price | USD catalog basis converted once into account minor precision and represented at the fixed account-unit scale |
| Funding/adjustment | Entered in Account Currency; no funding FX |
| Order placement | Client/wallet locks, server-calculated price, immutable order/debit inserted atomically |
| Rejection | Exact original account amount and original snapshots refunded, with one-refund constraints |
| Completion | Status/result update; no additional financial posting |
| Statement | Tenant/client-scoped ledger pagination; customer projections exclude internal-note/actor fields |
| Transactions page | Calls the same `/panel/statement` endpoint as Wallet; not a payment-transaction subsystem |

The guarded wallet initializes at zero. Direct wallet updates/deletes are guarded;
ledger updates/deletes are rejected. The database checks direction/type, original
refund amount/snapshots, tenant-scoped financial references and order/debit
consistency. Application money arithmetic uses `BigInt`.

Current aggregate formulas:

```text
Total Credits = SUM(account amount WHERE direction = credit)
Total Debits  = SUM(account amount WHERE direction = debit)
current Total Spent =
    SUM(order_debit account amount) - SUM(order_refund account amount)
Due = literal zero
Credit Limit = literal zero
```

The first two include manual movements and refunds; the third includes pending
and processing orders that were charged but not yet successfully fulfilled.

## C. Problems and ambiguities discovered

1. **Due/Credit is displayed without real debt accounting.** Both the financial
   summary and client projection supply zero. There is no receivable authority.
2. **Total Spent currently conflicts with the requested definition.** The gap
   audit correctly described existing net charges; this brief now explicitly
   requires successful service spending. This specification distinguishes them.
3. **Locked is structural, not operational.** Open orders have already reduced
   Available; they are not an additional locked balance.
4. **Credits/debits are gross statement totals**, not deposits/revenue/spend.
   Refunds increase Total Credits without introducing new customer deposits.
5. **Transactions is a statement view**, not evidence of external payment.
   Manual `method` and `transaction_reference` fields are metadata, not settlement.
6. **Ledger attribution is limited.** Existing creator ID/type is real and checked,
   but owner/staff distinction, display snapshot, request correlation and causal
   operation metadata are not present.
7. **Activity lacks detailed attribution and coverage.** The reseller projection
   returns the latest 50 `id/action/date` rows, omitting even stored staff actor.
   Customer financial events can have null activity actor. No entity link or rich
   safe metadata is stored. Logout has no recorded event.
8. **Internal reason can become customer description.** `mutateWallet` uses
   `customerNote || reason` as description. Staff must not assume a blank customer
   note makes their reason private.
9. **Summary reads are not guaranteed to share a snapshot.** `financialSummary`
   fetches wallet/rates and totals using several statements. The transaction
   wrapper sends plain `BEGIN`, not explicit repeatable-read isolation. Under
   PostgreSQL's usual READ COMMITTED setting, a concurrent posting can occur
   between statements. This is a reporting-consistency risk, not proof that the
   locked mutation path permits double spending.
10. **Display chronology is not an authoritative posting sequence.** Statement
    ordering uses `created_at` and UUID; `now()` can represent transaction start
    time and ties occur. A timestamp/UUID sort must not be treated as proven
    historical causal order.
11. **Cancellation is not a real workflow.** `cancelled` is an allowed stored/
    filtered vocabulary value, but current validated transitions do not enter it.
12. **The current financial domain is not a complete double-entry general ledger.**
    It is an exact client prepaid subledger. Gateway fees, bank reconciliation,
    business revenue and tax accounting must not be inferred from its totals.

## D. Authoritative financial vocabulary

All values below are scoped to one subscriber/client and one immutable Account
Currency. Amounts across different account currencies must not be added without
a separately labeled reporting conversion, never a wallet conversion.

### Definitions, storage and authority

| Concept | Business meaning | Stored or derived / authority | Can be negative? | Domain |
|---|---|---|---|---|
| Available Balance | Settled prepaid money spendable now | Stored operational projection; reconciles to wallet postings; future reservations reduce it | No | Prepaid |
| Locked Balance | Prepaid money reserved, not yet charged | Currently stored but unused; later derives from active reservation postings | No | Prepaid reservation, only if introduced |
| Due | Outstanding recognized client receivables not yet settled or validly reversed; not necessarily overdue | Derived from future receivable postings/allocations; unavailable today | No; overpayments become separate unapplied credit, not negative debt | Receivable/credit, not prepaid |
| Credit Limit | Explicit approved facility ceiling | Versioned facility policy; not a wallet movement | No | Credit facility |
| Used Credit | Outstanding drawn facility principal and only explicitly approved financed fees | Derived facility-linked receivable exposure; optional locked projection | No | Credit facility |
| Available Credit | Signed facility headroom: `limit - used credit` | Derived; spending capacity is `max(0, headroom)` | Can be negative if over-limit; must not grant spending | Credit facility |
| Total Credits | Gross positive posted prepaid movements, including refunds/manual credits | Derived credit-direction wallet ledger sum | No | Prepaid statement |
| Total Debits | Gross negative posted prepaid movements, including manual deductions/order charges | Derived debit-direction wallet ledger sum | No | Prepaid statement |
| Total Spent | Successfully completed service spend, net of any separately approved later completed-order refunds | Derived completed service snapshots linked to original charges and eligible refunds; not all debit rows | No | Service fulfillment reporting |
| Pending Funding | Amount requested but not yet approved/allocated as wallet money | Future funding-request projection; no current source | No | Funding workflow, not prepaid balance |
| Refunds | Valid compensating restoration of a referenced charge | Posted immutable refund entries; gross refund aggregate derived | Positive refund amounts; reversal would be a separate authorized posting | Prepaid now; original funding allocation later |
| Adjustments | Authorized manual credit/debit or correction, with reason and actor | Immutable manual ledger postings; signed net aggregate can be derived | Entry magnitude positive; signed net may be negative | Prepaid; future credit corrections separate |

“Stored projection” is not permission for an operator to edit a balance. There
must be a financial posting for every change.

### Spendability and change events

| Concept | Affects spending? | When it changes | Event/business cause |
|---|---|---|---|
| Available | Yes, subject to account/service eligibility | Posted credit/debit; later reserve/release | Funding allocation, manual movement, order charge/refund |
| Locked | Removes prepaid availability if implemented | Reserve/release/consume a real reservation | Reservation lifecycle, not order status alone |
| Due | Not additional money; risk policy may block new borrowing | Recognize, settle or reverse a receivable | Credit draw/repayment; approved billed receivable |
| Credit Limit | Changes authorized borrowing, not cash | Approved facility create/amend/expire/block | Facility policy event |
| Used Credit | Reduces headroom | Atomic draw, repayment allocation or draw reversal | Credit posting, not invoice printing |
| Available Credit | Only approved positive headroom is borrowable | Limit or exposure change | Derived facility events |
| Total Credits | No separate spending capacity | Each positive wallet posting | Credited ledger entry |
| Total Debits | No separate spending capacity | Each negative wallet posting | Debited ledger entry |
| Total Spent | No; charge already happened | Successful completion; future explicit completed-order refund | Order completed; approved post-completion financial correction |
| Pending Funding | Never | Request/verification/approval/rejection/cancellation | Funding state transition and remaining allocation |
| Refunds | Increases availability when actually posted | Valid refund commits | Original charge reversal; no current FX |
| Adjustments | Yes through posted delta | Authorized adjustment commits | Staff/manual correction event |

### Visibility and presentation

| Concept | Customer sees | Reseller sees | Dashboard recommendation | Statement representation |
|---|---|---|---|---|
| Available | Yes | Yes | Primary financial amount | Before/after balance for actual postings |
| Locked | Only when real reservations exist; otherwise omit | Only operationally supported; flag anomalies separately | Hide while unused | Reserve/release journal later, not fake current debit |
| Due | Only when receivables are supported and authorized | Same | Hide now | Separate receivable statement, not wallet posting |
| Credit Limit | Only own enabled facility | Authorized financial staff | Facility panel only | Policy history, not cash credit entry |
| Used Credit | Only own facility | Authorized financial staff | Facility panel only | Credit/receivable postings |
| Available Credit | Signed headroom/over-limit explanation; spendable credit separately | Same | Facility panel only | Derived value, not cash posting |
| Total Credits | Yes, with definition | Yes | Optional summary; not called deposits | Gross credit rows |
| Total Debits | Yes, with definition | Yes | Optional summary; not called spend | Gross debit rows |
| Total Spent | Yes | Yes | Completed-service spend | Original charge remains at placement; completion is an order event |
| Pending Funding | Own requests after feature exists | Approval queue | Optional only after workflow exists | No wallet row until allocation |
| Refunds | Own visible reason/reference | Original debit and staff reason | Optional period summary | Exact linked positive posting |
| Adjustments | Visible description and financial effect only | Reason, actor, internal note | No separate balance card required | Signed manual/correction row |

### Reporting contract and successful spending

Introduce explicit, versioned semantic fields in future implementation:

```text
netServiceCharges = sum(order debits) - sum(valid order refunds)
completedServiceSpend = sum(completed order charged snapshots)
                       - eligible post-completion refunds, if separately introduced
openServiceCharges = sum(charged pending/processing orders)
```

Current scope has no completed-order refund workflow, so completed spend is simply
the sum of completed orders' immutable `price_account_units`, checked against their
debits. Rejecting an uncompleted order never increases completed spend.

Do not silently reassign an existing API field while other consumers depend on its
old definition. Add clear fields, migrate both Dashboard/client-detail consumers
in one approved slice, and deprecate the ambiguous legacy `totalSpent` alias with
an explicit definition/version. The new UI's **Total Spent** maps to completed
service spend. This changes reporting, not wallet history or monetary postings.

### Prepaid example: two alternative outcomes

| Step | Available | Gross credits | Gross debits | Net service charges | Completed service spend |
|---|---:|---:|---:|---:|---:|
| Credit 100 account-currency units | 100 | 100 | 0 | 0 | 0 |
| Place service order for 30 | 70 | 100 | 30 | 30 | 0 |
| Mark processing | 70 | 100 | 30 | 30 | 0 |
| Outcome A: complete | 70 | 100 | 30 | 30 | 30 |
| Outcome B instead: reject/refund | 100 | 130 | 30 | 0 | 0 |

A completed order cannot then follow Outcome B through an ordinary status edit.
The example shows that total credits are not the customer's original deposits.

## E. Wallet model

### Recommendation: hybrid, not recompute-before-every-purchase

Keep `customer_wallets` and `customer_wallet_ledger`.

- The immutable ledger is the durable money authority.
- Stored Available is the operational projection used under row lock for spending.
- Ledger insertion and projection update occur in the same PostgreSQL transaction.
- No external cache or browser value authorizes money.
- A failed posting rolls back its order, balance and required business audit event.
- A zero opening wallet needs no artificial funding entry.

Today:

```text
available = sum(credit account units) - sum(debit account units)
locked = 0 for the implemented direct-debit lifecycle
```

If actual reservations are later needed:

```text
total prepaid cash = sum(settled cash postings)
locked = sum(active reservation deltas)
available = total prepaid cash - locked
```

This requires explicit reservation postings/guards, not silently relabeling charged
pending orders as locked. Internal bucket transfers must not become deposits,
spend or debt. Do not change the existing five-entry model to fake zero-value or
double-counted reservation credits/debits.

### Coherent summaries and reconciliation

Use a single SQL statement/CTE snapshot for wallet and aggregate summaries, or a
short read-only repeatable-read transaction. Do not lock wallets for routine UI
reads. Return an `asOf`/semantic version so a stale displayed balance is not a
promise that a subsequent purchase will succeed.

For reconciliation, use one repeatable-read snapshot across wallet, ledger and
orders, or acquire the standard client/wallet locks for an individual verification.

Check:

1. One wallet per canonical client; matching Account Currency.
2. Stored Available equals signed ledger account units from zero opening.
3. Each posting's exact before/after delta is valid; snapshots match account.
4. Each service order has one correct debit; rejection has one exact refund.
5. Completed orders have no ordinary rejection refund.
6. Existing locked/credit fields remain consistent with their unsupported status.
7. No cross-tenant references, orphan allocations or duplicate idempotency keys.
8. Credit headroom/capacity for refundable open orders remains within numeric limits.

Keep checks exact in account units. Never reconcile against formatted/rounded
display strings. With no authoritative historical posting sequence, timestamp
ordering alone cannot certify an entire legacy balance chain.

A discrepancy produces a restricted incident report. Do not auto-rewrite wallet
balance, delete rows, invent “opening credit”, reset currency or replay postings.
Determine whether the projection or source history is at fault; any projection
repair requires separately approved reconciliation procedure. A business correction
is a new compensating posting, not a cache-repair disguise.

## F. Future credit facility model

**Not part of the currently implemented wallet or Phase 1 code changes.**

Keep `customer_wallets.credit_limit = 0` as legacy unsupported state. Do not lift
its constraint and call that a facility.

Recommend:

- `client_credit_facilities`: immutable identity/currency; approved versioned limit,
  status, validity, approval actor/reason and policy.
- Immutable receivable postings for draws, repayment allocations and reversals.
- Used Credit derived from facility-linked exposure; a locked projection may be
  maintained for atomic authorization/performance.
- Due derives from all recognized outstanding receivables, including facility
  draws. It is not the sum of invoice-due plus the same facility debt a second time.
- Invoice due is a document view of its linked receivable/allocation. Unpaid
  funding requests/pro-forma invoices are not recognized customer debt.

Safest default remains **wallet-only**. Later credit is opt-in for approved clients/
groups. Prefer **wallet first, then approved credit**, with a persisted per-order
allocation of prepaid charge and credit draw, executed atomically under client,
wallet and facility locks.

Example: a price of 100, prepaid funds 70, approved available credit 50 results in
70 prepaid debit and 30 credit draw; not an artificial 30 wallet credit.
Rejection restores 70 prepaid and reverses 30 debt. Completion adds neither
another debit nor another receivable.

Normal limit reduction should not fall below used credit plus any actual reserved
credit exposure. An explicitly approved over-limit/block scenario must retain
the real negative headroom and deny new draws; do not clamp the debt itself away.
Spendable credit is `max(0, limit - used - actual credit reservations)`.

Repayment must specify its allocation to debt. It does not also increase prepaid
Available unless a separately recorded remainder is allocated there. No automatic
funding FX, no cross-currency facilities and no unapproved interest/fee accrual.

## G. Ledger/statement architecture

### Reuse the current immutable ledger

| Required question | Current authority / recommended addition |
|---|---|
| Which tenant/client? | Existing `subscriber_id/customer_id`, composite FKs |
| What happened? | Existing controlled `type/direction` plus human-readable labels |
| How much/currency? | `amount_account_units/account_currency_snapshot`; USD column is source metadata |
| Before/after? | `balance_after`; exact before is derived from direction/amount |
| Business object? | `reference_type/reference_id/original_debit_id`; extend reference vocabulary only with future domain |
| Who? | Existing checked `created_by_type/created_by_id`; prospective role/display snapshot and initiating credential context |
| Why? | Visible description; separately internal mandatory reason/note |
| Retry identity? | Existing scoped idempotency key + normalized request hash |
| When? | Server `created_at`; prospective per-wallet posting sequence |
| Request/source? | Add prospective server correlation, business operation/cause and controlled source |

Exact before-balance needs no duplicated monetary authority:

```text
credit: before = after - amount
debit:  before = after + amount
```

Keep both magnitude and direction; no negative `amount_account_units`.
Expose derived before and stored after as exact unit strings plus historical
currency formatting.

Do not introduce an ambiguous `amount_minor` alias. Account units use `10^12`;
currency minor units use `10^currency_decimals`. Newly entered minor-unit amounts
map exactly as `account_units = minor_units × 10^(12 - decimals)`. Legacy values
must remain exact even if the current display precision rounds them. JSON money
values are decimal strings, never floating-point numbers.

### Prospective attribution, not financial backfill

Minimal prospective additions to existing ledger: nullable posting sequence,
controlled operation source, correlation/business-operation ID, immutable
actor display/role snapshot and optional correction-of relation.

Old rows remain unchanged/null for unavailable context. Generate new per-wallet
sequence under the existing wallet lock and enforce partial uniqueness. Sequence
starts at the approved cutover; it does not fabricate legacy UUID chronology.
Only enforce required new metadata once all writers support it.

Do not add balance-before/locked/credit-used duplicates to every existing cash
row. Derive before today; if future reservations or facilities are introduced,
their own postings record their before/after exposure. A combined read-only
financial view can link journals without creating a second financial authority.

### Controlled financial taxonomy

Keep existing physical names in Phase 1. Friendly labels do not require rewriting
historical types.

| Concept | Domain/type | Phase boundary |
|---|---|---|
| Manual credit | Existing `admin_credit`, credit | Phase 1 foundation; label “Manual credit” |
| Manual debit | Existing `admin_debit`, debit | Phase 1 foundation |
| Adjustment | Existing `adjustment`, explicit direction | Phase 1 foundation; mandatory actor/reason |
| Service order charge | Existing `order_debit` | Phase 1; placement, not completion |
| Service order refund | Existing `order_refund`, original debit link | Phase 1; exact rejection refund |
| Correction | Existing compensating adjustment initially; prospective correction-of reference | Phase 1 policy/attribution; not edit/delete |
| Wallet funding | Future `wallet_funding` linked to confirmed payment allocation | Funding phase only |
| Funding request approved | Funding state and activity event | Not a second ledger credit |
| Funding request rejected | Funding state/activity event | No wallet entry when no money was posted |
| Payment received | Payment transaction/settlement event | Wallet credit only for explicit wallet allocation |
| Payment fee | Payment/business accounting; wallet debit only if agreed client fee is actually charged | Payment phase; never duplicate a net-credit fee |
| Credit draw | Credit/receivable posting | Credit phase, not prepaid deposit |
| Credit repayment | Credit/receivable allocation | Credit phase, not automatic wallet funding |
| Credit adjustment | Audited compensating receivable posting | Credit phase, no generic cash adjustment |
| Transfer in/out | Future paired scoped wallet postings | Optional later transfer phase |
| Invoice payment | Payment/document allocation; prepaid debit only if it is a new authorized payment | Billing phase; no re-charge of already paid service |
| Reserve/release | Separate controlled reservation journal | Only if business need exists |

New domains require explicit typed references and database constraints. The current
ledger's reference FK targets service orders, so arbitrary future payment UUIDs
cannot simply be stuffed into that column.

## H. Order financial lifecycle

| Transition/action | Wallet behavior | Spend reporting / audit |
|---|---|---|
| Place → pending | Debit exact server price; insert order and debit atomically | Net charges/open charges increase; completed spend unchanged |
| pending → processing | None | Order processing event only |
| pending → completed | None | Completed spend increases; order completion event |
| processing → completed | None | Same |
| pending → rejected | Exact original credit/refund and rejection commit together | Open/net charges decrease; completed spend unchanged |
| processing → rejected | Same | Same |
| Repeat same terminal state | Return existing state, no new financial effect | No repeated mutation event |
| Completed → rejected | Forbidden | Later standalone audited refund feature, if approved |
| Cancellation | Not implemented | Do not advertise it or enable via a free-form status change |

Keep current direct-debit/refund. It is simpler and appropriate for the current
manual workflow. Changing to reserve/consume would add bucket accounting,
reservation expiries and reconciliation without a present requirement.

A future cancellation command should explicitly define eligible unfulfilled
states, reason, authorization and refund allocation. It must compete under the
same locks with completion/rejection and cannot refund twice.

Current same-state replay ignores a new result/reason payload. A future command
idempotency contract should hash that payload, return the original result for
matching retries and reject a reused key with different intent. This is not
implemented here.

## I. Funding/payment architecture

Keep three authorities separate:

1. **Funding Request:** intent/evidence/review, not spendable money.
2. **Payment Transaction:** verified external/manual receipt, outcome, method and
   source reference, not a wallet balance.
3. **Wallet Allocation/Ledger:** exact internal effect on one account.

Recommended initial request states: submitted, awaiting verification, approved,
rejected, cancelled. Approved means the agreed wallet allocation actually
committed; a verified but unallocated receipt remains explicit pending work.

For manual approval, lock the canonical client, request, payment record and wallet
in the published order. Validate staff permission, same account currency, confirmed
amount, request state and funding policy. In one DB transaction:

- Record/use the verified payment transaction.
- Insert a unique wallet allocation.
- Insert the exact wallet-funding posting.
- Mark the request approved.
- Write business/audit events; commit.

External bank/provider movement cannot be rolled back by a database rollback.
When external receipts are received separately, preserve a durable verified
inbox/payment record first. A retryable allocation transaction then commits the
wallet posting and request outcome. On failure the payment remains received but
unallocated; it is not silently lost or treated as already credited.

Idempotency identities:

- Request creation: customer/tenant/key + normalized intent.
- Confirmed payment: trusted provider-account/external transaction/settlement-leg
  identity; manual cash uses an approved unique receipt/operation identity.
- Allocation: payment and purpose/account, with locked remaining amount and unique
  allocation intent.
- Wallet posting: allocation-derived stable identity, not a newly generated key
  on each retry.
- Approval: request/business-command identity and request hash.
- Callback receipt: provider event ID plus settlement identity; two differently
  named callbacks for the same payment must not create two credits.

A free-form transfer reference or uploaded proof is not authenticated deduplication
evidence. A single payment cannot be reused for another client/tenant. If partial
allocations are later offered, total allocated must not exceed verified allocatable
amount.

Funding uses the account currency. Do not apply catalog FX to deposits. A provider
settlement in another currency requires a separately approved accounting policy,
not silent wallet conversion.

Fee ownership must be explicit: if reseller absorbs a fee, the customer may still
receive the agreed full credited amount; the fee is business expense. If a disclosed
customer fee reduces credit, record agreed gross/fee/net and post the agreed net
once. Never both net the fee and debit it again.

## J. Invoice boundary

Do **not** automatically generate an invoice for every tiny manual service order.
Retain an immutable wallet statement for every financial movement. Offer optional
documents for business needs: confirmed funding receipts, grouped billing,
customer-requested service invoices and legally required tax documents.

- Service order: fulfillment and frozen charge, not invoice authority.
- Invoice: issued billing identity/lines/tax/totals, not financial ledger.
- Payment: actual received/returned money.
- Wallet: prepaid postings/settlement allocation.

An invoice for already debited prepaid orders must be marked settled by references
to those charges, not trigger a new debit or receivable. An unpaid funding request
or pro-forma document is not debt. A binding postpaid invoice can reference a
recognized receivable, which is counted only once in client Due.

Future issued invoices need tenant-controlled atomic numbering, immutable
currency/customer/seller/line snapshots, tax policy and payment allocations.
Amount received/due is derived from allocations and valid credit notes. Issued
documents are corrected through approved void/credit-note workflows, not edited
totals. Legal retention/tax rules require a business/jurisdiction decision.

Retail receipt/order economics stay independent, even if document-rendering
infrastructure is reused.

## K. Manual adjustment rules

Preserve current Add/Deduct/Adjust with explicit direction, positive amount,
Account Currency, mandatory reason/method, staff identity and UUID idempotency.

Recommended rules:

1. Resolve staff authorization server-side; no supplied actor/customer/tenant
   identifier grants permissions.
2. Require a nonempty internal reason; keep internal note separately.
3. Customer-visible note is explicit. If absent, default to a safe label such as
   “Manual credit”, not the internal reason.
4. Reference/method remain evidence metadata unless linked to a verified payment.
5. Differentiate correction from deposit, goodwill credit and balance deduction
   through controlled purpose, not free-form financial types.
6. A correction posts the opposite financial effect with an original-entry link
   and reason; never UPDATE/DELETE a posting.
7. A deduction cannot make prepaid balance negative. A failed correction should
   require investigation, not silently invent debt.
8. Current account blocking denies login/orders but does not automatically prevent
   reseller financial adjustments. Preserve ability to refund/repair blocked
   clients; future recharge restrictions distinguish funding from restitution.
9. Existing refundable-order capacity checks remain; refunds must fit the wallet.
10. Preserve the key across double-click/retry/network timeout. Same key + same
    payload returns original; changed payload/actor with same key returns conflict.

For a full correction, permit only one compensating reversal of the original
posting. If partial corrections are later supported, lock the original cause and
ensure cumulative reversal does not exceed it. Use a dedicated correction-of
relation; do not reuse `original_debit_id`, whose current constraints reserve it
for service-order refunds.

For mistaken funding that was already spent, do not erase the deposit or use an
unapproved negative balance. Handle recovery through an explicitly approved debt/
dispute process or deny the correction and escalate internally.

Do not rewrite old descriptions that already contain staff reasons. If a privacy
review finds exposure, use a separately approved customer-projection/redaction
process with audit evidence; the money record remains intact.

## L. Activity/audit architecture

### Separate authorities, coherent event vocabulary

- Wallet ledger: financial truth.
- Service order/snapshots: fulfillment truth.
- Security events: authentication/session/security facts.
- Business activity: account/profile/order/funding decisions and references.
- Outbox/delivery records: asynchronous notification delivery, not financial truth.

Current `public_customer_activity` cannot represent this fully: subject customer
is required, action taxonomy is limited, actor only references `account_users`
with `ON DELETE SET NULL`, and customer deletion cascades. Unknown-user login
failures and immutable historical actor evidence need a different envelope.

**Recommended minimal successor: `client_activity_events`.** Reuse the existing
feed as legacy history, not a second actively written business feed. The new table
is an audit domain, not a duplicate client or wallet table.

One compatibility writer chooses one sink per operation during cutover. After
cutover, new domain actions write only the new envelope. Read old and new history
through a unified, source-tagged timeline. Do not duplicate/backfill money or
pretend old null actors were recorded. Optional later legacy import must preserve
original IDs/time and unique origin references; it is not required for Phase 1.

### Controlled event registry

| Category | Event names | Capture now versus future |
|---|---|---|
| AUTH | `auth.login_succeeded`, `auth.login_failed`, `auth.login_blocked`, `auth.logout` | Existing login/logout actions can be integrated in a security-audit slice |
| AUTH | `auth.password_changed`, `auth.recovery_requested`, `auth.recovery_completed`, `auth.session_revoked`, `auth.all_sessions_revoked`, `auth.2fa_enabled`, `auth.2fa_disabled` | Emit only after real corresponding features exist |
| PROFILE | `profile.updated`, `profile.phone_changed`, `profile.address_changed`, `profile.preferences_changed` | Current reseller profile changes; field-specific and preference events when real mutation occurs |
| ACCOUNT | `account.created`, `account.activated`, `account.blocked`, `account.unblocked`, `account.group_changed`, `account.note_added` | Existing actions with structured actor/reason/entity context |
| ACCOUNT | `account.verification_changed`, `account.service_access_changed`, `account.suspended`, `account.closed` | Future policy/lifecycle implementation |
| FINANCIAL | `wallet.manual_credit_posted`, `wallet.manual_debit_posted`, `wallet.adjustment_posted`, `wallet.order_refund_posted` | Existing financial actions; reference immutable ledger entry |
| FINANCIAL | `funding.created`, `funding.approved`, `funding.rejected`, `payment.recorded`, `credit.facility_changed`, `credit.draw_posted`, `credit.repayment_posted` | Future domains only |
| ORDER | `order.created`, `order.processing`, `order.completed`, `order.rejected` | Current lifecycle; rejection links exact refund |
| ORDER | `order.cancelled` | Only after cancellation workflow exists |
| API | `api.enabled`, `api.disabled`, `api.key_generated`, `api.key_rotated`, `api.key_revoked`, `api.ip_policy_changed` | Future customer API, not provider import |

Event registry specifies category, valid source/actor/subject/object types,
metadata schema, audience, severity and retention class. Do not allow clients to
submit arbitrary event names or arbitrary JSON audit payloads.

### Exactly-once meaningful events

Financial mutations/order transitions and their required business events commit
in the same transaction. Event uniqueness uses stable causal identity, e.g.
ledger entry + posted action, or order + actual transition. Idempotent replays
return existing outcome without another action event.

Rejection may have an order-rejected event and a linked refund-posted event. These
are two distinct facts, not two refunds. Default Activity can group the operation
and link to Statement, rather than repeating every ledger row as another balance
table.

Successful session creation/login audit commits together. Logout captures actor/
non-secret session reference before session deletion and commits both.
**Failed login events must be written after/outside the failed authentication
transaction**, so a thrown authentication error does not roll them back.
Never turn inability to audit a failed login into a successful authentication.

Unknown identifiers use anonymous actor/unidentified subject and tenant context
only when actually resolved. Do not create fake clients or reveal whether the
identifier exists. Invalid/unresolved-host requests belong to perimeter logs, not
fabricated client events.

Retain bounded security failures and aggregate flood telemetry according to
limits; record suppression windows/counts explicitly, not pretend the stored
security feed exhaustively represents every hostile packet.

## M. Actor attribution and audit privacy

### Actor model

| Actor type | Authoritative reference | Display snapshot / restrictions |
|---|---|---|
| `customer` | Canonical customer ID within tenant | Safe client label/code at event; supplied request ID is not authority |
| `subscriber_owner` | Validated `account_users` identity and role | Role/name snapshot; current ledger reseller type still preserved |
| `subscriber_staff` | Validated staff identity, role/permission | Actual individual, not owner name used for all staff |
| `system` | Controlled job/service identifier | No invented human UUID; record cause/operation |
| `customer_api` | Future credential plus canonical owning client | Customer attribution and credential reference; never secret |
| `provider_api` | Future validated provider/adapter identity | Provider result actor plus initiating customer/order cause |
| `anonymous` | No authenticated identity | Only security outcomes; no financial authority |

Use `actor_type`, stable `actor_ref`, safe `actor_display_snapshot`, and optional
initiating actor/credential/cause. Validate typed references against tenant-owned
records in the server writer/database guard. A polymorphic UUID is not by itself
a foreign-key or tenant guarantee.

Actor references/snapshots in immutable events survive actor disable/deletion.
Do not use `ON DELETE SET NULL` for the authoritative audit identity. Optional
live display lookup is separate from historic attribution. Record known/unknown
legacy attribution explicitly; do not backdate snapshots from today's username.

### Privacy and retention

Store only needed context:

- Server timestamp and recorded timestamp where external occurrence differs.
- Trusted proxy-derived IP, bounded/redacted user-agent or normalized device hint,
  non-secret session/credential reference.
- Server-generated correlation/cause ID.
- Entity references, outcome, allowed changed-field names and safe reason.

Never store passwords, reset/challenge tokens, raw cookie/session tokens, API keys,
authorization headers, raw payment secrets/CVV/card data, uploaded proof blobs,
or complete request bodies. Service IMEI/serial/contact inputs stay in the
protected order snapshot, not duplicated into a broadly visible audit log.
For unknown login identifiers, use a scoped HMAC/digest if correlation is needed,
not plaintext email lists; key rotation/retention must be defined.

Customer views show their own safe event summaries. Internal staff reasons,
network context, risk indicators and other users' failed-login attempts are
staff/security-only unless explicitly safe. Staff access must also be scoped and
permission-controlled.

Initial retention proposal for business approval:

- Financial postings/order charge evidence: legal/accounting retention; no routine
  application purge or casual deletion.
- Financial/account/status audit evidence: align with retained business evidence.
- Raw IP/user-agent authentication context: e.g. 90 days, then privileged retention
  or approved partition purge, based on jurisdiction/security needs.
- Aggregated non-sensitive security outcomes: potentially longer with documented
  purpose; no accidental indefinite personal-data collection.

Retention is not implemented or legally determined here. Separate retention
classes/partitions where necessary. Use a privileged audited retention process,
not update/delete rights in normal APIs. Exceptions/legal holds must be explicit;
never shorten financial-history retention through the security-log policy.

Start with an unpartitioned event table unless volume justifies partitioning.
PostgreSQL partitioning changes uniqueness requirements: a time-partitioned table
cannot simply retain global UUID/event-key uniqueness without including its
partition key or using a separate global identity/deduplication registry. Resolve
that explicitly before adopting partitioned retention.

## N. Customer/reseller UI semantics

### Reseller Financial

Show Available, immutable Account Currency, gross Total Credits/Debits, completed
Total Spent, optional clearly named open/net service charges and Statement.
Show Locked only if reservations operate; show Credit Limit/Used/Available Credit/
Due only if supported and the staff member is authorized.

Keep manual Add/Deduct/Adjust, immutable statement and separate internal versus
customer-visible note fields. Link ledger row to service order/payment/correction
as appropriate. Do not mix deposits with refunds or call every debit spending.

### Reseller Activity

Chronological grouped business/account events with actor, safe summary, date and
business-object link; paginate/filter. Keep legacy records visibly less detailed.
Do not duplicate Statement as another financial table. Security events receive a
separate permissioned filter/later Security view.

### Customer Wallet and Transactions

- Wallet: current Available, Account Currency, spendability explanation and
  current honest reseller-contact funding instructions.
- Transactions: keep immutable **Wallet Statement** behavior. Clarify the title/
  subtitle now; do not claim a payment system exists.
- Human-readable type labels, signed amounts, before/after and safe references.
- No internal notes, staff-only reasons, actor identifiers or sensitive network
  data in customer projections.
- Add Pending Funding/payment receipt links only after real funding exists.
- Future Payment Transactions remain a distinct view/filter from Wallet Statement.

A genuine zero balance says funds are required before ordering. Disabled facility
metrics are omitted, not displayed as invented numeric zeros.

## O. Current Dashboard Due/Credit recommendation

Choose **A: hide Due/Credit entirely** until authoritative debt/credit capabilities
exist. Apply the same feature-truth rule to customer Wallet and reseller Overview/
Financial, not only one Dashboard card.

Do not replace it with another unsupported amount or an empty card. Preserve the
approved surrounding design; layout should close the unused space in the later
UI-only implementation without adding components. A settings/help explanation
may state that credit facilities are not supported, but should not look like an
enabled zero-limit facility.

Similarly omit Locked while no reserve/release workflow exists. If reconciliation
finds nonzero unsupported locked/limit values, surface an authorized operational
incident rather than silently zeroing data or masking an anomaly.

Total Spent should use completed service spend. If retaining the existing net
charge value for operational use, label it **Net Service Charges** explicitly.

Represent unsupported features in a future versioned summary contract using
capability flags and null/absent values, not overloaded zero strings. Never infer
feature enablement from an amount alone.

No Dashboard/UI adjustment is made by this design task.

## P. Proposed domain/table additions

All names below are proposals. Reuse canonical entities and existing money units;
do not create illustrative `wallet_accounts` or `wallet_ledger_entries` replacements.

| Table/domain | Purpose and key fields | Constraints / isolation | Indexes | Mutability / relation |
|---|---|---|---|---|
| `customer_wallets` — reuse | Existing client/currency/available/locked projection | Existing composite key, matching immutable account currency, nonnegative, guarded zero initialization | Existing PK; reconciliation scans by tenant | Projection only through approved posting triggers; no direct editing |
| `customer_wallet_ledger` — reuse/add prospective context | Existing posting facts; optional sequence, source, actor snapshot, correlation, operation/correction reference | Immutable rows, type/direction, scoped idempotency, original charge/refund guards; tenant/client correction FK | Existing statement/idempotency; partial unique tenant/client/sequence; reference/correction indexes | Existing rows untouched; new context immutable after insertion |
| `client_activity_events` — new audit envelope | UUID, tenant, optional identified customer, category/type, subject/object, actor type/ref/snapshot, safe metadata, audience, occurrence/record time, event key, correlation/cause | Composite customer FK without cascade for identified subjects; anonymous subject allowed only registry-approved AUTH failures; typed object/actor tenant validation; unique tenant/event key; append-only | Tenant/customer/time/ID; category/type/time; object ref; correlation; appropriate retention partition keys | Immutable; legacy `public_customer_activity` remains readable; not a client identity |
| `funding_requests` — future | UUID, tenant/client/account currency, requested amount, reviewed approved amount, status, method, proof reference, reviewer/reason, key/hash/timestamps | Tenant/client/currency FK; positive amounts; valid transitions; no balance effect without allocation | Tenant/status/time; client/time; unique tenant/client/key | Request financial intent frozen after submission; controlled review transitions |
| `payment_transactions` — future | UUID, tenant/provider account, verified external or manual receipt ID, gross/fee/net currency/amount, direction/status, source/evidence/timestamps | Authenticated unique receipt identity; positive amounts; explicit fee policy; no cross-tenant allocation; valid transition rules | Unique source-account/transaction/leg; tenant/status/time; source/event lookup | Financial facts fixed when confirmed; append refund/reversal, not edit received amount |
| `payment_allocations` — future | Payment ID, purpose, tenant/client, exact account amount/currency, ledger or receivable target, allocation key | Composite scoped references; unique business allocation; total allocations bounded under payment lock; one wallet posting per wallet allocation | Unique allocation intent and posting; payment/client lookup | Immutable posted allocation; reverse through explicit new records |
| `client_credit_facilities` — future | Tenant/client/account currency, status, limit, validity, approved actor/reason/version | Same account currency; normally one applicable facility; versioned changes; no cash wallet insertion | Active tenant/client facility; approval/version history | Controlled policy versions; Used derived/projection from separate postings |
| `client_receivable_postings` — future | Tenant/client/facility optional, exact amount/direction, order/invoice cause, settlement/reversal allocation, actor/key/time | Immutable; scoped FKs; no duplicate draw/settlement; no negative receivable exposure; exact repayment/refund rules | Client/facility/time; unique cause/idempotency; invoice/order refs | Debt authority; not a second prepaid ledger |
| Invoice/document domain — future | Issued invoice/header/lines, tenant sequence, currency and identity/tax snapshots, order/payment/receivable refs | Atomic numbering; immutable issued values; paid/due derive from allocations; no re-charge | Tenant/number unique; client/date/status; linked business refs | Draft mutable; issued documents corrected by formal reversal/credit document |
| Delivery outbox — later | Event ID, recipient/channel, template/version, retry/delivery key/status | Same-transaction creation; unique event/recipient/purpose; redacted payload | Pending retry/time; delivery key | Delivery state mutable; never financial authority |

For polymorphic audit objects, enforce a registry of target types plus validated
tenant ownership. Do not claim that a generic `reference_id` provides a FK to all
future domains. Add typed constraints/triggers when each domain is approved.

## Q. Future additive migration strategy

Repository latest is **024_service_group_availability.sql**. Any later approved
migrations begin at **025**, after checking then-current repository state.
**No migration 025 is created here.**

Recommended staged approach:

1. Baseline exact reconciliation in an isolated development copy/test database,
   preserving account currencies, balance units, snapshots and row identities.
2. Add nullable prospective ledger context and new audit envelope without rewriting
   immutable ledger/order rows or disabling their guards.
3. Deploy compatible readers/writers only in a separately approved implementation/
   release. Read legacy activity plus new events; emit one sink per operation.
4. Enforce required new metadata after all writers support it; validate constraints
   and indexes using a deployment plan appropriate for live table size.
5. Add funding/payment/invoice/credit domains in separate approved additive slices,
   not all in a Phase 1 audit migration.
6. Compare exact financial totals/snapshots before and after. No automatic account
   currency alignment, legacy FX backfill or migration-generated money.

Historic before-balance is derivable; historic actor names/correlation/causal
sequence may be unknown. Do not fabricate those through a deterministic sort or
today's user lookup. Optional activity imports preserve legacy origin and identify
inferred/unknown metadata; they are not necessary for a unified read view.

Rollback an application reader/writer only while compatibility permits. Do not
drop a posted-money table, remove newly posted ledger data, replay allocations or
roll back the database to erase live transactions. Production backup/migration
procedures require separate approval; nothing is run by this task.

## R. Financial/security invariants

1. Exactly one canonical client identity; no duplicate customer/wallet identity.
2. Wallet and all client financial journals use immutable Account Currency.
3. Registration availability changes do not convert/disable existing money.
4. Prepaid initialization is zero; no fabricated opening balance/credit facility.
5. Every balance-changing action has an immutable posting in the same transaction.
6. Stored projection updates cannot occur through ordinary application balance edits.
7. Positive amount magnitude, exact account units, controlled direction/type.
8. Prepaid Available and Locked cannot be negative or exceed safe numeric bounds.
9. A reservation is not a pending order that was already debited.
10. Browser/API never supplies an authoritative price, currency conversion or actor.
11. Order price/input/service/currency snapshots remain immutable after placement.
12. Placement produces one matching debit; insufficient funds produces neither.
13. Completion/processing does not debit or release money a second time.
14. Rejection and exact original refund commit together; one debit cannot be
    ordinarily refunded twice or beyond its charged amount.
15. No completed-order refund through an arbitrary status jump.
16. Preserve refundable-order headroom when accepting credits.
17. Repeated keys return the same outcome for same intent; different intent conflicts.
18. Composite tenant/client references; no direct-ID cross-tenant ordering/finance.
19. Every manual adjustment has permitted actor, reason, direction and visible/
    internal note separation; corrections append rather than edit/delete.
20. A payment allocation credits its destination at most once; total allocation
    never exceeds its approved allocatable amount.
21. Pending requests, proof uploads and unallocated payments are not spendable funds.
22. Issuing an invoice or acknowledging a payment does not itself create wallet money.
23. Facility limit is authorization, not prepaid deposit; debt and invoice views
    count each economic receivable once.
24. Mixed prepaid/credit refunds restore the original split exactly.
25. Total Spent excludes failed/open orders and unrelated deductions/retail checkout.
26. Financial and activity UI uses consistent snapshots and clearly defined totals.
27. Required business audit facts commit with their mutation and reference its object.
28. Authentication failures do not disappear inside a rolled-back success transaction.
29. Actor/tenant/permission/context are server-resolved; unknown actors stay unknown.
30. Audit data never contains passwords, raw tokens/keys or raw payment secrets.
31. Customer projections do not expose internal notes/security context or another client.
32. Retail/guest checkout, subscriber authentication and provider boundaries remain separate.

Database-role permissions and writer functions should reinforce these invariants.
Existing nested-trigger guards are not permission for arbitrary privileged SQL;
an administrator with bypass rights is outside normal application guarantees.

## S. Concurrency and idempotency design

### Published lock order

Preserve current order paths' client-first serialization. For single-client
mutations: canonical client → command object/request/order → payment/facility if
needed → wallet → availability/policy rows. Existing purchase holds client/wallet
before service availability locks; preserve that path unless a later coordinated
change updates every competing writer.

Do not mix wallet-first and client-first writers. For any future multi-client
operation, lock all involved clients/wallets in deterministic ID order. Publish
and test exact resource order for each new domain rather than claiming one generic
row-lock snippet guarantees no deadlocks.

| Failure/concurrency case | Required strategy |
|---|---|
| Two simultaneous service orders | Same client/wallet row locks serialize balance checks; second sees committed remaining balance; insufficient request rolls back |
| Two staff adjustments | Same locks plus unique keys/hashes; serialize after-balance calculation; no lost update |
| Duplicate payment callback | Authenticate source; unique durable receipt and settlement identity; lock payment/allocation; return/retry original allocation |
| Repeated customer API request | Future credential auth then same canonical purchase/idempotency path; no API-only charge logic |
| Rejection while another wallet action runs | Client/order/wallet locks; exact original refund; adjustment uses latest balance; preserve refund headroom |
| Staff double-click Add Funds | Frontend retains command key until outcome; server unique key and actor/payload comparison; do not generate a key per click |
| Retry after network timeout | Do not assume failure; query/replay same command key; if committed return original order/entry; if rolled back safely execute once |
| Payment approved but wallet insertion fails | Request must not be finalized approved independently; allocation transaction rolls back; durable external receipt remains verified/unallocated for retry |
| Wallet credit succeeds but request update fails | Same DB transaction rolls back credit and projection; if commit succeeded but response lost, replay reads committed allocation |
| Two rejection/completion commands | Lock same client/order; first terminal outcome wins; opposing transition conflicts; no double refund |
| Audit insert fails on financial mutation | Required business event failure rolls back financial mutation; delivery/outbox consumption failure does not undo committed money |
| Failed login needs audit | After failed auth rollback, write bounded security event separately; denial remains denial |
| Read summary races with posting | Single-statement snapshot or repeatable-read reporting; purchase always revalidates under locks |
| Deadlock/serialization failure | Retry complete transaction with same intent/key, bounded backoff; no retry of an isolated ledger INSERT after partial commands |

The application wrapper currently uses plain `BEGIN`. Do not rely on SERIALIZABLE
isolation that has not been configured. Row locks plus scoped uniqueness provide
the current money protection; selected new aggregate invariants may need further
locks or serializable transactions with explicit retries.

Use immutable result identity and normalized hashes. Persist idempotency alongside
the economic record, not only in an expiring Redis/browser cache. A matching
duplicate is not a new audit mutation or payment. No external network call while
holding long-lived financial locks; durable inbox/outbox boundaries handle it.

## T. Recommended implementation slices

These are proposals for separate approval, **not work performed by this task**.

| Slice | Scope | Depends on | Minimum focused acceptance checks |
|---|---|---|---|
| 1 — Truthful vocabulary/reporting | Hide unsupported Due/Credit/Locked, separate completed spend/net/open charges, clarify statement labels, coherent summary reads | This design approval; no money-history rewrite | Pending/processing excluded from Total Spent; completion adds spend without new debit; rejection/refund totals exact; disabled features omitted; retail unchanged |
| 2 — Ledger attribution/reconciliation | Prospective actor/source/correlation/sequence/correction reference; exact before projection; restricted reconciliation reporting | Slice 1; approved additive migration starting at current next number | Old monetary snapshots unchanged; new metadata immutable; two concurrent writers; correction/actor/tenant checks; no fabricated legacy sequence |
| 3 — General client audit baseline | New immutable event envelope, compatible legacy timeline, account/profile/order/financial emitters, safe projection/pagination | Slice 2 for rich financial linkage | Same transaction event/posting; retries emit once; known/unknown actors; cross-tenant deny; internal data absent from customer projection |
| 4 — Login/security activity integration | Success/failure/blocked/logout events and safe session references; retention classification | Slice 3 | Failed events survive auth rollback; successful session/event atomic; logout audited; no secrets; flood handling explicit |
| 5 — Funding/payment operations | Requests, verification/approval, confirmed receipt/allocation, exactly-once wallet credit, reconciliation/receipt | Slices 2–4; staff permission and funding policy approval | Duplicate callback/approval; timeout replay; partial failure; no proof-based spendability; same-currency amounts; no double allocation |
| 6 — Optional invoices/receipts | Issued documents/group billing/allocations; confirmed funding receipts | Slice 5 and approved legal billing rules | Concurrent numbering; immutable issuance; no duplicate service charge; correct payment/due allocations; tenant-safe document access |
| 7 — Optional credit facility | Approved facility/receivable journal, headroom, wallet-first allocation and exact split refund | Slices 2–6; explicit lending approval | No negative prepaid wallet; double draw prevention; repayment allocated once; Due not doubled by invoice; over-limit denied |

Password recovery, 2FA, group pricing/access and customer API are separate approved
feature phases. Their event names are designed here, but their business features
must not be smuggled into an audit-foundation implementation.

### Approval boundary and task completion

Only `docs/BHRU_FINANCIAL_AUDIT_FOUNDATION_SPEC.md` was authored for this task.
Slices 1–3 change the approved financial reporting/UI, ledger attribution,
reconciliation, activity baseline, contracts, focused tests and this specification. Additive
migrations 025/026 create origin/audit metadata without changing existing balances,
currencies, ledger entries or service-order snapshots. No commit, push,
deployment, production access, VPS/Dokploy access, browser test or workflow restart
was performed.
