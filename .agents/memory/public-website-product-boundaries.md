---
name: Public website product boundaries
description: User-stated future URL, slug lifetime and shared-template requirements; implementation remains separately authorized.
---

The intended default public website URL is `https://bhru.net/{subscriber-slug}`, not a wildcard subdomain. Slugs are generated automatically from the business/server name when the subscriber is created. Assigned slugs are immutable: neither business-name nor company-name edits may change them.

**Why:** The user specified automatic URLs without a registration slug picker and stated that existing customer links must not break.

**How to apply:** Preserve this URL and lifetime model in future work. Phase 1 is approved; Phase 2 resolution must stay intact. Phase 3 authorizes a shared public template only; CMS requires visual approval first, and customer features/custom domains remain deferred.

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

**How to apply:** Resolve slug/hostname to the owning subscriber and then scoped public CMS content for the shared template. Phase 3 prepares the template/public contract; do not begin CMS implementation before visual approval.

When public CMS fields do not exist yet, use clearly generic rendering defaults rather than invented subscriber-specific services, prices, statistics, testimonials or business claims.

**Why:** The user explicitly prohibits demo business data and unnecessary database tables to fill the public template.

**How to apply:** Keep service placeholders honest, but hide optional statistics, feedback and benefits when no real content exists. Customer Login remains an honest coming-soon notice shown on demand, not a permanent large homepage section; it must not use the owner's panel login.

The user approved Public Template V2 visually and requires it to be FROZEN after the final mobile navigation overlay polish. The shared website should remain a premium professional GSM/IMEI/phone-unlocking service website, not a generic startup landing page.

**Why:** The user explicitly approved V2, restricted the final change to mobile navigation behavior, and prohibited proceeding to CMS, pushing or deploying.

**How to apply:** Do not redesign the frozen template or change desktop without new authorization. Subscriber branding, accent and hero/banner come from the model; do not hardcode BHRU branding or depend on lime green or a generic network illustration as the permanent identity. Visual approval alone does not authorize CMS; wait for a separate request.

Future authorized CMS features are conditional extensions, not permission to redesign frozen V2. Subscribers with no new configuration must receive the same default public HTML and CSP.

**Why:** The user explicitly required exact V2 backward compatibility when approving Top Area and Banner management.

**How to apply:** Keep new HTML, scoped styles and trusted behavior conditional on configured content. Extend accessibility for new regions without rewriting the frozen menu or default styles.
