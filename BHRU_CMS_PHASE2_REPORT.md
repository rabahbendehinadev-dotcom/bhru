# BHRU CMS Phase 2 — implementation and test report

Status: implemented and verified in Development/Preview only, 2026-10-06.

No Git push, deployment, production migration, production storage operation,
licence/subscription change or authentication change was performed.
Public Template V2 remains the frozen default. This report stops at Phase 2.

## 1. Files changed

New implementation:
- `lib/db/src/migrations/006_public_site_presentation.sql`
- `artifacts/api-server/src/lib/public-site/presentation.ts`
- `artifacts/api-server/src/lib/public-site/presentation-render.ts`
- `artifacts/api-server/src/lib/public-site/banner-script.ts`
- `artifacts/api-server/src/lib/public-site/top-area-script.ts`
- `artifacts/bhru/src/components/subscriber/public-website/PresentationEditor.tsx`
- `scripts/test-public-presentation.mjs`

Existing integration:
- `artifacts/api-server/src/routes/public-website.ts`
- `artifacts/api-server/src/lib/public-site.ts`
- `artifacts/api-server/src/lib/public-site/configuration.ts`
- `artifacts/api-server/src/lib/public-site/data.ts`
- `artifacts/api-server/src/lib/public-site/model.ts`
- `artifacts/api-server/src/lib/public-site/homepage.ts`
- `artifacts/api-server/src/index.ts` — migration readiness check only.
- `artifacts/bhru/src/hooks/use-public-website.ts`
- `artifacts/bhru/src/pages/public-website.tsx`
- `scripts/cleanup-public-website-cms.mjs`
- `lib/api-spec/openapi.yaml`
- Regenerated contracts under `lib/api-client-react/src/generated/` and
  `lib/api-zod/src/generated/`, including the new presentation/item DTOs.
- `artifacts/api-server/package.json` and `pnpm-lock.yaml` — `sanitize-html`
  runtime dependency and its TypeScript definitions.
- `BHRU_PUBLIC_MEDIA.md` — bounded staging quota clarification.
- This report and the existing public-template compatibility memory note.

The frozen public `styles.ts` and `mobile-menu.ts` were not changed.
There were no Subscriber Panel shell, Platform Admin, custom-domain or CMS page-builder changes.

## 2. Migration 006

`006_public_site_presentation.sql` creates four new tables and two image-reference
indexes. It does not update, delete or backfill existing subscriber, slug,
subscription, licence, account or Phase 1 CMS records.

Applied explicitly through the existing `pnpm db:migrate` procedure in Development.
Migrations 001–005 were skipped. A second migration run skipped 006 too.
The runner retains its checksum ledger, advisory lock and per-file transaction.

No previously applied migration file was edited. Startup checks for the new table;
startup still does not run migrations automatically.

## 3. Tables and columns

| Table | Columns |
|---|---|
| `public_site_presentation` | `subscriber_id`, `logo_strip_enabled`, `announcements_enabled`, `custom_html_enabled`, `custom_html`, `hero_mode`, `slider_autoplay`, `slider_interval`, `revision`, `created_at`, `updated_at` |
| `public_site_partner_logos` | `id`, `subscriber_id`, `asset_id`, `label`, `destination`, `new_tab`, `enabled`, `sort_order` |
| `public_site_announcements` | `id`, `subscriber_id`, `enabled`, `text`, `destination`, `background_color`, `text_color`, `movement`, `direction`, `speed`, `sort_order` |
| `public_site_banners` | `id`, `subscriber_id`, `asset_id`, `alt_text`, `destination`, `enabled`, `sort_order` |

Every row belongs to one subscriber. Array order is persisted as bounded,
owner-unique `sort_order`. Images have composite foreign keys to
`public_site_assets(id, subscriber_id)`, so PostgreSQL independently rejects
cross-owner references.

No configuration row means Classic Hero, no Top Area, autoplay on and interval 5.
There is no eager configuration backfill.

## 4. API endpoints

New private subscriber endpoints:
- `GET /api/cms/public-website/presentation`
- `PUT /api/cms/public-website/presentation`

GET returns own values, revision and short-lived owned image URLs. PUT accepts a
complete validated owner-scoped snapshot and its revision.

Extended existing endpoints:
- `PUT /api/cms/public-website` accepts optional `presentation` plus
  `presentation_revision` together. The editor uses this single transaction to
  save Phase 1 and Phase 2 atomically; a conflict rolls back both.
- `POST /api/cms/public-website/preview` accepts the unsaved presentation and
  returns the same renderer's HTML plus refreshed signed image URLs.
- Existing upload, delete and public-media endpoints retain the same paths and
  adapter. Reference protection/public visibility now includes logos and banners.

Subscriber-row serialization and revision checks prevent lost updates.
No public configuration API, subscriber-selection parameter or tenant override was added.

## 5. CMS UI

Location: Subscriber Panel → CMS / Blog → Public Website.

Collapsible structure:
1. General / Branding — existing Phase 1 fields preserved.
2. Top Area — independently enabled logo strip and announcements; collapsed
   Advanced Custom HTML.
3. Hero / Banner — Classic/Banner selector and existing Classic content fields.

Logo and banner cards support upload, thumbnail, replacement, Edit, enabled
toggle, up/down ordering and Delete with confirmation. Logo cards include label,
destination and new-tab settings. Announcement cards include text, destination,
colours, static/scrolling, direction and speed.

One Save and Reset cover both phases. Unsaved state stays session/workspace-local;
no browser draft cache was added. Upload/save/reset have shared busy guards.
Preview becomes stale immediately on edits and updates after debounce; Desktop
and Mobile controls and signed-image refresh remain intact.

Limits: six partner logos, eight announcements, eight banners, 500-character
announcement text and 4096-character custom HTML. The existing JSON request
body limit remains in place.

## 6. Public rendering

One public-only model and renderer still serve `/:public_slug` and the draft
preview. No subscriber-specific renderer was copied.

Top Area appears above the existing normal header:
- Responsive, internally scrollable logo strip; preserved image aspect ratios.
- Ordered, enabled announcement bars with CSS animation, hover/focus pause,
  keyboard Pause/Resume control and reduced-motion support.
- Sanitized optional HTML.

Classic Hero stays unchanged. Banner mode replaces only the Hero:
- Zero enabled banners safely falls back to Classic.
- One enabled banner is static: no autoplay, arrows or dots.
- Two or more use accessible previous/next, dots, pause/play and touch swipe.
- Autoplay defaults to 5 seconds; 3/5/7/10 seconds are supported.
- Rotation pauses on hover, carousel focus, hidden tabs and reduced motion.
- Accessible status tracks the active slide without announcing every automatic change.

Extensions have scoped CSS and fixed trusted script hashes. The new Top Area
becomes inert/ARIA-hidden during the frozen mobile modal, and restores on close.
The header itself remains interactive for its menu controls.

API regression comparison confirmed byte-identical default HTML and CSP for
an unconfigured site and an explicitly saved empty Phase 2 configuration.

## 7. Media and storage

The existing normalized PNG/JPEG upload adapter, UUID filenames, metadata,
signed preview URLs and persistent directory are reused. No second provider,
new mount or VPS host path was introduced.

All saved image references protect deletion, including disabled logos/banners.
Only eligible, enabled publicly rendered Phase 2 images get unsigned access.
Replaced/removed unused images are cleaned after a successful save; shared
references remain. Reset removes known staged uploads; persisted images are no
longer treated as staged.

There are at most 16 configured image slots. The retained-record quota is now
18 images / 48 MiB, providing two bounded replacement-staging slots.
The 5 MiB input limit, 8 MiB normalized-file bound, 4096-pixel dimensions and
20 uploads per subscriber per 15 minutes remain.

An abandoned upload after closing/reloading an unsaved editor can still occupy
quota; automatic expiry or an owner-facing abandoned-upload manager is not part
of this phase. Saved configuration/media is not automatically deleted.

## 8. Security and sanitization

- Existing subscriber authentication, CSRF/request headers, eligibility and
  server-derived tenant ownership are retained.
- Deep-strict generated schemas reject unknown owner/slug fields and nested
  injection. Duplicate IDs, foreign item IDs across all three item types and
  foreign assets are rejected before committing.
- UUIDs normalize to lowercase; SQL is parameterized.
- Safe destinations support public `/slug` anchors, `#section`, HTTPS without
  credentials, email and telephone links. Private/local reserved paths,
  executable/protocol-relative URLs and encoded local-route tricks are blocked.
- New-tab links use `noopener noreferrer`.
- `sanitize-html` uses a small parser-based allowlist: paragraphs/headings,
  emphasis, lists and safe links. Scripts, event handlers, styles, SVG, images,
  forms, objects and iframes are not allowed.
- Sanitization applies before preview/save and again for public rendering.
  Other text is HTML-escaped.
- Public scripts are static trusted source, never interpolated subscriber JavaScript.
- Image ownership is enforced by session checks and composite database FKs.
- No licence, immutable slug, private-admin entry or session-isolation behavior changed.

## 9. Tenant-isolation verification

Owned ACTIVE subscriber A and TRIAL subscriber B were used. Verified:
- A cannot select B via query, path, outer/nested body injection.
- A cannot assign, edit, reorder or delete B items, including cross-item-type IDs.
- A cannot use or delete B images.
- Database FKs independently reject cross-owner asset updates.
- Authenticated A sees only B's public site when visiting B; private session stays A.
- Rejected requests/conflicts leave B's configuration unchanged.
- Public model omits internal subscriber/account identifiers.

All isolated test accounts, configurations and public media were removed.
Fingerprints confirmed original business, slug, account, settings, licence and
CMS/media records remained unchanged.

## 10. Regression results

| Check | Result |
|---|---|
| Root workspace type check | PASS |
| Final API type check | PASS |
| `pnpm build:bhru` | PASS |
| Development migration and repeat run | PASS |
| `scripts/test-public-slugs.mjs` | 17 PASS groups |
| `scripts/test-public-sites.mjs` | 11 PASS groups |
| `scripts/test-public-website-cms.mjs` | 12 PASS groups |
| `scripts/test-public-media-storage.mjs` | 4 PASS groups |
| `scripts/test-public-presentation.mjs` | 13 PASS groups |

Total: 57 regression groups.

Browser: author → unsaved preview → joint Save → full reload → public rendering
passed. Tested ordering, disable/enable, cancel/confirm deletion, Reset,
temporary upload cleanup, sanitization and Desktop/Mobile preview.
375px, 390px and 430px layouts had no page-level horizontal overflow.

Mobile menu Escape/X/backdrop/navigation closing and scroll lock worked.
The Top Area inert extension and keyboard motion control were verified.
Autoplay and its counter passed a foreground, normal-motion, unhovered/unfocused
3.5-second check using the visible slide; an earlier check incorrectly inspected
the first DOM image rather than the active slide.

Existing non-blocking Vite chunk/sourcemap and hidden dashboard-chart sizing
warnings were not treated as new feature failures or used to expand scope.

## 11. Development/Preview access

Sign in with your existing eligible subscriber:

`https://500c17b3-5bef-4287-8413-0a19c8ff5e92-00-2x60bdsaklmmr.riker.replit.dev/login`

Open:

`https://500c17b3-5bef-4287-8413-0a19c8ff5e92-00-2x60bdsaklmmr.riker.replit.dev/m/cms-blog-public-website`

Or use CMS / Blog → Public Website. Use Desktop/Mobile Live Preview for
unsaved changes; after Save, use Open Website for your actual public slug.
The production target format remains `https://bhru.net/{public_slug}`.

Screenshots used isolated QA content, including test-colour PNGs rather than
real subscriber banners. Their accounts/URLs were removed after verification.
The saved iPhone-sized screenshot is
`screenshots/bhru-cms-phase2-public-iphone.jpg`.

## 12. Later production actions — NOT performed

Only after approval:
1. Back up the existing production PostgreSQL database and persistent media.
2. Build/review a runtime containing migration 006; an older healthy container
   lacking that file cannot apply it.
3. Execute the existing migration procedure against the existing production
   `DATABASE_URL`. In a reviewed runtime container carrying 006 and the current
   production environment, the existing procedure is
   `cd /app && node migrate.mjs`. Verify the 006 ledger entry before rollout.
   Do not reset, seed, recreate or drop anything.
4. Retain/verify the existing persistent media setup from `BHRU_PUBLIC_MEDIA.md`:
   named volume `bhru-public-media` (actual Dokploy-qualified name if applicable),
   read/write container mount `/var/lib/bhru/public-media`,
   `BHRU_MEDIA_DIR=/var/lib/bhru/public-media`, UID/GID `1000:1000`,
   directory mode `700`, regular `.bhru-persistent-media` marker mode `600`.
   Environment path and mount target must match; do not substitute an unmounted
   container directory or hardcoded VPS host path.
5. Keep existing `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`,
   `PLATFORM_ADMIN_PATH` and other existing deployment configuration. This phase
   introduces no new required environment variables.

No production migration, mount initialization, Git push or deployment is authorized
or performed by this implementation. Await approval before any further phase.
