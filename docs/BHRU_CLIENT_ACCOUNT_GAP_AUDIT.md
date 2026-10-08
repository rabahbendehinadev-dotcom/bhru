# BHRU client-account gap audit versus the DHRU business model

Date: 2026-10-08  
Scope: read-only repository architecture audit; documentation deliverable only.

## A. Executive summary

BHRU has a real, tenant-scoped **prepaid client account** foundation, not merely
a Dashboard mockup. The canonical identity is `public_customer_accounts`.
Customer authentication, reseller client management, manual services, service
orders, account-currency wallets and an immutable statement are implemented.
The most important financial safeguards are already represented in both
application code and PostgreSQL constraints/triggers.

However, BHRU is not yet equivalent to DHRU's mature client-account business
capabilities:

- Client groups exist, but currently classify clients by name only. They do not
  determine prices, discounts, funding limits, verification or service access.
- All eligible active services in a tenant are available to that tenant's
  authenticated clients. Service-group withdrawal is real, but customer/group
  access policy is missing.
- Service prices are subscriber USD catalog prices converted server-side into
  immutable Account Currency. No group or client-specific pricing exists.
- **Due and Credit Limit are explicitly returned as zero.** A visible Due/Credit
  section does not constitute a debt or credit-line system.
- Locked Balance exists structurally, but the current order lifecycle immediately
  debits available funds. It does not reserve funds into locked balance.
- The customer **Transactions page is another view of the wallet ledger**, not a
  separate payment-transaction subsystem.
- Secure cookie sessions and login throttling exist, but password recovery/change,
  customer session management, login-IP history and 2FA do not.
- Customer invoices, payment reconciliation, customer API credentials and
  client-to-client transfers do not exist.

**Recommendation:** extend the existing canonical account, service catalog and
wallet; do not copy DHRU's overloaded columns or create another client identity.
Keep prepaid accounting intact while adding pricing/access, security, payment
records and billing in dependency-aware phases. Treat credit lines as a separate,
explicitly approved financial product, not as negative wallet balances.

### Method and limits

This report compares current source, migrations, route handlers and UI against
the **DHRU capabilities supplied in the request**. An actual DHRU database/schema
dump was not supplied or queried. DHRU is therefore a business-reference model,
not a verified live integration.

No development or production database was queried. No application was executed
for this audit, no regression/security/browser suites were run, and no VPS or
Dokploy was accessed. The report establishes source-level implementation and
gaps; it does not certify production migration application, runtime balances,
penetration resistance, legal invoice compliance or deployed behavior.

The repository contains migrations through **024_service_group_availability.sql**.
An audit limited to 019–023 would incorrectly miss global service-group
enable/disable enforcement. Nothing in this report creates or changes a migration.

### Status and priority definitions

- **COMPLETE:** the stated capability has a concrete model and enforced workflow
  within the existing product scope, not just a label or field.
- **PARTIAL:** some data/workflow exists, but relevant enforcement or functionality
  is incomplete.
- **MISSING:** no implemented client-domain model/workflow was found.
- **EXISTS UNDER DIFFERENT BHRU DESIGN:** the business function exists, but should
  not be modeled as DHRU's corresponding overloaded field.
- **NOT RECOMMENDED / LEGACY:** literal parity would be insecure or inappropriate.
- **P0:** core client-account/business-critical foundation.
- **P1:** important for serious server businesses.
- **P2:** useful advanced functionality.
- **P3:** optional or legacy functionality.

Priority is the importance of the capability or proposed improvement; a COMPLETE
P0 row means preserve it, not that it needs rebuilding. Some commercial
capabilities become P0 only when the relevant business workflow is offered.

### Evidence index

Matrix references below identify inspected source, not hypothetical designs.

| Ref | Repository evidence | What it establishes |
|---|---|---|
| S1 | `lib/db/src/migrations/019_public_customer_auth.sql` | Canonical identity; hashed-password constraint; tenant-bound sessions. |
| S2 | `lib/db/src/migrations/020_public_customer_onboarding.sql` | Profile/contact/consent fields, immutable client code, activity and internal notes; optional customer relation on retail orders. |
| S3 | `lib/db/src/migrations/021_customer_wallet_manual_services.sql` | Client/service groups, shared service catalog, wallets, ledger, service orders, idempotency and financial guards. |
| S4 | `lib/db/src/migrations/022_strict_client_account_currency.sql` | Immutable account currency; matching wallet currency; account-unit snapshots and exact refunds; used-currency protection. |
| S5 | `lib/db/src/migrations/023_customer_registration_currency_availability.sql` | Reseller-controlled new-registration currencies, separate from existing wallet currency usage. |
| S6 | `lib/db/src/migrations/024_service_group_availability.sql` | Globally enabled/disabled service groups. |
| S7 | `artifacts/api-server/src/lib/customer-auth/{service,session,context,challenge}.ts`; `lib/db/src/security.ts`; `artifacts/api-server/src/lib/auth.ts` | Registration/login/logout, tenant resolution, challenges, token hashing/signing, scrypt and database-backed throttling. |
| S8 | `artifacts/api-server/src/lib/customer-auth/{clients,profile,types}.ts`; `artifacts/api-server/src/routes/clients.ts` | Reseller client details, profile validation, block/unblock, notes, activity projection and immutable-field handling. |
| S9 | `artifacts/api-server/src/lib/client-finance/wallet.ts`; `artifacts/api-server/src/lib/platform.ts` | Financial summaries, same-currency manual movements, exact arithmetic, statement, audit helper and PostgreSQL transaction wrapper. |
| S10 | `artifacts/api-server/src/lib/client-finance/{catalog,orders}.ts` | Service eligibility, controlled requirements, server-side account pricing, order/debit/refund transaction logic and snapshots. |
| S11 | `artifacts/api-server/src/routes/{customer-auth,customer-panel,client-finance}.ts`; `artifacts/api-server/src/lib/commerce/data.ts` | Existing customer/reseller APIs, cookie-realm auth, customer mutation CSRF checks and subscriber ownership checks. |
| S12 | `artifacts/api-server/src/lib/customer-auth/{panel-ui,ui,client-header}.ts` | Actual customer pages, read-only Profile/Security, funding instructions and shared client shell. |
| S13 | `artifacts/bhru/src/pages/{client-detail,client-finance,manual-services}.tsx` | Reseller tabs, group assignment, wallet forms and order/service management. |
| S14 | `artifacts/api-server/src/lib/commerce/{checkout,public-script,storefront-money-script}.ts`; migrations for commerce and 020 | Separate retail/guest checkout, order acknowledgment/receipt presentation and historical currency snapshots. |
| S15 | Migration set, schema directory and searches across API libraries/routes | No client invoice, payment-transaction, API-key, credit-transfer or login-history domain found; platform subscription/admin entities are not client equivalents. |

## B. Complete capability comparison matrix

Schema/API/UI impacts describe **recommendations**, not changes made by this audit.
“None” means preserve the existing implementation. Related DHRU fields are grouped
where one coherent BHRU workflow should replace them; no group should be mistaken
for an implemented subsystem merely because its name exists.

| Area | DHRU capability | BHRU current status | Existing BHRU implementation | Gap | Business importance | Recommended BHRU design | Database/schema impact | API impact | UI impact | Priority | Risk if omitted |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Identity | First name, last name, username, email | COMPLETE | S1/S2/S7/S8; scoped identity, validated registration, reseller profile update; email fixed in exposed profile APIs | No core identity gap within current scope | Essential identification | Keep canonical account; separately verify any future email change | None for current workflow | Preserve scoped handlers | Preserve current identity views | P0 | Duplicate identity or unsafe edits break ownership |
| Identity | Company | MISSING | No customer company field in S1/S2/S8; subscriber company is not client company | Business customer identity absent | B2B invoicing/support | Optional customer company and later billing identity | Add nullable profile field or billing-profile relation | Validated profile update | Profile/billing details | P1 | Ambiguous business ownership and invoice recipients |
| Identity | Contact/phone/WhatsApp | PARTIAL | S2/S8; normalized international WhatsApp number and lookup | No ownership verification or contact-channel preferences | Customer contact | Retain normalized number; separate verification evidence | Verification/channel records | Verify/change contact flows | Verification state beside contact | P1 | Unverified number can be mistaken for trusted identity |
| Identity | Address, address2, city, state, zip, country | COMPLETE | S2/S8/S12; address fields and country validation; reseller editable, customer display | Customer self-editing is a separate missing workflow | Fulfillment/profile foundation | Preserve fields; billing snapshots must not reference mutable live address | None for current fields | Preserve validation | Existing Profile; later controlled edit | P1 | Missing address harms delivery/billing |
| Identity | Language | PARTIAL | S2/S8/S12 stores supported preferred language | Stored preference does not provide complete localized client-panel workflow | Usability | Use preference in panel localization with fallback | Usually no new field | Expose effective supported locale | Translate panel, not just a selector | P2 | Preference promises behavior it does not deliver |
| Identity | Timezone | MISSING | Customer profile has no timezone; dates use existing rendering conventions | No customer-local event-time preference | Global operations | IANA timezone; UTC storage and explicit display conversion | Nullable validated preference | Profile/preferences | Timezone selection; localized timestamps | P2 | Misread dates and support disputes |
| Identity | Creation date, registration/terms metadata | COMPLETE | S1/S2/S7; created timestamp and terms acceptance | Versioned terms/consent evidence not present | Account history | Preserve historical creation metadata; version terms if needed | Optional consent history/version | No mutable creation-date API | Read-only metadata | P0 | Rewriting history weakens traceability |
| Identity | Last login timestamp | COMPLETE | S2/S7/S8; successful login writes `last_login_at`, reseller Overview displays it | Does not imply full login history | Support/security | Retain timestamp alongside future event history | None for timestamp | Preserve login update | Keep current Overview | P1 | Support cannot identify recent account use |
| Identity/security | Last login IP, login country | MISSING | Login timestamp/activity exists; IP used for throttling, not persisted as login history | No source/device context | Incident investigation | Retained security events with trusted proxy-derived IP; coarse country optional | Login events/metadata | Capture server-side only | Security history | P1 | Limited compromise investigation |
| Status | Active/blocked user status | COMPLETE | S1/S8; `enabled`; block/unblock API and UI; block deletes customer sessions; session loads require enabled account | No gap for binary status | Core access control | Preserve denial, history and session revocation | None | Preserve enforcement | Existing Block/Unblock | P0 | Blocked clients could transact |
| Status | Block reason, staff note, customer-facing reason | PARTIAL | Internal Notes exists; activity records block/reactivation | No structured reason tied to transition or separate visible reason | Support/fair control | Status transitions with required internal reason and optional customer message | Status-event fields/table | Reasoned status mutation | Block form and historical reason | P1 | Unexplained blocks, weak staff accountability |
| Status | Verification state, mobile verification, registration state | PARTIAL | S7 registration challenge/terms; accounts default enabled; no email/mobile proof | Challenge is anti-abuse, not identity verification; no pending state | Fraud/security | Separate email/phone/identity verification from operational status | Verification challenges/evidence; explicit status | Verify/resend/approve | Verification indicators/tasks | P1 | “Registered” mistaken for “verified” |
| Status | Recharge block | MISSING | Same-currency reseller manual credits exist; no independent funding restriction | Cannot forbid recharge independently of service/account status | Risk control | Explicit funding policy evaluated for funding approval | Policy field/relation | Enforce in future funding workflows | Financial policy control | P1 | Restricted clients still receive approved funds |
| Status | Close account, suspended state | MISSING | Only active/blocked; no closed/suspended lifecycle | No reasoned closure/retention model | Account lifecycle | Soft closure/suspension; no destruction of financial history | Explicit status and transition history | Controlled transitions; session revoke | Distinct close/suspend actions | P1 | Hard deletion or overloaded “blocked” |
| Status | Fraud protection | PARTIAL | S7 throttling/challenge, S3/S4 tenant/money guards | No client risk flags, review state or transaction risk policy | Loss prevention | Risk signals/review separate from login and account status | Risk cases/signals if justified | Review/hold policies | Risk indicators for staff | P1 | Anti-bot controls mistaken for financial fraud detection |
| Status/security | Current online/session state | PARTIAL | S1/S7 live unexpired sessions exist | No last-seen heartbeat or online UI; valid session is not evidence of online presence | Support convenience | Privacy-aware last-seen, never use as authorization | Optional session last-used | Touch/list sessions | Approximate last active, not certain “online” | P2 | Misleading presence claims |
| Currency | Default/account currency | EXISTS UNDER DIFFERENT BHRU DESIGN | S4/S5; immutable `preferred_currency` is Account Currency; registration availability controlled by reseller | Legacy column name can confuse developers | Financial invariant | Keep immutable account currency, not a mutable display preference | None; preserve 022/023 | Reject cross-currency wallet operations | Explicit immutable label | P0 | Mixed currencies and historical corruption |
| Financial | Credit left / available balance | EXISTS UNDER DIFFERENT BHRU DESIGN | S3/S4/S9; nonnegative account-currency wallet with ledger-driven updates | No prepaid core gap | Core ordering | Available means actual prepaid funds, not lending capacity | None | Preserve atomic debit | Existing balance | P0 | Double spend or artificial credit |
| Financial | Credit used / Total Spent | EXISTS UNDER DIFFERENT BHRU DESIGN | S9 net service-order debits minus refunds | Not debt; excludes manual debits and retail purchases | Spend reporting | Preserve clear net service-spend definition | None | Label/scope summaries explicitly | “Service spend” explanation | P0 | Customer debt/spend misinterpretation |
| Financial | Total credits / Total debits | COMPLETE | S9 aggregates ledger directions | Credits include refunds; debits include adjustments/order charges | Statement reconciliation | Keep gross totals and expose category breakdowns if needed | None for totals | Optional breakdown | Financial definitions | P0 | Totals confused with deposits/revenue |
| Financial | Credit in process / locked funds | PARTIAL | S3 wallet `locked_balance`; S9/S12 display | No reserve/release movement types; immediate debit does not use locked funds | Future reservation lifecycle | Implement only with explicit available/locked postings | Reservation model and ledger deltas | Reserve/release/settle | Explain reserved versus charged orders | P1 | Counting debited orders again as locked money |
| Financial | Sell credit limit, credit limit, max debt, due/unpaid | MISSING | S3 `credit_limit` constrained to zero; S9 `due` and `creditLimit` are literal zero | No credit facility, receivable ledger or debt settlement | Essential only for postpaid offering | Separate credit facility/receivables from prepaid wallet | Separate credit/receivable domains; keep wallet nonnegative | Exposure authorizer/settlement | Real Due and Limit only when supported | P1 | Cosmetic zero labels falsely imply lending capability |
| Financial | Max credit / maximum funded balance | PARTIAL | S3/S9 exact numeric ceiling and refundable-order headroom | Safety ceiling is not reseller/group commercial max balance | Funding policy | Explicit approved commercial cap; reserve refund capacity | Group/client funding policy | Funding validation | Cap configuration/explanation | P1 | Technical ceiling mistaken for a business limit |
| Financial | Credit validity/date/expiration | MISSING | Ledger timestamps exist; prepaid money does not expire | No expiring credit lots or expiry policy | Usually promotions only | Do not expire paid cash by default; separate promotional lots | Optional promotional-credit domain | Eligibility/expiry worker only if approved | Transparent expiry statement | P2 | Unlawful/confusing forfeiture of paid balance |
| Financial | Low-credit behavior/notifications | MISSING | Zero-balance instructions and insufficient-balance denial exist | No thresholds or sent notifications | Operational continuity | Per-account thresholds with debounced notification events | Preferences/delivery records | Threshold/configuration and delivery jobs | Low-balance settings | P1 | Orders stop without proactive warning |
| Groups | Assign client to group; Retail/VIP/Reseller/Wholesale | PARTIAL | S3/S11/S13 group creation/assignment; group stores ID, tenant and name | Labels have no commercial policy | Serious reseller segmentation | One tenant-owned client/pricing group; names are labels, not roles | Extend existing group domain, no duplicate identity | Group policy CRUD | Pricing & Group | P1 | VIP/Wholesale names imply benefits that do not exist |
| Groups/pricing | Group-specific service prices | MISSING | S10 only subscriber service USD sell price | Assigned group never participates in quote/purchase | Core negotiated reseller pricing | Group-to-existing-service price rows | Scoped price override table | Authoritative quote/purchase resolver | Group pricing editor | P0 | Cannot safely sell different tiers at negotiated prices |
| Groups/pricing | Group discount; group-level fee | MISSING | No discount/fee resolver found | No precedence, rounding or fee snapshots | Commercial margin control | Explicit price/discount policy; named fee items separate | Policy and snapshot metadata | Shared resolver; fee disclosure | Discount/fee controls | P1 | Ad hoc manual pricing and margin disputes |
| Groups/funding | Group min/max add funds | MISSING | No group policies or customer funding request workflow | Global settings/labels are not group enforcement | Funding operations | Apply limits to funding requests/approvals, not arbitrary ledger refund | Group policy plus funding domain | Validate funding intent and approval | Group funding limits | P1 | Limits bypassed or refunds wrongly blocked |
| Groups/credit | Group max credit / due limits | MISSING | All facilities currently zero; group name only | No inherited debt policy | Postpaid clients | Group defaults with explicitly approved client override | Credit facility/policy | Exposure evaluation | Credit policy controls | P1 | Uncontrolled lending if later bolted on |
| Groups/verification | Group ID-verification requirement | MISSING | No identity-verification policy/evidence | VIP/group eligibility not verified | Risk-sensitive offerings | Effective policy with separate verification case | Group policy/verification case | Gate relevant operations | Verification requirement and review | P1 | Sensitive group granted without approval |
| Access | Global service and service-group enablement | COMPLETE | S6/S10; listings/detail/quotes/purchases check active service and enabled group; purchase locks group | Not per-client authorization | Catalog withdrawal | Preserve hard-deny global gate | None | Preserve checks at purchase, not UI only | Existing service/group enable controls | P0 | Disabled services still purchased |
| Access | Client/group access to IMEI, File, Server/Logs, Remote | MISSING | Shared typed catalog; every authenticated eligible client gets active tenant catalog | No family-specific client policy | VIP/wholesale/security boundaries | One policy system over current service types | Scoped group/client access rules | List/detail/quote/purchase common authorizer | Service Access | P0 | Private services visible/orderable by ordinary clients |
| Access | Specific IMEI/File/Server services and group hiding | MISSING | No service ID or catalog-group client access overrides | No personalized allow/deny | Commercial segmentation | Service/group selectors over existing catalog IDs | Normalized target rules | Same authorizer on every entry path | Explain effective access | P1 | Direct-ID ordering bypasses future list-only restrictions |
| Access | Shop service access / specific Shop services | MISSING | S14 public retail catalog governed by subscriber commerce availability | No per-client retail access policy; retail is not manual services | Optional B2B retail | Keep separate retail product eligibility; reuse policy concepts only if needed | Separate retail access targets if approved | Public/registered storefront policy explicitly scoped | Optional private-store controls | P2 | Accidentally hiding guest retail or mixing order models |
| Pricing | Subscriber base price | COMPLETE | S3/S10 exact USD catalog price; server quote and purchase | No differentiated client price | Core commerce | Preserve shared catalog as baseline | None | Preserve resolver basis | Existing manual service management | P0 | Browser-selected or duplicated prices |
| Pricing | Per-client fixed service price | MISSING | No override tables or lookup | Cannot honor individually negotiated prices | Key wholesale workflow | Client/service fixed-price override with audit | Scoped override rows | Same resolver as group prices | Client pricing exceptions | P1 | Manual order corrections and disputes |
| Pricing | Client discount percentage | MISSING | No discount model | No approved precedence or rounding | Commercial flexibility | Basis points/rational percentage; do not stack implicitly | Discount policy | Server resolver and snapshot | Clear effective-price breakdown | P1 | Inconsistent or compounded discounts |
| Pricing | Currency-specific price / account conversion | PARTIAL | S4/S9/S10 USD catalog to immutable account currency using manual rates | Conversion exists; independent negotiated fixed account-currency price does not | International pricing | Default convert effective USD price; optional fixed price only in that client's immutable currency | Optional explicitly currency-tagged override | Currency checks/one final rounding | Account-currency effective price | P1 | Cross-currency override interpreted incorrectly |
| Pricing | Immutable charged-price snapshot | COMPLETE | S3/S4/S10 source USD, account units, currency snapshot and immutable service/input snapshot | Future pricing/access decision provenance not yet recorded | Financial disputes/refunds | Preserve charge; add resolver-version/policy provenance later | Additive provenance only | Never recalculate historical charge/refund | Historical order explanation | P0 | Live prices/rates alter old refunds |
| Customer API | API enable/key, rotation/revocation, secret handling | MISSING | S11 browser cookie/CSRF APIs exist, not customer API credentials | No machine-to-machine access boundary | Automated client businesses | Separate tenant/customer-scoped hashed API credentials | API credential records | New customer API realm; reuse domain services | API Access | P1 | Reusing browser cookies or plaintext API secrets |
| Customer API | Multiple IP entries/ranges | MISSING | No API IP-policy table | No credential network restrictions | Credential defense | Validated IPv4/IPv6 CIDRs; trusted proxy-derived IP | Scoped credential/network rules | Server enforcement | IP whitelist editor | P1 | Leaked key usable from anywhere |
| Customer API | API usage logs, rate limits, same pricing/wallet rules | MISSING | Login/register throttle exists; no customer credential API | No per-key usage/rate policy | Safe automation | Per-key/client/tenant budgets; shared purchase transaction/idempotency | Usage events/quota policies | One domain authorizer, not API-specific prices | Usage/revoke/error views | P1 | API bypasses limits or causes duplicate wallet charges |
| Security | Secure passwords and session identifiers | COMPLETE | S1/S7; scrypt, random hashed token, tenant/realm HMAC, HttpOnly/SameSite cookie, production Secure, expiry | No core credential-storage gap found in source | Core trust | Preserve realm separation and secret hygiene | None | Preserve auth/CSRF | Existing login/logout | P0 | Credential/session theft or cross-realm acceptance |
| Security | Login history: username, IP, time, user | PARTIAL | S7/S8 successful login action and last-login date | No identifier/IP/outcome/country/session association; failures absent | Incident/support history | Dedicated security-event model referencing canonical client | Security events | Capture success/failure without secrets | Security/login history | P1 | Cannot reconstruct suspicious logins |
| Security | Current login time, session list, individual/all revoke | PARTIAL | S1 session creation/expiry; current logout and block deletes all sessions | No customer list/revoke endpoints, last-used/device metadata | Compromised-device containment | Session inventory with current-device marker; explicit revoke actions | Extend sessions safely | Own-session list/delete/all; audited staff revoke | Security devices/sessions | P1 | Stolen session persists until expiry/block |
| Security | Failed counter / account lockout | PARTIAL | S7 database-backed IP and tenant/login-identifier attempt throttles, 15-minute windows | Counts attempts, not failed-account history; no account lockout policy | Brute-force defense | Prefer adaptive throttling with failure events; avoid easy denial-of-service hard lockouts | Security events; optional risk state | Adaptive limiter; canonical identity correlation | Safe generic messages | P1 | No investigative failures and alias-sensitive limits |
| Security | Password change/reset, password-last-changed | MISSING | S12 says contact reseller; no customer or reseller client-password mutation found | UI advice is not a functioning recovery mechanism | Core account recovery | Reauthenticated password change; expiring one-use hashed reset token; session revocation | Reset challenges, password timestamp/events | Change/request/consume reset | Actual Security/recovery flows | P0 | Locked-out clients; unsafe informal support resets |
| Security | 2FA and trusted devices | MISSING | Password-only login; no second factor/device trust | No high-risk secondary verification | Money/API protection | TOTP or passkeys; hashed recovery codes; optional expiring device grants | Factors/recovery/device records | Challenge/enroll/revoke | Security enrollment | P1 | Password compromise grants account access |
| Security | Security questions, master PIN | NOT RECOMMENDED / LEGACY | Not implemented | Literal parity is undesirable | Modern replacement preferred | Passkeys/TOTP and auditable step-up, not shared override PIN | No weak-secret fields | No master bypass | No security-question UI | P3 | Weak secrets or universal account bypass |
| Statement | Credit/debit, amount, resulting balance, date | COMPLETE | S3/S4/S9 immutable ledger; exact integer-valued units and snapshots | No gap for current immediate-debit prepaid ledger | Financial truth | Preserve append-only statement | None | Scoped statement queries | Existing Wallet/Transactions | P0 | Unreconciled or editable money history |
| Statement | Relation/order ID and service family | PARTIAL | S3/S9 order relation/type and original debit/refund link; family on service order | Statement projection does not directly show joined service family | Investigation/reporting | Derive family through protected order relation, no duplicated authority | Optional denormalized immutable label only if needed | Enriched projection | Family/reference filter/link | P1 | Harder statement-to-order investigation |
| Statement | Admin note, user note, IP, transfer fee | PARTIAL | S9 internal note and customer-visible description; actor/date/reference | No movement IP/context, separate transfer fee or distinct user-note column | Accountability | Explicit visible description/internal reason; event IP; fee lines only with transfer domain | Event metadata; optional fee postings | Visibility-safe projections | Internal versus visible labels | P1 | Confidential staff text exposed or fees unaudited |
| Payments | Gateway, transaction ID, amount in/out, fee, rate, refund, invoice relation | PARTIAL | S9 manual ledger `method`/reference; S14 retail order acknowledgment | No independent payment status, provider transaction, settlement/reconciliation or payment refund model | Real funding operations | Payment transactions plus allocations to ledger/receivables/invoices | Payment/payment-allocation records | Approve/settle/reconcile with idempotency | Transactions/funding operations | P0 | Payment evidence confused with settled wallet money |
| Invoices | Number, subtotal, credit, tax, total, status, method, dates, received amount, items | MISSING | S15; no client invoice subsystem; platform subscription is a different domain | No professional client billing documents | B2B accounting/compliance | Immutable issued header/items with payment allocations and currency/customer snapshots | Invoice/line/sequence/allocation records | Draft/issue/void/read; no edits to issued money | Invoices | P1 | Missing billing evidence and incorrect taxes |
| Receipts | Funding/payment proof, paid/due, service invoice, printable/downloadable | PARTIAL | S14 checkout receipt/acknowledgment; S12 explicitly no online client funding | Retail acknowledgment is not a funding receipt or issued client invoice | Customer trust/accounting | Receipts from confirmed payments; invoices from explicit billable events | Receipt/document relation, not second ledger | Render/download; access checks | Funding receipt/order billing links | P1 | Order acknowledgment incorrectly proves payment |
| Activity | Login, logout, profile, password, wallet, order/status/refund, block, API/session actions | PARTIAL | S2/S3/S7–S10 action/date/optional staff actor; several success events exist | Logout not logged; password/API/revoke absent; no context/entity metadata; capped 50-entry reseller view | Operational audit | One append-only event stream with typed entities and safe projections | Extend event model/retention | Atomic event emitters and pagination | Searchable Activity; separate Security view | P0 | Actions cannot be attributed/reconstructed |
| Preferences | Newsletter | PARTIAL | S2/S8 opt-in storage and UI | No consent-version/delivery/unsubscribe workflow found | Marketing consent | Purpose-specific consent history and unsubscribe | Consent/delivery metadata | Own consent update/unsubscribe | Preferences | P2 | Stored checkbox mistaken for compliant messaging |
| Preferences | Credit/invoice/activity/order SMS/price-change notifications | MISSING | Announcements reuse CMS current messages, not personal notifications | No event subscriptions or delivery subsystem | Proactive operations | Per-channel preferences plus outbox/delivery; mandatory security alerts distinguished | Preference/outbox/delivery records | Preferences/event jobs | Notification settings/history | P1 | Missed order, balance or security changes |
| Profile | Customer self-service editable fields | PARTIAL | S8 reseller updates; S12 customer Profile is read-only | No customer profile/preferences mutation routes | Usability/support | Limited self-edit fields; reverify sensitive contact; immutable currency/code | Usually existing fields; verification records | Own-profile PATCH with allowlist | Profile edit | P1 | Unnecessary staff edits or unsafe unrestricted updates |
| Reseller relation | Canonical customer owned by reseller | COMPLETE | Tenant FK and all inspected owner/customer queries; composite financial/order FKs | Not a multilevel reseller credit network | Core isolation | Preserve subscriber as tenant owner | None | No client-selected tenant authority | Current client detail | P0 | Cross-tenant access |
| Transfers | Credit-transfer enablement, credit-reseller relation, fees | MISSING | No transfer type/routes/relations | No controlled peer movement | Optional high-risk functionality | Omit until justified; same-tenant, same-currency, approved group policy | Transfer entity plus paired postings/fee | Two-wallet atomic/idempotent operation | Opt-in transfer UI | P2 | Double spending, cross-tenant or unintended FX |
| Notes | Internal/client-visible/financial/order-specific notes | PARTIAL | S2/S8 reseller notes; S9 visible description/internal ledger note; S10 order result/reason/internal note | General Notes has no audience/edit/version model or customer-visible channel | Support confidentiality | Keep note domains distinct; explicit audiences and append/version history | Audience/version only if visible general notes needed | Scoped author/audience controls | Clearly labeled internal Notes; visible order result | P1 | Private support notes leak to clients |
| Affiliate | Affiliate state, balance, visitors/signup, payout settings | MISSING | No client affiliate subsystem found | Optional commercial program absent | Not foundation | Separate affiliate earnings/payout domain; do not overload wallet | Affiliate/referral/commission/payout tables only if approved | Separate program APIs | Optional separate area | P3 | Building it early distracts from core client controls |

## C. Top missing P0 capabilities and safeguards

The existing prepaid transaction core is not marked missing. Its locks, exact
account-currency charges, immutable ledger, idempotency and refunds must remain.

1. **Usable password change and recovery.** “Contact reseller” is currently
   guidance, not an implemented password-reset workflow. Add a secure recovery
   mechanism before scaling customer accounts.
2. **Authoritative differentiated service pricing**, when VIP/reseller/wholesale
   pricing is offered. Named client groups alone do not meet this requirement.
3. **An effective service-access authorizer**, when services are marketed as
   private/VIP/restricted. Enforce the same decision on listing, direct detail,
   quote and purchase; never rely on hidden UI items.
4. **Complete, attributable operational audit events.** The immutable financial
   ledger is strong, but client Activity is a limited success-event feed, not a
   complete security/operational history.
5. **Separate funding/payment records and exactly-once allocation**, when the
   business starts accepting/approving customer funding requests. Manual wallet
   adjustments alone do not prove a payment was received.
6. **Honest financial semantics before offering credit.** Current Due/Limit zero
   values must not imply a credit line. Building lending is P1/conditional;
   preventing misrepresentation and preserving prepaid funds is P0.

For a strictly manual prepaid business, not all commercial extensions are release
blockers today. Pricing/access become business-critical with tiered/private
offerings; payment records become business-critical with a funding workflow.

## D. Important P1 capabilities

- Structured status reasons; suspension/closure; verification independent of
  operational status.
- Login/security history, session inventory/revocation, 2FA/step-up.
- Group commercial policies and client-specific price/access exceptions.
- Funding reconciliation, receipts and client invoices.
- Personal order/balance/security notifications with reliable delivery.
- Client self-service profile/preferences with sensitive-field verification.
- Customer API access only after it can reuse all commercial/financial policies.
- Fine-grained staff permissions for financial approval, pricing, blocking,
  security intervention and invoice issuance. The inspected owner APIs scope by
  subscriber identity; that is not a cashier/support/auditor permission model.

## E. Useful P2/P3 and legacy exclusions

- Timezone selection and complete customer-panel localization.
- Approximate online/last-active indicators, after privacy/retention decisions.
- Promotional credit expiration, never automatic expiry of paid wallet funds.
- Credit transfers only after accounting, fraud and group policies are mature.
- Optional private retail storefront policy, separately from manual services.
- Affiliate/referral/payout program as an independent later domain.
- Do not recreate security questions, plaintext keys/passwords or a master PIN.
- Do not store raw card data or CVV. Use payment-provider token/reference records
  if a provider is introduced in a separately approved phase.

## F. Recommended future client-account architecture

### 1. Canonical identity and profile

Keep `public_customer_accounts` as the one client identity. Extend it or attach
tenant-scoped profile/preferences/verification records, not a parallel
`customers`, `clients` or API-user table with duplicated passwords/wallets.

Editable customer fields should be a narrow allowlist: names, company, address,
language/timezone, newsletter and channel preferences. Phone/contact changes
should invalidate corresponding verification. Reseller username edits already
exist; treat future customer username edits as audited identity changes with
uniqueness protection.

Keep Account Currency and Client Code immutable. Keep original registration and
terms timestamps historical. Email is currently fixed in exposed client APIs;
any future email-change process needs reauthentication, proof of the new address,
notification to the old address and session/security policy, not a generic PATCH.

### 2. Groups: classification is not yet pricing

Current `reseller_client_groups` has `id`, `subscriber_id`, `name`.
`public_customer_accounts.client_group_id` links the client to a group with a
tenant-scoped FK. Creation, listing, assignment and removal are real UI/API
workflows. Retail/VIP/Reseller/Wholesale can be names today, but they have no
inherited behavior.

Recommended additions:

- Extend the existing group domain with explicit commercial/verification defaults.
- Store service price overrides in group-to-`manual_services` rows.
- Store access rules independently of prices.
- Store funding min/max and max-funded-balance as policy, separate from numerical
  safety ceilings or future credit/debt limits.
- An assigned pricing group does not make the customer a subscriber owner or
  tenant administrator. “Reseller” as a commercial tier is not an auth role.
- Client policy exceptions inherit group defaults unless explicitly overridden.
  Record author/reason/change history; do not mutate historical charged orders.

No new service catalog is needed. Manual services now and provider-populated
services later must pass through the same BHRU service identity.

### 3. Financial meanings and authoritative model

| Concept | Current BHRU behavior | Recommended authoritative meaning |
|---|---|---|
| Available Balance | Nonnegative prepaid wallet funds in immutable Account Currency | Spendable settled prepaid funds, excluding reservations |
| Locked Balance | Stored/displayed; current order placement does not increase it | Prepaid funds reserved by a separate, auditable reservation lifecycle, if introduced |
| Due | Hardcoded zero in summary and client projection | Outstanding receivable debt, never a relabeled wallet debit or pending order total |
| Credit Limit | DB constrained to zero; API literal zero | Approved maximum credit exposure from a credit facility, not additional prepaid cash |
| Total Spent | Order-debit amounts minus order-refund amounts | Net charged service spend; rejected/refunded charges do not remain spent |
| Total Credits | All credit-direction ledger entries, including refunds/adjustments | Gross wallet credits; deposits require a separate filtered measure |
| Total Debits | All debit-direction ledger entries | Gross wallet debits; not identical to spend or debt |

The money storage is **integer-valued `numeric(24,0)` at a fixed 12-decimal
account-unit scale**, with `BigInt` arithmetic. It is not ordinary two-decimal
integer cents, and it is not binary floating-point money. Keep this existing
representation and exact historical values; do not casually rescale it.

New manual funding is recorded in Account Currency without funding FX. Only
catalog pricing converts the USD source price into account units using the
subscriber's manual currency rate, rounded once to account minor precision.
Existing accounts/wallet history remain in their original accounting currency.

Current purchase transaction:

1. Resolve customer from authenticated tenant context.
2. Lock/check the canonical client and lock the wallet.
3. Resolve an active service and enabled catalog group; lock service/group
   availability for the purchase.
4. Compute account-currency charge server-side; expected browser quote values
   detect changes but do not authorize the price.
5. Reject insufficient balance.
6. Insert immutable service/order/currency/input snapshots and a matching debit.
7. Commit both through the shared PostgreSQL transaction wrapper.

The ledger insertion drives the guarded wallet update. Scoped idempotency keys
plus request hashes prevent retry duplication. Rejection locks the same client,
order and wallet, references the original debit, and credits the exact original
account amount/currency snapshot; unique refund constraints prevent double refunds.
Completion does not charge again.

Current allowed service transitions:

- `pending → processing`, `pending → completed`, `pending → rejected`
- `processing → completed`, `processing → rejected`

`cancelled` exists in the stored status vocabulary/filter, but there is no normal
implemented cancellation transition. It should not be advertised as a customer
cancellation/refund capability.

#### Optional future credit line

Do not turn `available_balance` negative or increase it simply because a credit
limit was approved. Use a separate facility with effective limit, approval,
currency, expiry and debt/receivable postings.

For a future mixed-funding order, persist the allocation of prepaid funds versus
credit draw. Rejection must restore the prepaid allocation and reverse the
corresponding credit draw, not credit the whole charge into the cash wallet.
Exposure checks and allocations need a single transaction with consistent locks.

Financial caps have distinct meanings:

- Technical storage/safety ceiling: existing bound plus refundable-order headroom.
- Max funded balance: commercial funding policy.
- Credit limit/max debt: approved outstanding credit exposure.
- Group funding min/max: amount of an individual funding request.
- Credit facility expiry: stops new borrowing, not automatic erasure of debt.
- Promotional-credit expiry: separate from paid cash.

### 4. Service access: explicit precedence

Current eligibility is tenant ownership + active service + enabled service group.
Client group membership currently has no effect.

Recommended authorizer:

1. Tenant/site/subscription eligibility and authenticated account status are
   absolute gates. No group/client allow can bypass them.
2. Inactive service or disabled catalog group is an absolute deny.
3. Resolve pricing-group access defaults for family, catalog group and service.
4. Resolve client-specific overrides for the same targets.
5. Use a documented specificity rule: service ID > catalog group > service family
   > general default; at equal scope/specificity, deny beats allow.
6. Client overrides replace group policy at the corresponding scope; any inherited
   family/group prohibition intended to be non-overridable must be explicitly
   marked as a hard restriction.

This prevents ambiguous “deny always wins” rules that accidentally make all client
exceptions impossible. Define hard restrictions separately and show the effective
decision/reason to reseller staff.

Return a generic unavailable response to customers for denied services. Apply the
same authorizer to browsing, direct IDs, quote, purchase and future customer APIs.
Policy withdrawal must be rechecked at purchase, just as global group availability
is currently rechecked. A stale quote is not authorization.

Shop/retail policy remains separate. Public guest retail cannot silently become a
private service catalog when introducing customer service-access controls.

### 5. Pricing: one authoritative resolver

Current inputs are subscriber catalog USD price and account-currency rate.
Neither `client_group_id` nor a customer discount changes the current quote.

Recommended price selection:

1. Eligible client-specific service fixed price.
2. Eligible group-specific service fixed price.
3. Applicable client/group discount policy against the subscriber service base.
4. Subscriber service sell price.

Missing override means fallback; invalid/mismatched-currency override must fail
explicitly, not silently select a cheaper fallback. Do not invent provider cost
as a customer-price fallback. Avoid implicitly stacking discounts; define which
policy wins and validate allowed bounds.

Keep overrides USD-based initially to match the shared catalog. Convert the chosen
price once to immutable Account Currency. If negotiated fixed account-currency
prices are later required, store an explicit currency tag and require it to match
the account; never reinterpret the same number in a different currency.

Quote/purchase/browser/API must use one resolver. Snapshot selected price source,
policy/version, discount/fee facts, source price, account charge and currency/rate.
Historical order display and refunds read snapshots, never current policies.

### 6. Customer API, not provider API

The existing `/api/public/customer/:slug/...` browser routes use customer cookies
and same-origin mutation checks. They are not an API-key customer product.

Recommended separate API credential realm:

- Customer API toggle separate from browser login.
- Multiple revocable credentials with label, scope, creation/expiry/last-use.
- Cryptographically random secret shown once; store only a keyed hash/digest and
  non-secret lookup prefix. Never echo secrets in usage logs.
- Rotation creates a replacement credential with explicit old-key revoke/overlap
  policy. Blocking/closing a client must deny all credentials.
- Tenant/customer-scoped IPv4/IPv6 CIDR entries; validated trusted proxy IP.
- Per-key, per-client and per-tenant rate/usage limits and abuse signals.
- Sanitized usage logs: endpoint, response class, request/correlation ID,
  duration, customer/credential reference; redact service inputs and credentials.
- Same access/pricing/quote/account-currency/wallet transaction and idempotency
  rules as the browser. No second purchase/refund implementation.

Provider API integrations are a different boundary and are not proposed as part
of customer API access.

### 7. Security, sessions and verification

Preserve current scrypt hashing, random hashed session token, tenant/realm binding,
cookie protections, expiry, generic invalid-login responses and CSRF checks.
Registration challenge proves challenge completion, not email, phone or ID.

Current throttling is database-backed: 60 login attempts per IP and 10 per
tenant/submitted login identifier in a 15-minute window; registration also has IP
and tenant/IP budgets. The counter is not a persisted failed-login counter on the
canonical account. Multiple permitted identifier aliases should be considered
when designing adaptive per-account throttling.

Add security events and session metadata without storing raw session tokens:
successful/failed login, logout, password change/reset, factor changes, session
revocation and credential lifecycle. Store sanitized IP/user-agent context with
retention rules; geolocation is optional, not authentication proof.

Support own-session inventory, individual revoke and all-other/all-session revoke.
Do not equate an unexpired session with active online presence.

Use an explicit account status machine such as active, suspended, blocked, closed.
Keep verification status separate: pending/verified/rejected with evidence and
review history. “Pending Verification” can be a UI view over these states rather
than duplicating conflicting account flags.

Blocking currently deletes customer sessions and leaves reseller history
accessible. Future block/close transitions must also deny/revoke API credentials
and factor/device grants as appropriate. Preserve historical orders/ledger/notes;
do not solve account closure through deletion.

### 8. Statement, payment, invoice and orders are different domains

| Domain | Authority and boundary |
|---|---|
| Wallet statement | Immutable financial postings and resulting prepaid balances; no pending external payment invented as settled credit |
| Payment transaction | Received/sent funds, pending/settled/failed/refunded state, method/provider/reference, gross/fee/net and allocations |
| Invoice | Billing document with issued immutable customer/currency/line/tax totals; payments allocated separately |
| Service order | Manual service fulfillment and immutable charged-price/input/result snapshots |
| Retail order | Product checkout/fulfillment; independent economics and optional canonical registered-customer link; guests remain guests |

Current Wallet and Transactions both call `/panel/statement`, so they differ in
presentation, not financial domain. Adding a real Transactions view must retain
the ledger as authoritative statement rather than migrate statement rows into a
payment table.

A payment can fund a wallet or settle a receivable/invoice; its allocation must be
explicit, auditable and idempotent. An invoice does not credit a wallet. Issuing an
invoice for an already-debited prepaid service must not debit again. A payment
refund and a service-order refund are not automatically the same operation.

Retail checkout currently returns an order receipt/acknowledgment with historical
currency data. This does not establish a paid client invoice or wallet-funding
receipt. Do not blindly reuse retail totals, service USD basis or platform
subscription billing as client invoice authority.

#### Professional client invoices and receipts

An invoice needs a tenant-controlled numbering sequence allocated atomically on
issuance; uniqueness must survive concurrent issuance and retries. Choose the
legal numbering/tax/cancellation rules before implementation. Persist issued
seller/customer billing identity, line descriptions/quantities/prices, subtotal,
discount or applied credit, tax and total in the invoice's currency snapshot.
An applied prepaid amount or credit note is not a new credit facility.

Represent draft, issued/open, partially paid, paid and void/credited outcomes with
explicit validated transitions. Derive amount paid and amount due from auditable
payment/credit allocations, not an editable paid checkbox. Preserve due/paid dates,
payment references and the issued document; corrections require appropriate
credit/void documents rather than rewriting historical totals.

An invoice's amount due and a client's credit-facility exposure are related only
through explicit receivable/allocation rules. They must not be added twice in a
client Due summary.

Separate uploaded payment proof from confirmed payment receipt. A proof awaits
review and is not spendable balance. A wallet-funding receipt references the
confirmed payment and its wallet-credit allocation. A service-order invoice
references the already-recorded charge without charging the order a second time.
Provide scoped printable/downloadable documents and retain their original
account-currency presentation. Guest retail documents must remain available
through their own authorized receipt mechanism, not a fabricated client identity.

### 9. Client Activity and note visibility

Current activity covers registration, successful login, reseller profile updates,
block/reactivation, note additions, manual funds/adjustments, group assignment,
service placement, processing, completion and refund. Logout is not recorded.
Password/API/session-revoke events have no implemented workflow to emit them.

The table has action/time/customer/tenant and optional staff actor. Reseller
detail fetches the newest 50 rows and returns action/time, omitting actor
information even where stored. There is no dedicated immutable Activity trigger
equivalent to the wallet ledger, typed entity reference, structured metadata,
correlation or complete paginated investigation workflow.

Recommend append-only business/security events emitted transactionally with their
mutations. A transactional outbox handles asynchronous notifications; it is not
the immutable financial ledger. Preserve actor, affected entity, reason and
safe before/after metadata; redact credentials and unnecessary personal data.

General reseller Notes are internal. Customer projections do not expose ledger
internal notes or service-order internal notes. Service completion result and
rejection reason are customer-visible; wallet descriptions are customer-visible.
The current wallet description uses customer note when supplied, otherwise the
reason. Staff must not assume the reason is always confidential.

Recommended note domains:

- Internal client support note: staff-only, author/time, append or version history.
- Customer-visible client message: explicit audience/delivery, if separately built.
- Financial note: immutable visible description and separate internal reason
  attached to the financial action.
- Order note: internal handling note separate from visible result/rejection reason.

### 10. Credit transfer recommendation

Omit peer transfers from the immediate roadmap. They are not necessary for the
existing manual prepaid flow and substantially increase financial abuse risk.

If demand justifies them, require reseller enablement, same tenant, same immutable
Account Currency, active/eligible sender and recipient, group permissions,
limits/fees and an explicit transfer entity. Lock both wallets in deterministic
order, create exact paired debit/credit postings and fee posting atomically, and
make retries/refunds reference the original transfer. No cross-tenant or implicit
FX transfer. A transfer is not an editable `credit_reseller` column.

## G. Recommended table/domain additions

These are conceptual domains, **not migration SQL or approved implementation**.
Use existing group/account/service IDs and composite tenant FKs. New tables need
indexes, ownership checks, retention and audit policies appropriate to each
domain. Existing application tenant checks/composite FKs do not by themselves
constitute database row-level security; RLS can be a later defense-in-depth choice.

| Domain | Suggested addition | Existing domain to reuse | Key invariants |
|---|---|---|---|
| Group commercial policy | Extend existing group or attach group policy | `reseller_client_groups` | Tenant ownership; classifications never grant owner/admin role |
| Service pricing | Group-service and client-service price overrides; versioned policy | `manual_services`, canonical client | Currency/basis explicit; same resolver; historical price snapshots unchanged |
| Service access | Group/client rules by family/group/service, explicit hard-deny policy | Manual service IDs/groups | One deterministic authorizer; no bypass on direct-ID/API ordering |
| Preferences/profile | Optional company/timezone; channel preference records | Existing canonical profile | Narrow edit allowlist; currency/code stay immutable |
| Account status | Status transition history and reasons | Canonical client's current active control | Soft closure; revoke access; preserve financial history |
| Verification | Contact challenges, verified proofs and review cases | Canonical client | Expiring hashed challenge; not equivalent to account status |
| Security | Security events; session last-used/device metadata; reset challenges/factors | Existing sessions and scrypt identity | Never raw tokens/passwords; owned revoke; reauthentication |
| Operational audit | Rich append-only events plus transactional outbox | `public_customer_activity` | Event committed with mutation; redacted metadata; actor/entity refs |
| Funding | Funding request and review history | Wallet/ledger | No credit until approved settlement; original currency and idempotency |
| Payments | Payment transaction, allocations, settlement/refund references | Existing wallet ledger and future invoices | Pending funds excluded; gross/fee/net explicit; exactly-once allocation |
| Billing | Invoice, immutable issued lines/snapshots, sequences, allocations, receipts | Service/retail order references and canonical billing identity | No duplicate order charge; issuance concurrency; lawful numbering/tax policy |
| Credit facilities | Credit facility, receivable/draw/settlement records | Canonical client/order/account currency | Wallet remains prepaid/nonnegative; mixed allocation reversible exactly |
| Customer API | Hashed credentials, CIDR rules, usage events, scopes | Canonical client plus shared order/wallet services | Revocation/status enforcement; rate limits; no provider schema dependency |
| Notifications | Preferences/outbox/delivery attempts | Domain events and current CMS announcements | Idempotent delivery; consent; security alerts distinguished |
| Optional transfers | Transfer entity and linked balanced postings/fee | Existing immutable ledger | Deterministic two-wallet locks; same tenant/currency; no double posting |
| Optional affiliates | Referral, commission, payout domains | Canonical identity reference only | Separate earned commission liability; no invented wallet cash |

The next repository migration number would be chosen after checking then-current
state. Existing 019–024 must not be edited to add these future features.

## H. Recommended reseller client-detail UI/tabs

Current tabs are **Overview, Financial, Profile, Orders, Activity, Notes**.
Profile already includes client-group assignment. Financial provides real wallet
mutations/statement; Orders displays service and registered retail histories
separately. These are useful existing workflows, not placeholders to discard.

Recommended mature organization:

| Section | Purpose | When justified |
|---|---|---|
| Overview | Identity/status, group, verification, balance, recent operational indicators | Retain now |
| Financial | Prepaid balances, statement, permitted adjustments; separate optional credit exposure | Retain; extend only with approved accounting model |
| Pricing & Group | Effective group, price policies and client exceptions | After real pricing policies exist |
| Service Access | Effective permissions and explainable overrides | After common access authorizer exists |
| Orders | Service orders; separate retail subview and links | Retain separation now |
| Transactions | Funding/payment states, evidence, allocations and reconciliation | Only after real payment domain |
| Invoices | Issued/draft/void billing records and allocations | Only after billing domain |
| API Access | Enablement, scoped credential management, IP policy and usage | Only after customer API realm |
| Security | Verification, login/session history, factors and permitted support actions | After real security workflows |
| Activity | Paginated attributable operational history, not merely raw action labels | Extend current tab |
| Profile | Editable contact/company/address/preferences; immutable identifiers separately | Retain and extend carefully |
| Notes | Clearly internal support notes; visible communication separate | Retain |

Avoid a dozen empty tabs today. Add sections as their backend workflow becomes
real. Payment status belongs in Transactions, not Financial adjustment notes;
password/security intervention does not belong in unrestricted Profile editing.

## I. Recommended customer-panel additions

Preserve current Dashboard, Services, Orders, Wallet, Transactions, Announcements,
Profile and Security, shared reseller Top Area/navigation and tenant-specific
public-site entry paths.

1. Security: real password change/recovery, sessions/revoke, login history and
   optional factor enrollment.
2. Profile: limited self-edit contact/address/preferences with verification.
3. Services: automatically apply effective pricing/access; customers never set
   their own group, price, account currency or access tier.
4. Wallet: real funding requests and confirmed payment receipts only after backend
   approval/settlement exists; keep current honest reseller-contact instructions
   until then.
5. Transactions: distinguish payment transactions from Statement. Preserve
   statement access and never call an unverified funding proof settled money.
6. Invoices: billing documents and paid/due allocations when implemented.
7. API Access: opt-in credentials/IP settings and safe usage visibility.
8. Preferences: notifications/language/timezone, without duplicating CMS announcements.
9. Credit exposure only for explicitly approved credit clients; show prepaid
   balance and receivable Due as distinct quantities.

No fabricated values, fake payment buttons, archive dates or empty module promises.

## J. Dependency-aware suggested implementation phases

These are recommendations only; no implementation tasks or migrations were created.

| Phase | Scope | Dependencies | Acceptance boundary |
|---|---|---|---|
| A — Semantic and audit baseline | Document/label prepaid versus Due/Limit/Locked; richer immutable operational events; staff permission boundary; reconciliation specification | Current 021–024 invariants | No change to historical money; clear domains; events attributable and redacted |
| B — Customer security and lifecycle | Password change/reset, session inventory/revoke, login events, explicit status/reasons, contact verification; 2FA/step-up increment | A; reliable verification delivery method | No insecure support reset; blocking revokes access; history retained |
| C — Commercial groups and pricing | Existing group policies, group/client prices and one server resolver; provenance snapshots | A; preserve Account Currency | Quote/purchase consistency; no catalog duplication; immutable historical charge |
| D — Service access policy | Family/group/service permissions and client overrides; same authorizer across entry paths | A; existing global gates; C for shared effective-policy UX | Direct-ID/API paths cannot bypass restrictions; deterministic precedence |
| E — Funding and payments | Funding requests, manual approval/settlement, payment transactions, idempotent ledger allocations, payment receipts and reconciliation | A/B; staff financial permissions; current exact wallet | Pending requests do not credit money; settlement posted once; refunds auditable |
| F — Client billing | Invoice numbering/lines/tax/currency/customer snapshots; issued-document immutability; payment allocations and rendering | E for payment status; existing order snapshots | No second wallet debit; retail/service boundaries explicit; legal policy approved |
| G — Optional credit/Due product | Facilities, exposure limits, receivables, mixed-funding allocations and debt settlement | A/B/C/E/F; explicit business approval | No negative cash wallet; exact split refunds; no double settlement |
| H — Customer API | Scoped hashed credentials, CIDRs, usage/rate controls and shared order domain | B/C/D; A audit; G only if credit clients allowed over API | Same pricing/access/account-currency/idempotency as browser |
| I — Preferences and notifications | Personal order/balance/security/invoice alerts, localization/timezone and delivery history | A outbox; B security; relevant order/payment events | Consent-aware, debounced and idempotent; no CMS content duplication |
| J — Optional advanced commerce | Transfers, promotional credit or affiliates as separate approved domains | A/B/E; mature policy/accounting; G only where applicable | Same-currency scoped atomic transfers; paid money not silently expired |

Phases C and D can share policy infrastructure, but prices and permissions remain
distinct decisions. Basic security alerts should accompany B rather than wait
for the full notification phase. Billing can precede any optional credit product.
Provider automation remains separate and must eventually populate/operate the
existing BHRU service/order model rather than replace customer-account accounting.

### Top ten gaps, ranked for roadmap planning

1. **Group/client differentiated service pricing** — group labels currently do not affect prices.
2. **Per-client/group service access** — only global catalog eligibility exists.
3. **Password change and secure recovery** — no functioning client password-management workflow.
4. **Login/security history, session management and 2FA** — basic secure sessions exist, advanced containment does not.
5. **Authoritative Due/credit exposure** — zero displays are not debt accounting; lending is conditional, not required for prepaid safety.
6. **Funding requests and real payment transactions/reconciliation** — manual ledger credit is not a payment subsystem.
7. **Verification and richer status/reasons** — active/blocked is real, verified/suspended/closed/funding restrictions are not.
8. **Complete attributable client activity** — limited event coverage/projection and no rich immutable event model.
9. **Client invoices and confirmed payment/funding receipts** — retail acknowledgment is not client billing.
10. **Personal notification preferences and delivery** — newsletter storage/current CMS messages do not provide transactional alerts.

Customer API is also an important P1 capability, but should follow pricing/access,
security and audit foundations rather than precede them. The list is a business
gap ranking, not a claim that ten independent defects currently corrupt prepaid
orders.

### Audit completion and change boundary

Only this Markdown report was authored for this request. No application source,
schema, migration or data changes were made. No commit, push, deployment, workflow
restart or VPS/Dokploy access was performed.
