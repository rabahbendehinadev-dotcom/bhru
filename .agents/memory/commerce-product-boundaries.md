---
name: BHRU commerce product boundaries
description: Paid optional commerce scope, ownership, entitlement and preservation rules.
---

E-Commerce is an optional paid subscriber module. Only Platform Admin may grant or revoke it.
Subscriber Store Open is a separate setting. Revocation restricts access and never deletes
saved business data. Phase 1 uses guest order submission, not payment collection or customer accounts.
Variants, payment gateways, shipping integrations and custom domains are deferred.

Commerce-enabled public homepages use the E-Commerce catalog as their sole product source:
subscribers must not re-enter products in CMS. Replace the legacy placeholder services and
device-service CTA only on commerce homepages; retain non-commerce presentation for compatibility.

Public header Login/Register are customer actions, never subscriber or Platform Admin entry points.
Visitor language/currency preferences must be scoped to the subscriber. Unavailable translations
must explicitly fall back to English. Currency conversion uses each subscriber's manually
configured commercial rates, never bank rates, invented rates or an external FX API.
Keep authoritative base prices and base order totals intact; retain immutable currency/rate
snapshots for confirmation and historical display. Client Default must remain enabled; the
finalized USD foundation also keeps the USD reference entry permanent and available.

USD must become the system/accounting Base / Reference Currency, permanently at rate
1.000000. This is distinct from Client Default, which may be any enabled subscriber currency.
Manual commercial rates mean units of the target currency per 1 USD. Panel and customer
currency selection are display preferences only; they must not rewrite canonical prices,
provider costs, margins or historical orders. Future provider costs remain conceptually USD.
Existing DZD-denominated amounts must never simply be relabelled USD: legacy conversion
requires an explicitly approved, value-preserving migration strategy. No automatic cutover
of populated non-USD businesses is authorized. The user approved safe initialization only
for verified empty Development businesses; ambiguous legacy currency configuration stays blocked.

Use 12-decimal canonical USD precision and six-decimal manual rates in future provider work.
**Why:** Cent-only storage cannot preserve provider costs or reciprocally converted legacy
prices; extra canonical precision prevents early rounding from changing business economics.
**How to apply:** Keep provider costs and selling amounts in the same precise USD domain;
round only presentation, and never promote a cents compatibility projection to authority.

**Why:** The user now requires USD as the reference for future service-provider API costs,
while explicitly protecting the economic meaning of existing prices and order snapshots.

**Why:** The user explicitly defined these product boundaries for the first commerce phase.

**How to apply:** Preserve these boundaries in future commerce work. Reuse the existing subscriber
licence eligibility, immutable public slug, independent admin authorization and persistent media
adapter; do not reinterpret an unavailable module as permission to delete data or change core SaaS behavior.

Commercial conversion rounds the unit price once and sums quantity-multiplied lines.
Historical order views display the original customer snapshot, independently of current panel
currency or rates. Legacy orders without snapshots keep their original denomination.

**Why:** Displayed unit × quantity must equal displayed line totals, and adding visitor currencies
must not silently change the units of existing subscriber reports or historical orders.

**How to apply:** Keep the same rounding boundary across all public pages; future reporting must
explicitly distinguish base values from the commercial currency snapshot.

Migration verification must identify the subscriber shown in the user's runtime before claiming
that their account was initialized. Aggregate Development counts can consist entirely of
verification accounts and do not establish the state of a subscriber in another environment.

**Why:** A successful empty-account migration report did not match the user's currency screen;
the subscriber shown was absent from the inspected Development database.
**How to apply:** Verify runtime environment and tenant identity first, then inspect that tenant's
money/version, full product/order counts and currency configuration. Never use an aggregate
success count as evidence that a particular subscriber was migrated.
