# BHRU Shared Public Website Template — Phase 3

## Boundaries

One server-rendered homepage serves every eligible subscriber. This replaces only
the eligible Phase 2 placeholder. Slug allocation/immutability, URL validation,
reserved namespaces, subscription eligibility, private administrator entry,
sessions, Subscriber Panel, service worker and hostname routing are unchanged.
No CMS, customer authentication, checkout, products or database tables were added.

## Ownership and data flow

`public slug → existing eligible SQL lookup → internal resolved subscriber ID
and its scoped public identity → normalized public model → shared components`

The resolver's existing predicate is unchanged. Its SQL projection now also
selects the owning ID for internal context. Public names come from the same
atomic query: `g.subscriber_id = s.id`, with `s.public_slug = $1`.
`loadSubscriberPublicSiteData` accepts that server-resolved context, never a
browser session or client-provided owner. Future CMS queries must bind this
resolved ID in `WHERE subscriber_id = $1`.

The internal ID is discarded when building `PublicSiteModel`; it is never
serialized into HTML. All requests build a fresh model. No cross-tenant cache
or duplicate frontend/template is introduced.

## Component structure

`artifacts/api-server/src/lib/public-site/`

- `model.ts`: normalized public contract, truthful defaults and future page-path helper.
- `data.ts`: internal server ownership boundary and scoped projection adapter.
- `safety.ts`: text/attribute escaping, section-link/image/color validation.
- `homepage.ts`: complete shared HTML document and component composition.
- `styles.ts`: model-driven shared responsive stylesheet.
- `components/header.ts`: brand/logo, navigation, public Login and native mobile menu.
- `components/hero.ts`: identity, headline, description, CTAs and optional illustration/image.
- `components/services.ts`: reusable service cards and catalogue section.
- `components/why.ts`: information/reasons section.
- `components/statistics.ts`: statistics/trust area.
- `components/cta.ts`: CTA/contact area and customer-access notice.
- `components/footer.ts`: company identity, public links and copyright.

The existing `public-site-html.ts` delegates successful sites to this template
while preserving the generic Phase 2 error documents.

## Public model

`PublicSiteModel` contains:

- `businessName`, `companyName`, `siteName`
- nullable `logo` and `heroImage`
- `heroTitle`, `heroDescription`
- `primaryCTA`, `secondaryCTA`: label and href
- `theme`: accent, ink and background
- `navigation`
- `services`: title, description, icon, placeholder/published state and optional href
- `sections`: headings, descriptions, reasons, statistics and customer-access messaging
- `footer`: description, links and current copyright year

Only existing permitted identity fields currently come from storage. Other fields
use generic defaults. Service cards are clearly labelled Coming soon; statistics
are dashes with explicitly unpublished notes. There are no fabricated prices,
turnaround times, reviews, counts, partners or provider-specific service claims.
Images default to null; the illustration is generic, not subscriber business data.

Phase 4 can supply real, validated subscriber-scoped CMS values to this contract
without rewriting the visual components. Public asset authorization/validation
must be defined alongside any future upload/publishing feature.

## Navigation and security

The homepage is still `/{slug}`. Current navigation/CTAs are functional local
section anchors. The public Login button navigates to a truthful customer-access
notice; it does not open the owner's `/login` page or pretend customer auth exists.

The mobile menu uses native details/summary, with no browser JavaScript. While
open, its header stops sticking so an anchor jump scrolls the menu away rather
than obscuring the destination. Opening/closing remains native.

The dormant `publicPagePath` helper establishes future services/about/contact
paths. These subpages still return Phase 2 404s; no extra routing is activated.
All template links are host-neutral, so future verified domain mapping can feed
the same owner/model/template. No domain mapping is implemented here.

No SubscriberShell, workspace tabs, panel/sidebar, `/api/state`, auth bootstrap or
private account metadata is loaded by the public document. CSP still blocks
scripts/forms, with a narrowly separate image directive for the optional image
fields. Text/attributes are escaped; image/link/color schemes are validated.
Dynamic documents remain no-store/noindex during this Development stage.

## Verification

Repeatable Development fixtures and checks:

1. `node scripts/test-public-sites.mjs --prepare`
2. `node scripts/test-public-sites.mjs`
3. One focused browser pass: two identities, signed-in A → public B, refresh,
   Back/Forward, menu/CTA behavior, desktop/iPhone/Android/tablet layout.
4. `node scripts/test-public-sites.mjs --cleanup`

The expanded suite covers shared template identity, honest defaults, local links,
private-field exclusion, model whitelisting, eligibility/status regressions,
escaping/CSP, reserved/application/static/PWA/private paths, service failures,
production/Preview parity and unchanged public-navigation worker exclusions.

### Results

All 11 repeatable HTTP/model/worker regression groups passed. The single browser
review passed at desktop 1440×900, tablet 768×1024, iPhone 390×844 and Android
412×915: no horizontal overflow or visible clipping. Public menu/CTA anchors,
customer-access notice, refresh and Back/Forward worked.

Signed-in Alpha saw only Beta's public identity while its private session,
dashboard and General Settings remained Alpha. Unknown/uppercase/Pending URLs
retained uniform genuine 404s. Private fixture fields, script tags and page
`/api/state` requests were absent.

Temporary test data was removed; pre-existing business, slug, account, settings,
licence, plan and administrator fingerprints matched. Shared security/rate-limit
counters were left intact. Workspace/API type checks passed.

The existing eligible public URL `/verificatione5e9d061a9962` remains available
for visual review. Desktop/iPhone screenshots are in `screenshots/phase-3-*`.
Transient owner sign-in/loading and chart-sizing warnings were observed on the
unchanged panel but did not block the public-site review.

No push or deployment. Visual approval is required before CMS implementation.
