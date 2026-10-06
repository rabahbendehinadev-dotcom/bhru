---
name: Public website product boundaries
description: User-stated future URL, slug lifetime and shared-template requirements; implementation remains separately authorized.
---

The intended default public website URL is `https://bhru.net/{subscriber-slug}`, not a wildcard subdomain. Slugs are generated automatically from the business/server name when the subscriber is created. Assigned slugs are immutable: neither business-name nor company-name edits may change them.

**Why:** The user specified automatic URLs without a registration slug picker and stated that existing customer links must not break.

**How to apply:** Preserve this URL and lifetime model in future work. Phase 1 is approved. Phase 2 authorizes anonymous URL resolution and a minimal isolated shell using only business/company names; CMS, customer features and custom domains remain separately authorized.

Keep one versioned normalization policy for registration and migration/backfill; never silently renormalize already-assigned URLs.

**Why:** Different normalization policies would cause inconsistent duplicate/reserved-name handling, and renormalization would break permanent customer links.

**How to apply:** Treat changes to normalization as an explicit compatibility decision, not a reason to rewrite existing slugs.

Public website access follows existing panel eligibility without changing licence behavior. Ineligible and unknown sites must share a generic response without private denial reasons; service failures must remain distinguishable as generic server unavailability.

**Why:** The user explicitly requires no leakage of suspension, expiry, billing, licence or account internals.

**How to apply:** Keep public response fields explicitly allowlisted and public rendering independent of the visitor's subscriber session. Do not import or bootstrap SubscriberShell or account state when expanding public pages.

A future custom hostname is an additional mapping to the same subscriber business, website and business data. It must not create another subscriber, another website copy, another business database or duplicated CMS content.

**Why:** The user explicitly requires the default URL and a future custom domain to resolve to the same website and data.

**How to apply:** Reuse the existing ownership boundary recorded in Subscriber Settings staging; do not introduce another tenant/server/workspace identity for public routing.

BHRU will have one shared public website template. Subscribers will later customize its logo, index banner, page content, services, testimonials, gallery, blog, contact information and appearance through their panel/CMS.

**Why:** The user explicitly ruled out separate source-code copies per subscriber.

**How to apply:** Resolve slug/hostname to the owning subscriber and then scoped public CMS content for the shared template. Only the minimal public shell is authorized in Phase 2; full template/CMS and custom domains remain future work.
