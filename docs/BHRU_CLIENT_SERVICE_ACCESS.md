# BHRU client/group service access — Slice 6B

## Boundary and compatibility

This is authorization for the existing manual service catalog, not a second
catalog, customer identity, pricing engine, group system, or public CMS.
Subjects are `public_customer_accounts` and `reseller_client_groups`;
targets are `manual_services` and `manual_service_groups`.
Categories currently are flat: there is no parent-category column or hierarchy
to invent. A future hierarchy must extend the global category guard to ancestors.

No policy rows are backfilled. Existing availability remains the default.
New customers keep Slice 6A's default group assignment and inherit availability.
Wallet, immutable account currency, pricing arithmetic, FX, charge, snapshot,
refund, payment gateway, retail checkout and customer authentication calculations
and lifecycle are unchanged.

## Additive migration

`031_client_service_access.sql` follows 030 and never edits migrations 019–030.
Four strongly typed tables:

| Table | Subject | Target |
| --- | --- | --- |
| client_group_service_access | owning client group | owning manual service |
| client_group_category_access | owning client group | owning service category |
| customer_service_access | owning customer | owning manual service |
| customer_category_access | owning customer | owning service category |

Every table has a UUID primary key, subscriber ID, subject/target IDs, effect,
created/updated timestamps, a unique subscriber/subject/target tuple, composite
tenant foreign keys and ALLOW/DENY check. INHERIT is absence, not a stored effect.
Identity/subject/target/creation attributes cannot be retargeted on UPDATE.
Existing customers, groups, memberships, prices, catalog, orders, wallets,
ledger, sessions, login history and payment data are untouched by the migration.

## Authoritative resolution

`resolve_client_service_access(subscriber, customer, group, service)` is the
single SQL resolver. Customer calls always use their session subscriber and
customer ID, pass null for group, and resolve membership from the database.
An explicitly supplied group is used only for an authenticated owning-reseller
group preview. A customer never supplies authoritative membership or access.

Global requirements always win:

1. Tenant-owned subject and service exist.
2. Existing customer enabled eligibility, plus unchanged route/session checks.
3. Service active.
4. Its category, if assigned, enabled.

Then first matching policy wins, in this exact order:

1. Customer service
2. Customer category
3. Active group service
4. Active group category
5. Existing default ALLOW availability

Customer category DENY therefore defeats group service ALLOW. Customer service
ALLOW can defeat its own category DENY, but never global disable. Group service
ALLOW can defeat its group's soft category DENY. Inactive group policies are
ignored without deleting membership or policy records; customer policies survive.

The backend wrapper returns `{allowed,reasonCode,source,matchedPolicyId}`.
Controlled reasons:
`DENIED_NOT_FOUND`, `DENIED_EXISTING_ELIGIBILITY`, `DENIED_GLOBAL_SERVICE`,
`DENIED_GLOBAL_CATEGORY`, `DENIED_BY_CATEGORY_POLICY`, `DENIED_BY_CUSTOMER`,
`DENIED_BY_GROUP`, `ALLOWED_BY_CUSTOMER`, `ALLOWED_BY_GROUP`,
`ALLOWED_BY_DEFAULT`. Sources: GLOBAL, CUSTOMER_SERVICE, CUSTOMER_CATEGORY,
GROUP_SERVICE, GROUP_CATEGORY, DEFAULT. Global rejection suppresses policy ID.
Owner category rows use CATEGORY_SUMMARY with CATEGORY_HAS_ACCESSIBLE_SERVICES
or NO_ACCESSIBLE_SERVICES: this is an aggregate of actual services through the
same resolver, not a conflicting category authorization algorithm.

## Customer entry points and information exposure

- Catalog/search/filter: a lateral resolver predicate removes denied services
  **before** ORDER BY, LIMIT/OFFSET, `hasMore`, serialization and effective pricing.
- Category options include only enabled tenant categories containing at least one
  accessible service; a service exception can legitimately keep a category visible.
  Categories without services, or with only denied services, are absent.
- Service details, quote and new purchase call the same access guard.
- Denial returns non-enumerating 404 `Service not found or unavailable.` without
  hidden description, requirements, prices, rule IDs or owner reasons.
- Existing customer-block/auth errors remain unchanged (401/403 as applicable).
- Customer-rendered service forms use these existing catalog/detail/quote APIs;
  no alternate unprotected service entry point was introduced.
- Reseller catalog/pricing management remains owner-authorized configuration;
  it may inspect/configure owned services even if denied to a particular client.
  New access previews return only access decisions, never effective prices.

## Transaction and concurrency boundary

Reuse Slice 6A's tenant advisory key `bhru-client-pricing:<subscriber UUID>`.
Catalog/detail/quote/purchase resolve under a transaction-scoped shared lock.
Policy writes acquire the exclusive lock **before** reads/row locks. SQL triggers
on all four policy tables also participate. Existing write locks cover group
status, assignment, service/category changes and pricing/currency writes.
Different tenants do not share this serialization boundary.

For a new order, access, active service, inputs, authoritative price, account
currency, wallet/account locks, exact available balance, order and ledger are
checked/written within the existing PostgreSQL transaction. Browser prices remain
non-authoritative. No denied order can commit a debit, ledger entry or financial
order activity. A stale earlier quote cannot bypass new denial.

If a revocation/reassignment/disable transaction holds the exclusive lock first,
the purchase waits and resolves the committed new state. If a purchase holds the
shared lock first, the policy writer cannot commit before that purchase finishes.
This gives a clear transaction order; it is not retroactive cancellation.
Raw SQL writers can still encounter ordinary PostgreSQL row/advisory deadlocks
if they choose a different lock order; PostgreSQL aborts a transaction instead
of permitting a stale authorized financial commit. Application writes use the
consistent advisory-first ordering.

Existing idempotent order retries return their already accepted order snapshot
even after denial: replay is not a new purchase and creates no new charge.
History/list/detail, completion, rejection and exact same-currency refund paths
never re-authorize past accepted orders against today's catalog.

## Reseller management and API

Existing Client Groups has Access / Service Permissions. Client Detail has
Service Access. Both use a shared compact table for service/category policies,
search, service type and category filters, server pagination, own rule and
effective access. The customer view shows current group and inherited group
policy; inactive group policy is ignored. Rows show global availability and a
pricing-rule indicator (not a new pricing calculation).

INHERIT/ALLOW/DENY selectors have explicit Save. Bulk applies the selected effect
to up to 50 unique owned targets. Ownership is checked for the entire batch before
any mutation; the existing transaction rolls back every policy and audit event on
any later error. Selection/drafts reset on subject/mode/filter/page changes.
There are loading/error/retry/empty/save states and scoped query invalidation.
Customer owner-preview refreshes the canonical resolver and displays source/reason.

Owner-only OpenAPI routes:

- GET/POST `/api/client-groups/:id/access`
- GET/POST `/api/clients/:id/access`
- GET `/api/clients/:id/access/:serviceId`

GET parameters: targetType SERVICE/CATEGORY (default SERVICE), page, search,
categoryId, serviceType. POST body: targetType, targetIds (1–50 distinct UUIDs),
effect INHERIT/ALLOW/DENY. A POST batch supports both create/update and reset.
Generated React hooks and Zod contracts use the same OpenAPI surface.
Customer sessions cannot use owner routes or mutate policies.

## Audit and historical references

`client_service_access_events` is an append-only owner-attributed tenant audit
table following the existing group-admin audit pattern. Its stronger target and
before/after fields avoid overloading the narrower Slice 6A group CRUD records.
Events store tenant, verified owning account_users actor, exactly one strongly
tenant-referenced group/customer, exactly one service/category, created/updated/
removed action, previous/new effect and timestamp. SQL checks prohibit incomplete
or contradictory transitions; INSERT validates actor ownership, UPDATE/DELETE
are rejected. Policy SQL triggers write audit in the same transaction.
Direct trusted SQL policy mutation must provide the verified owner context; a
customer mutation also needs the existing verified Client Activity context.
This is the same trusted-DB-principal boundary as existing financial audit.

Customer policies additionally emit closed PROFILE Client Activity types:
customer_service_access_created/updated/removed and
customer_category_access_changed. They use the subscriber_owner actor, never a
fabricated customer action. Group-only changes never invent a customer activity.
No-op effects do not create audit noise. No historical audit is manufactured.
Audited group references prevent deletion, including after policy reset; deactivate
the group instead. Composite foreign keys also preserve service/category/customer
references needed by audit history.

## Validation

Run the focused isolated suite:

```sh
node scripts/test-financial-summary.mjs --access-only
```

It creates a disposable Unix-socket PostgreSQL instance and private fixture API.
It does not read the operator's DATABASE_URL and performs no VPS/production
operation. PostgreSQL server binaries must be on PATH. It covers:

- migration preservation/no-policy defaults/new default membership;
- all policy precedence/specificity/inactive-group/global-disable cases;
- authorized catalog/search/categories/pagination and hidden details/prices;
- direct/stale-quote denied orders with exact money/ledger/activity conservation;
- blocked clients, authoritative pricing, exact debit and idempotent history replay;
- immutable accepted history, exact refund/double-refund and DZD account/FX behavior;
- revocation, reassignment, global disable and shared-reader/exclusive-writer races;
- tenant ownership in APIs and composite SQL foreign keys for all policy tables;
- customer privilege escalation/forged group flags and immutable verified audit;
- bounded unique bulk updates, invalid target atomicity and late-error rollback;
- preserved payment/retail rows, existing login history and other sessions;
- existing focused Slice 6A pricing/default-group tests as compatibility coverage.

Use API/frontend TypeScript and production builds as additional validation.
No broad browser/E2E or external live payment-provider tests are part of this
slice. UI/manual review is deferred until the user has computer access.

## Limitations and deferred work

No nested category hierarchy, provider automation/import, payment infrastructure
changes, retail policy changes, new CMS, client-controlled permissions or cross-
tenant rules. Bulk selects the current page (30 rows), with a backend hard cap
of 50; it is not an unbounded whole-catalog operation. Category rows summarize
service access, so an empty category is correctly not an available offering.
Existing authorized order history remains visible by design, including its
immutable former service/price/input snapshots. No retroactive financial repair
or cancellation is performed by changing an access policy.
