# BHRU Public Customer Authentication — Phase 1

## Architecture found

- Subscriber owners use `/login`, `/register`, `account_users` and `sessions`.
- Platform administrators use their independent private entry, users and sessions.
- The standard public website and CMS preview previously rendered a hardcoded
  Login anchor opening `#customer-access`.
- The E-Commerce header previously rendered Login/Register buttons opening an
  unavailable-feature dialog.
- Public slug resolution already validates reserved paths and existing subscriber
  eligibility. Custom hosts already require verified DNS, TLS and current evidence.
- E-Commerce Customers is an order-contact projection grouped by phone number,
  not a persisted customer/account entity. Orders preserve guest customer snapshots.

None of the owner/admin authentication procedures, domain verification or TLS
infrastructure, currency operations, provider integrations, order creation or guest
checkout procedures is changed by this phase.

## Customer data model

Additive migration: `019_public_customer_auth.sql`.

- `public_customer_accounts`: UUID, subscriber ownership, first/last name,
  normalized email, scrypt password hash, enabled state and creation timestamp.
- Unique `(subscriber_id,email)` allows the same email under different subscribers.
- `public_customer_sessions`: SHA-256 token hash, subscriber ownership, customer
  reference and seven-day expiry. A composite foreign key guarantees that a
  session cannot reference a different subscriber's customer.
- No plaintext passwords, confirmation passwords or raw session tokens are stored.
- No seed/backfill or manual per-subscriber initialization is required.
- Passwords are 8–128 characters; names are trimmed and 1–100 characters; email
  is trimmed/lowercased and validated server-side. Extra body fields are rejected.
- Password confirmation is checked server-side, not just by the form.

Registration always returns the same `201` message and sign-in destination for
both new and existing emails. It does not overwrite an existing account or create
a session for a duplicate registration. The customer then signs in using their
actual password. This avoids an explicit account-existence response and prevents
someone registering an existing address from gaining its session.

## Exact routes

On the platform host:

| Purpose | Route |
| --- | --- |
| Customer login page | `https://bhru.net/{slug}/customer/login` |
| Customer registration page | `https://bhru.net/{slug}/customer/register` |
| Protected customer account page | `https://bhru.net/{slug}/customer/account` |

On a verified custom host:

| Purpose | Route |
| --- | --- |
| Customer login page | `https://{custom-host}/customer/login` |
| Customer registration page | `https://{custom-host}/customer/register` |
| Protected customer account page | `https://{custom-host}/customer/account` |

All JSON endpoints are same-origin on whichever host the customer is visiting:

| Method | Endpoint |
| --- | --- |
| POST | `/api/public/customer/{slug}/register` |
| POST | `/api/public/customer/{slug}/login` |
| POST | `/api/public/customer/{slug}/logout` |
| GET | `/api/public/customer/{slug}/session` |

Logout is a POST action, not a state-changing GET page.
Registration redirects to the customer login page with `?registered=1`; successful
login redirects to that site's customer account page; logout returns to its homepage.
No browser-supplied return URL or tenant ID is accepted.

## Tenant resolution and authorization

### Platform URL

The original `Host` must be a configured platform host (or the existing permitted
development hosts). The slug must be a valid public slug, not an owner/admin/private
namespace. The existing public document resolver checks the subscriber's existing
public-site eligibility before accounts or sessions are used. Account lookup,
registration, session lookup and deletion all use that server-resolved subscriber.

### Custom domain

The original `Host` is normalized and looked up in the existing
`subscriber_custom_domains` mapping. The existing `domainActive` predicate requires
verified DNS, ready TLS and current DNS evidence. Its subscriber's immutable slug
is then passed through the same public eligibility check. An API slug must match
this host's slug; it cannot select another subscriber.

`X-Forwarded-Host`, tenant IDs in request bodies, and tenant-selection headers are
not used. Unverified, inactive, expired-evidence or unrelated hosts are rejected.
Customer routes run before the existing custom-host firewall so that the domain
infrastructure itself does not need a new route exception. All generated customer
page links and redirects stay on the current custom domain.

## Sessions and request protection

- Cookie name: `bhru_customer_{slug}`. Different subscribers do not overwrite each
  other's cookies on `bhru.net`.
- Host-only: **no Domain attribute**. A platform session is not automatically
  shared with a custom domain or with another custom hostname.
- `Path=/` lets both the public site and its same-origin customer API receive it.
- `HttpOnly`, `SameSite=Lax`, and **Secure in production**.
- Seven-day expiry. Login rotates the current valid customer session; logout
  revokes it and clears only that subscriber's customer cookie.
- Signed using the existing required `SESSION_SECRET`, but with a distinct
  `public-customer` realm and subscriber binding. Owner/admin cookies and token
  signatures are never accepted as customer authentication.
- Mutations require JSON and `X-BHRU-Customer-Request: 1`, enforce same-origin
  Origin when provided, and reject cross-site Fetch Metadata. No cross-origin
  customer API permission is added.
- Login/register use rate limits. Wrong password, nonexistent address, wrong
  tenant and disabled account all return generic invalid-login responses.
- Session/account pages are no-store and scoped to Host/Cookie. Tokens/hashes and
  internal account/subscriber IDs are not included in customer HTML/API profiles.
- Inline scripts have exact CSP hashes; no arbitrary inline/eval permission is
  added. The auth forms require JavaScript, use POST, and never put passwords in
  URL parameters. Returning from browser back/forward cache reloads auth state.

No new environment variable is required. Existing database, signing-secret,
platform-host, HTTPS reverse-proxy and custom-domain settings remain applicable.

## Header and preview behavior

Both public headers now use the same real customer actions:

- Logged out: **Login + Register**.
- Logged in: **My account + Logout**.
- Mobile menu includes the corresponding actions.
- CMS Live Preview deliberately renders the logged-out state, independent of
  subscriber-owner/admin cookies.
- Customer account displays only the authenticated customer's name and email.
- The obsolete customer-access notice/dialog is removed.

The Replit public document bridge forwards only public customer cookies, never
owner/admin cookies or authorization headers, and preserves the original Host.
It also passes through safe, relative customer-page redirects.

## Existing Customers and guest checkout

There is no existing stable customer entity to attach authentication to. This
phase creates one customer account per subscriber/email, not a duplicate CMS
customer management system. The existing Customers screen continues showing its
guest-order contact projection.

Historical orders are **not automatically claimed by matching an unverified email
or phone**. No guest contact data is imported, overwritten or associated with a
new account. Verified identity/order association and an account-aware Customers
view require a separately approved phase.

Guest checkout remains available exactly as before; customer registration/login
is not required for ordering. Cart, order, stock, currency and checkout procedures
are unchanged. Customer login does not clear the existing tenant-scoped cart.

## Migration procedure (not executed by this implementation)

Use the project's existing migration runner against the intended database after
the new code/migration is available in that environment:

```sh
pnpm --filter @workspace/api-server run db:migrate
```

In the project's packaged VPS image the equivalent existing runner is:

```sh
cd /app && node migrate.mjs
```

The runner tracks filenames/checksums, applies only pending migrations in a
transaction, and skips already-applied unchanged migrations. Do not manually
initialize subscribers or execute destructive database commands. Startup now
checks for these two new tables; a new version requires migration 019 first.
No migration was executed against the VPS by the implementation.

## Focused validation

```sh
node scripts/test-public-customer-auth.mjs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/bhru exec tsc --noEmit --skipLibCheck \
  --module esnext --moduleResolution bundler --target ES2022 \
  --types node public-site-preview.ts
pnpm --filter @workspace/bhru run build
```

The focused auth script uses real HTTP routes and real scrypt hashing with an
isolated in-memory database substitute. It does not run browser/E2E suites, issue
DNS requests, apply migrations or touch any real subscriber database.
It covers 32 focused groups: registration/duplicates/concurrency, normalization
and validation, same-email tenant isolation, generic failures, cookie security,
owner/admin-cookie rejection, own-account rendering/escaping, logged-out preview,
both public headers, verified and rejected custom hosts, current eligibility,
duplicate Host rejection, CSRF, session rotation/expiry/logout, rate limiting,
private-route fallthrough and additive migration constraints.

The full frontend TypeScript command also ran and found an existing unrelated
`ecommerce.tsx:402` incompatibility between `CommerceSettingsFields` and
`Record<string,unknown>`. The unchanged source and unchanged `CommerceInput`
definition were checked; the auth implementation does not modify that code.
The affected public bridge's focused TypeScript check and Vite build pass.

The actual BHRU database is on the user's VPS. Database-backed deployment/manual
verification must use that environment after the user applies migration 019.
Replit source-only builds and isolated technical tests do not prove live DB/TLS.

Final startup observation: the frontend workflow starts, but the Replit API exits
at the existing database/migration startup guard. The Preview therefore shows
`HTTP 502 Bad Gateway`, and the new customer pages cannot be accepted as live
database-backed flows there. This implementation does not bypass that guard or
connect/modify the user's VPS database to make a preview appear healthy.

## Files changed

New source:

- `artifacts/api-server/src/lib/customer-auth/context.ts`
- `artifacts/api-server/src/lib/customer-auth/links.ts`
- `artifacts/api-server/src/lib/customer-auth/service.ts`
- `artifacts/api-server/src/lib/customer-auth/session.ts`
- `artifacts/api-server/src/lib/customer-auth/types.ts`
- `artifacts/api-server/src/lib/customer-auth/ui.ts`
- `artifacts/api-server/src/routes/customer-auth.ts`
- `lib/db/src/migrations/019_public_customer_auth.sql`
- `scripts/test-public-customer-auth.mjs`
- `BHRU_PUBLIC_CUSTOMER_AUTH.md`

Existing source integrations:

- `artifacts/api-server/src/app.ts`
- `artifacts/api-server/src/index.ts`
- `artifacts/api-server/src/lib/public-site.ts`
- `artifacts/api-server/src/lib/public-site/model.ts`
- `artifacts/api-server/src/lib/public-site/homepage.ts`
- `artifacts/api-server/src/lib/public-site/components/header.ts`
- `artifacts/api-server/src/lib/public-site/components/cta.ts`
- `artifacts/api-server/src/lib/commerce/navigation.ts`
- `artifacts/api-server/src/lib/commerce/public-render.ts`
- `artifacts/api-server/src/lib/commerce/storefront-header.ts`
- `artifacts/api-server/src/lib/commerce/storefront-header-script.ts`
- `artifacts/api-server/src/routes/public-website.ts`
- `artifacts/bhru/public-site-preview.ts`
- `lib/api-spec/openapi.yaml`

Generated contracts from that specification:

- `lib/api-client-react/src/generated/api.ts`
- `lib/api-client-react/src/generated/api.schemas.ts`
- `lib/api-zod/src/generated/api.ts`
- `lib/api-zod/src/generated/types/index.ts`
- `lib/api-zod/src/generated/types/customerLoginInput.ts`
- `lib/api-zod/src/generated/types/customerLoginResult.ts`
- `lib/api-zod/src/generated/types/customerLogoutInput.ts`
- `lib/api-zod/src/generated/types/customerLogoutResult.ts`
- `lib/api-zod/src/generated/types/customerRegistrationInput.ts`
- `lib/api-zod/src/generated/types/customerRegistrationResult.ts`
- `lib/api-zod/src/generated/types/customerSessionView.ts`
- `lib/api-zod/src/generated/types/publicCustomerProfile.ts`

Project memory records the user-approved authentication boundary and the observed
Node Host-header forwarding constraint; those notes contain no account data.

## Remaining Phase 1 limitations

- No email verification, password recovery, MFA or automated email delivery yet.
- No historical-order claiming, customer order history or profile editing.
- Existing E-Commerce Customers remains the guest-order contact view.
- Logging in on `bhru.net` does not automatically log in on a custom domain:
  accounts are shared for that tenant, but host-only cookies require separate
  sign-in on each hostname.
- No large browser suite or real VPS/database acceptance test was run.

No push or deployment is part of this implementation.
