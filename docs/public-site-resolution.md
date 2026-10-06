# Public Subscriber URL Resolution — Phase 2

## Scope

The existing root-mounted BHRU application now serves a minimal, shared public
HTML document at `/{public_slug}`. This is not a CMS, storefront, customer login,
checkout or custom-domain implementation. Phase 1 allocation/backfill/immutability
is unchanged. No database migration is introduced.

## Routing

1. Preserve the root application, authentication, workspace, API, configured
   private administrator, static, PWA, health and Vite namespaces.
2. For other URLs, require one exact lowercase ASCII slug segment, at most 63
   characters. Reject uppercase, encoded separators, punctuation, repeated
   hyphens, extra segments and trailing slashes; do not decode or generate aliases.
3. Resolve `subscribers.public_slug` using a parameterized server query.
4. Apply the existing eligibility predicate and the Phase 1 reserved-name guard.
5. Render the shared minimal public document.

Production Express handles public navigation before account/session middleware.
Development Vite delegates candidate URLs to
`GET /api/public/site-document?path=...` through the managed shared proxy and
forwards the HTML and real HTTP status. An empty 204 means an existing application
namespace and lets its original routing continue. No session cookies or
authorization headers are forwarded by this development bridge.

The public document loads no panel JS, session store, `/api/state`, SubscriberShell
or admin components. Browser refresh and normal Back/Forward use real document
navigation. Browser-normalized dot segments may reach a different canonical
application path before the server sees them; the resolver itself never decodes
or aliases raw malformed paths.

## Public fields and eligibility

Only `businessName` and `companyName` enter public rendering. A blank/missing
company name falls back to the business name. The query does not select IDs,
owner/account/contact fields, licence keys, statuses or admin metadata.

ACTIVE/TRIAL requires an unexpired subscription with a plan and licence key,
exactly as the current panel permits. Disabling an already-assigned plan is not
an access condition. Other states, elapsed ACTIVE/TRIAL and missing subscriptions
have the same generic 404 as an unknown site; no private denial reason is rendered.

Visiting another subscriber's public page never changes the visitor's private
subscriber ID/session. Slug resolution is anonymous and independent of cookies.
Future verified hostname resolution can select the same subscriber and shared
content, but no hostname mapping exists in this phase.

## HTTP and content safety

- 200: eligible site, public names and placeholder only.
- 404: identical generic unavailable HTML for unknown, malformed and blocked sites.
- 503: generic temporary-unavailable HTML for lookup/service errors, with
  `Retry-After: 60`; never convert database errors to 404.
- 204: internal document endpoint declines an existing application namespace.

Public dynamic responses use `Cache-Control: no-store`; names are HTML escaped.
CSP disables scripts and forms. Placeholder/error pages are noindex until a
separately approved publishing/SEO phase.

The existing root-scoped worker already excludes public slug navigation from
its subscriber offline fallback. Its behavior was verified; no worker change
or public/offline data cache was introduced.

## Development verification

1. `node scripts/test-public-sites.mjs --prepare`
2. `node scripts/test-public-sites.mjs`
3. One browser pass over the generated fixtures: public refresh/Back/Forward,
   authenticated A visiting B, panel/settings return, private entry and offline
   failure isolation. Credentials are temporary; never publish them.
4. `node scripts/test-public-sites.mjs --cleanup`

The suite checks real HTTP status/HTML, ACTIVE/TRIAL/blocked/elapsed states,
reserved/unsafe paths, escaping/CSP, ownership preservation, static/API/PWA/health
regressions, controlled resolver exceptions and production/Preview handler parity.
Cleanup compares fingerprints of all pre-existing business, slug, account,
settings, subscription, plan and administrator records.

### Verified results

The HTTP/resolver/worker regression groups passed, including generic service
failure handling and rejecting unexpected JSON from the development resolver.
One browser pass confirmed authenticated A → public B isolation, genuine 404s,
refresh, Back/Forward, desktop/phone layouts, panel/settings return and unchanged
private administrator entry behavior. A real offline public navigation failed
with a browser connection error rather than rendering the panel offline page.

Owned subscriber/account/settings/subscription/plan/session/audit fixtures were
removed. All pre-existing records covered by the fingerprints were unchanged.
Shared security/rate-limit counters were not deleted or reset.

The valid existing subscriber URL `/verificatione5e9d061a9962` remains available
in Development Preview. Its screenshot is
`screenshots/phase-2-public-site-desktop.jpg`. No blocking issue was observed.
A non-blocking chart-sizing warning was noted on the unchanged General Settings
screen; it was outside this phase.

No push/deployment is authorized. Review Phase 2 before any CMS or Phase 3 work.
