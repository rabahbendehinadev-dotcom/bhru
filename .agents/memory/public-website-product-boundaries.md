---
name: Public website product boundaries
description: User-stated future URL, slug lifetime and shared-template requirements; implementation remains separately authorized.
---

The intended default public website URL is `https://bhru.net/{subscriber-slug}`, not a wildcard subdomain. Slugs are generated automatically from the business/server name when the subscriber is created. Assigned slugs are immutable: neither business-name nor company-name edits may change them.

**Why:** The user specified automatic URLs without a registration slug picker and stated that existing customer links must not break.

**How to apply:** Preserve this URL and lifetime model in future work. The user approved Phase 1 storage, deterministic generation, reservations, concurrency-safe registration and backfill only. Public resolution, public subscription-status behavior, CMS/templates and custom domains remain separately authorized.

Keep one versioned normalization policy for registration and migration/backfill; never silently renormalize already-assigned URLs.

**Why:** Different normalization policies would cause inconsistent duplicate/reserved-name handling, and renormalization would break permanent customer links.

**How to apply:** Treat changes to normalization as an explicit compatibility decision, not a reason to rewrite existing slugs.

A future custom hostname is an additional mapping to the same subscriber business, website and business data. It must not create another subscriber, another website copy, another business database or duplicated CMS content.

**Why:** The user explicitly requires the default URL and a future custom domain to resolve to the same website and data.

**How to apply:** Reuse the existing ownership boundary recorded in Subscriber Settings staging; do not introduce another tenant/server/workspace identity for public routing.

BHRU will have one shared public website template. Subscribers will later customize its logo, index banner, page content, services, testimonials, gallery, blog, contact information and appearance through their panel/CMS.

**Why:** The user explicitly ruled out separate source-code copies per subscriber.

**How to apply:** Resolve slug/hostname to the owning subscriber and then scoped public CMS content for the shared template. The template, CMS and custom domains are future work, not authorized by an architecture-analysis request.
