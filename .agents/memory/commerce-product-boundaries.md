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
must explicitly fall back to English; requested currencies must never be treated as converted
prices without a real conversion source. Keep authoritative base prices and order totals intact.

**Why:** The user explicitly defined these product boundaries for the first commerce phase.

**How to apply:** Preserve these boundaries in future commerce work. Reuse the existing subscriber
licence eligibility, immutable public slug, independent admin authorization and persistent media
adapter; do not reinterpret an unavailable module as permission to delete data or change core SaaS behavior.
