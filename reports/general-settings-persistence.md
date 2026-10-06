# General Settings persistence contract

## Ownership and scope

One subscriber = one business/unlock server = one website = one subscription.
The dedicated `subscriber_general_settings` record belongs to `subscribers.id`
through a unique, non-null `subscriber_id` foreign key. Its UUID primary key
identifies the settings record only; it is not a new server/tenant identity.

Migration `003_subscriber_general_settings.sql` adds the table and initialises
all existing subscribers. New registrations initialise it in the same existing
transaction as the account/subscription. No subscriber identity, domain,
subscription, licence or ownership row is rewritten.

## Defaults and empty values

- All 21 booleans default to `false`, matching the UI's disabled switches.
- All text defaults to the empty string. No business name, company, site,
  logo, URL, SEO text or redirect is invented or copied from another field.
- `page_title_format` is blank initially (the current "Select format" UI);
  the only configured selection in this phase is `Default`.
- The three monetary limits are nullable `numeric(18,2)`: unset is `null`,
  displayed as a blank input. Zero is a distinct, permitted value.
- Non-money fields accept explicit empty strings, not null. PUT is a complete
  replacement of all 35 configuration fields; omitted or unexpected fields
  are rejected.

## API and authorization

`GET /api/settings/general` reads the current subscriber's configuration.
`PUT /api/settings/general` persists a complete validated configuration and
returns the committed values and timestamps.

Neither endpoint accepts a target subscriber ID. The backend resolves ownership
from the authenticated subscriber account/session, rejects query parameters and
extra JSON properties, and reuses existing tenant authorization and panel licence
eligibility. A subscription row lock keeps eligibility stable during the read or
update. Mutations retain the existing CSRF and same-origin protections.

These are subscriber-only endpoints. Administrator preview does not acquire new
write privileges; the General Settings form explicitly remains read-only there.
No administrator authentication/permission architecture was changed.

## Validation

Generated OpenAPI/Zod schemas enforce required fields, strict types, field
lengths, booleans, the title-format enum and exact decimal strings. URL fields
must be empty or absolute HTTP/HTTPS URLs without whitespace or embedded
credentials; Site SSL Link permits HTTPS only. Redirects are inert bounded text
and cannot contain control characters. Decimal strings have up to 16 integer
digits and two fractional digits; numbers, exponents, negatives, excessive
precision and malformed values are rejected. Min/max comparisons use BigInt
cents, not floating-point arithmetic. PostgreSQL also enforces nonnegative
limits and minimum <= maximum when both are set.

## UI and state

The existing layout/labels are retained. Loading and saving disable the form.
Only a successful persisted response shows a success message. Failed loads
offer Retry; failed saves retain the draft. Drafts stay in the mounted workspace
tab, not localStorage or the PWA cache. Closing/reopening or reloading fetches
persisted values. Clean forms refresh on activation/focus and periodically;
dirty forms are not overwritten by background reads. Identity changes clear
the form and invalidate late responses.

Concurrent complete saves by different sessions currently use last-write-wins;
this phase does not add collaborative editing or optimistic version conflicts.

## Explicit exclusions

The saved site links do not update `subscribers.domain`, resolve hosts or
provision domains/DNS/SSL. Redirect strings do not cause redirects. Saved module
switches do not implement modules. Saved fund rules do not process payments.
No multi-server model, slug, new authentication system or schema push is added.

## Verification

`scripts/test-general-settings-persistence.mjs` verifies real Development
registration/login, eligibility, independent A/B settings, exact money, strict
validation, manipulated IDs, anonymous/admin realm rejection, unchanged
business/domain/ownership data and database constraints. Browser verification
covers save/reload/reopen, independent accounts, error retention, workspace tabs
and the existing dashboard. Test identities/plans are clearly labelled
verification-only, retained rather than deleting data, and disabled/suspended
after verification.

### Development verification result

- All 11 API/database verification groups passed with two real independent
  subscriber accounts. Both directions of manipulated-ID isolation were checked.
- Real browser saves/reloads passed for A and B. A remained unchanged after B's
  save. Company/site edits did not rename the header's business identity.
- The exact balance `9007199254740993.01` survived input rendering, save and reload.
- Workspace draft retention, close/reopen, validation-error retention and a
  simulated failed network save passed. No success was shown on failed saves.
- Mobile controls remained at least 44px with no horizontal overflow; existing
  light/dark themes were retained.
- Existing subscriber login/dashboard were browser-verified. Independent
  administrator login/state, plan creation and subscriber approval were
  API-verified; the unchanged private administrator UI was not browser-tested.
- Whole-workspace type checking, API/frontend builds, layout contract,
  navigation contract and workspace model tests passed.
- Verification accounts were suspended, temporary plan/admin disabled, private
  fixture file removed and test sessions revoked; settings/account rows retained.

### Files created or changed

- `lib/db/src/migrations/003_subscriber_general_settings.sql`
- `lib/api-spec/openapi.yaml` and its generated client/Zod outputs
- `artifacts/api-server/src/lib/general-settings.ts`
- `artifacts/api-server/src/routes/general-settings.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/routes/auth.ts` (one transactional settings insert)
- `artifacts/api-server/src/lib/platform.ts` (optional transaction client for
  existing subscriber/eligibility lookup)
- `artifacts/bhru/src/hooks/use-general-settings.ts`
- `artifacts/bhru/src/pages/general-settings.tsx`
- `artifacts/bhru/src/lib/store.ts`
- `artifacts/bhru/scripts/test-general-settings.mjs`
- `scripts/test-general-settings-persistence.mjs`
- This persistence report
- Project memory updated to record the user's approved ownership/phase boundary
