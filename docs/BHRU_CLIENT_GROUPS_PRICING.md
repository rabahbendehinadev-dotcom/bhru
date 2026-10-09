# Client groups and custom service pricing — Slice 6A

## Existing architecture extended

The canonical identity is `public_customer_accounts`; its pre-existing
`client_group_id` still references the pre-existing `reseller_client_groups`.
Manual services and their availability categories remain separate from client
groups. Slice 6A extends these models, not a second identity or catalog.
The existing `accountPrice` conversion, `quoteService` and `purchaseService`
are shared by customer catalog/details/quotes/orders and reseller previews.
Wallet posting and exact service-order refunds remain the existing ledger path.
Payment Gateway infrastructure and retail checkout are not changed.

## Group model and deterministic cutover

Existing client groups retain their IDs, names and members. Description,
active/default status, sort order and timestamps are added. Name uniqueness
retains the existing tenant-scoped, case-sensitive database constraint.
Legacy group creation timestamps were not stored: their added timestamps
mark this cutover, **not invented historical creation dates**.

For each existing subscriber with groups, the smallest existing UUID becomes
the active default. For a subscriber with no groups, the migration creates
one `Standard` default. This is a bootstrap label, not a mandatory business
group name; the owner may rename it. Only previously unassigned customers
are backfilled to their tenant default. Existing memberships are never moved.
No history, financial rows, payment data, sessions or audit events are synthesized.

New subscribers automatically get a default. New customer inserts, including
the existing registration path, use the current active tenant default.
The unique partial index plus deferred constraint require exactly one active
default at transaction commit. Selecting a new default is atomic and does not
reassign existing clients. The current default cannot be disabled/deleted;
select a replacement first.

## Membership and inactive groups

Clients have one tenant-scoped group. Only the authenticated owner can change
it, from Clients rows or Client Detail. Listing supports a group filter, and
Overview displays the current group's name/status. Null assignments and
cross-tenant/inactive targets are rejected. A disabled group keeps its
customers and historical references; its group rules stop applying. A direct
customer override still applies, otherwise the standard service price wins.
Reactivating the group restores its group rules for future quotations/orders.

## Rules and precedence

Group-service and customer-service tables have composite tenant foreign keys
and one rule per target/service.

1. Customer-specific rule.
2. Current **active** group's service rule.
3. Standard reseller service price.

Rules do not stack. Both scopes support:

- `INHERIT_DEFAULT`: remove the stored row; customer inheritance falls back
  to group then standard, and group inheritance falls back to standard.
- `FIXED_PRICE`: an exact USD amount, up to the existing 12-decimal USD basis.
- `PERCENT_DISCOUNT`: 0–99.99%, in integer hundredths of a percent.
- `PERCENT_MARKUP`: 0–10000%, in integer hundredths of a percent.

The existing ledger/order lifecycle requires positive charges. Zero fixed
prices, 100% discounts, negative/nonfinite amounts and values outside bounds
are rejected. A final charge rounding to zero, exceeding the existing money
limits, or below the existing USD snapshot precision fails explicitly.
This slice does not invent a separate free-order lifecycle.

## Exact currency calculation

Fixed prices use USD. Percentage adjustments operate on the **standard USD
service price**, not the group-adjusted price, using BigInt numerator/denominator
arithmetic. Fractional percentage units are retained through the approved
reseller USD FX rate. `accountPrice` rounds once, half-up, at the final account
minor-unit boundary. The existing configured USD-basis checks and money limits
are retained. No JavaScript float calculates a price.

The returned customer currency is the immutable Account Currency. Wallet
balances, funding, ledger movements and refunds are never FX-converted.
The effective base price is presented as an exact decimal. The legacy
`priceUsdUnits` field remains an integer 12-decimal snapshot/quote-confirmation
field; the new pricing snapshot additionally preserves the exact numerator
and denominator. Final account charging uses those exact rational values.

## Consistency and order integration

Transaction-scoped advisory locks use one tenant pricing key:
shared for catalog/quote/preview/order reads and exclusive for group,
membership, rule, service/category and currency configuration writes.
Owner mutation paths take the exclusive lock **before** row locks; order
placement takes the shared lock **before** customer/wallet locks.
Database write triggers also enforce the pricing boundary.

An accepted order uses one coherent current membership/rule/service/rate
configuration. The backend independently recalculates; submitted expected
prices are confirmation values, never financial authority. A changed price
returns `PRICE_CHANGED` before creating an order/debit. Existing wallet locks,
idempotency checks, immutable ledger insertion and transactional order Activity
remain authoritative.

New orders freeze standard/effective USD price, current group ID/name/active
status, rule source/ID/method/value/version, exact rational base price, approved
rate and final account charge. Customer-rule IDs are snapshots, not live
dependencies. Old orders keep NULL new pricing snapshots; they are never
reconstructed. The existing immutable order guard is extended to the new
fields. Rejection refunds exactly the original account-currency debit,
not a recalculation from a current group, rule, service price or FX rate.

## Management UI and API

The existing Client Group navigation opens the compact group list with
counts, search/filter, create/edit, activation, default selection and pricing.
Pricing tables are searchable/paginated and support setting/removing a rule.
Client Detail Pricing includes direct overrides and an authoritative backend
price preview showing standard/effective base price, source, group,
Account Currency, FX rate and final amount. No browser formula duplicates it.
Loading, saving, empty and error states use existing panel patterns.
Successful mutations refresh affected client/group/pricing/preview queries.

API contracts and generated types include group administration, assignment,
group/customer pricing CRUD and effective preview. All owner routes resolve
the authenticated tenant first; all customer prices use the authenticated
customer. Other customers' rules are not exposed.

## Audit and deletion

Owner assignments emit controlled `customer_group_assigned`/
`customer_group_changed` events; override changes emit
`customer_pricing_override_changed`, with verified subscriber-owner attribution.
Group administration has an immutable tenant-scoped owner audit table
(`created`, `updated`, `default_changed`, `deleted`, `pricing_changed`).
These are configuration events, never additional financial ledger movements.

Default, member-referenced, rule-referenced and historical-order-referenced
groups cannot be hard-deleted. Legacy group history cannot be reconstructed,
so legacy groups cannot be deleted even after their members leave. Deactivate
instead. A post-cutover API-created group may be deleted only when unused;
its immutable administration audit survives. No deletion cascades to customers,
orders, wallets or ledger rows.

## Migration, focused checks and limits

`030_client_groups_pricing.sql` is additive; migrations 019–029 are untouched.
Apply it only to the independently identity-verified Replit development
database using the existing checked-checksum migration runner. Production
migration/deployment is separately authorized work.

Run the focused disposable PostgreSQL harness with:

```sh
node scripts/test-financial-summary.mjs --pricing-only
```

It covers cutover conservation, deterministic defaults and registration,
assignment/default constraints, all pricing methods and inheritance,
inactive groups, exact FX, catalog/quote/preview/order consistency, immutable
snapshots, stale quotes, idempotency, concurrency, exact refunds, availability,
cross-tenant rejection, owner Activity and payment/retail conservation.
API/frontend type checking and builds are separate checks.

Authenticated desktop/mobile UI interactions and visual checks are deferred
until later; no broad browser/E2E suite is part of this slice.
Slice 6B will handle client/group service-access policies. This slice changes
pricing only: a price rule can never expose an inactive service or disabled
service category. Provider API imports, payment integrations, retail pricing,
automatic group moves and invoice generation remain out of scope.
