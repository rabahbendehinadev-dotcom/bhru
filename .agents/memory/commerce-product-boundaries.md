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
snapshots for confirmation and historical display. Only the Client Default entry is protected
against disabling/deletion; base prices remain anchored independently of currency visibility.

USD must become the system/accounting Base / Reference Currency, permanently at rate
1.000000. This is distinct from Client Default, which may be any enabled subscriber currency.
Manual commercial rates mean units of the target currency per 1 USD. Panel and customer
currency selection are display preferences only; they must not rewrite canonical prices,
provider costs, margins or historical orders. Future provider costs remain conceptually USD.
Existing DZD-denominated amounts must never simply be relabelled USD: legacy conversion
requires an explicitly approved, value-preserving migration strategy. No automatic cutover
of existing businesses is authorized by this architectural decision alone.

**Why:** The user now requires USD as the reference for future service-provider API costs,
while explicitly protecting the economic meaning of existing prices and order snapshots.

**Why:** The user explicitly defined these product boundaries for the first commerce phase.

**How to apply:** Preserve these boundaries in future commerce work. Reuse the existing subscriber
licence eligibility, immutable public slug, independent admin authorization and persistent media
adapter; do not reinterpret an unavailable module as permission to delete data or change core SaaS behavior.

Commercial conversion rounds the unit price once and sums quantity-multiplied lines.
Existing private order amounts stay base-valued, with immutable commercial display snapshots.

**Why:** Displayed unit × quantity must equal displayed line totals, and adding visitor currencies
must not silently change the units of existing subscriber reports or historical orders.

**How to apply:** Keep the same rounding boundary across all public pages; future reporting must
explicitly distinguish base values from the commercial currency snapshot.
