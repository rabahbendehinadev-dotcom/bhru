# BHRU customer client panel

## Identity and routes

This is the existing public-customer authentication realm, not subscriber or
Platform Admin authentication. Existing tenant-bound sessions are reused.

Successful login opens `/{public_slug}/customer/dashboard` on a shared BHRU
host and `/customer/dashboard` on the reseller's active verified custom domain.
The client remains on the current origin. No platform hostname is hardcoded.

Authenticated pages beneath that same customer prefix:
`dashboard`, `services`, `orders`, `wallet`, `transactions`, `announcements`,
`profile`, `security`. The legacy `account` path remains a working dashboard alias.
Unauthenticated visitors are redirected to the matching reseller login page.

The authenticated header replaces public marketing links with client navigation,
an account menu, logout and a link back to the public website. Public content and
unauthenticated navigation remain unchanged. Mobile navigation reuses the existing
overlay, backdrop, focus handling, Escape handling and body-scroll lock.

## Financial and order data

Dashboard, Wallet and Transactions use the canonical customer wallet and immutable
ledger. Values use the customer's fixed account currency, not browser preferences
or a newly selected storefront currency. No editable currency control is added.

Financial cards: Available Balance, Locked Balance, Due / Credit, Total Spent,
Total Credits / Added Funds. The current prepaid model has no borrowing facility:
Due / Credit is the server's actual zero value, not simulated credit.

Service counts: Total, Pending, Processing, Completed, Rejected.
Recent orders use the canonical service order snapshots with reference, service,
charged amount/currency, status and date. Retail is not included in these totals.

Services reuse the manual catalog, existing server quotes, atomic wallet charging,
idempotent placement and exact snapshot refunds. No browser-calculated price is
authoritative. Requirement fields and service/order lifecycle are unchanged.

## Group availability

Migration `024_service_group_availability.sql` adds only
`manual_service_groups.enabled`, defaulting to true for existing groups.
It does not modify customer, wallet, ledger, price or order records.

The reseller's existing service edit/create form has a **Group available to
customers** control for the selected group. This changes the shared group
immediately, not just the service currently being edited. Customer service lists,
group filters, detail and quote/order APIs all exclude unavailable groups.

`PATCH /api/service-groups/{id}` accepts `{ "enabled": true|false }` and is bound to
the authenticated subscriber. Purchase locks the service and its group in the
same existing order transaction; group withdrawal cannot bypass an order's final
server availability check.

Apply the existing migration procedure only to the explicitly verified intended
database. Preview migrations are not production migrations.

## Announcements

Client announcements reuse the subscriber's enabled `public_site_announcements`
CMS rows and the parent `announcements_enabled` setting. They are tenant-scoped,
ordered by the existing CMS display order, and links use the existing safe
presentation-link validator. The dashboard shows the first three current
messages; Announcements shows all current messages.

The existing CMS does not store announcement publication dates or an archive.
This phase does not invent dates, create a second CMS or expose other tenants'
messages. It does not provide historical announcements after deletion/editing.

## Profile, Security and funding boundaries

Profile displays the canonical customer details and immutable account currency.
Security displays authenticated identity/security guidance and working logout.
Password change/reset, multi-factor authentication and session management are
not added in this phase; no fake controls are shown.

**Add Funds** opens the wallet's reseller-assisted funding instructions. There is
no payment gateway or online payment endpoint, and the client cannot credit their
own wallet. Existing reseller credit operations remain authoritative.

## Manual Preview review

1. Open the reseller's existing public Login route in Replit Preview.
2. Log in as an active public customer; confirm Dashboard opens directly.
3. Visit all eight panel pages and the legacy Account path.
4. Review zero balance and funded wallet/order data in account currency.
5. Open the mobile menu, navigate, reopen it, dismiss with backdrop/Escape.
6. Use Services to quote/order normally; inspect My Orders and statement entries.
7. On the reseller service editor, disable a selected group and confirm its
   services disappear and saved detail links cannot order it.
8. Enable/disable current CMS announcements and confirm the client panel updates.
9. Verify Public website and Logout links preserve the reseller origin.

Production deployment, production data and Git pushes are outside this phase.

## Verification results

- 47 focused SQL/HTTP test groups pass, including existing authentication,
  wallet atomicity, exact refunds, immutable currency and retail-isolation checks.
- New checks cover all eight authenticated routes, login destination, Account
  compatibility, custom-domain origins, tenant-scoped enabled announcements and
  disabled-group list/detail/quote/order rejection without a wallet mutation.
- API TypeScript, shared-library TypeScript, API build and frontend build pass.
- Frontend TypeScript still reports the pre-existing
  `artifacts/bhru/src/pages/ecommerce.tsx:416` error; that file is untouched.
- One focused browser journey passed real registration/CAPTCHA, login, eight
  pages, legacy Account alias, logout and mobile drawer interactions. No failed
  panel API calls or JavaScript errors were observed.
- No horizontal page overflow at 1280px desktop or 375px, 390px and 430px mobile.
- The Services screenshot showed the existing loading skeleton while the
  accessible page state reported the genuine empty-services message; persistence
  was not rechecked. An unidentified registration resource returned a
  non-blocking 404; its source was not determined in this focused journey.

The browser used the existing synthetic development reseller at
`/verificatione5e9d061a9962/customer/register`. A newly registered synthetic
customer has an actual zero balance and no financial/order mutations.

## Feature files changed (24)

```text
BHRU_CLIENT_PANEL.md
artifacts/api-server/src/index.ts
artifacts/api-server/src/lib/client-finance/catalog.ts
artifacts/api-server/src/lib/commerce/storefront-header.ts
artifacts/api-server/src/lib/customer-auth/announcements.ts
artifacts/api-server/src/lib/customer-auth/client-header.ts
artifacts/api-server/src/lib/customer-auth/context.ts
artifacts/api-server/src/lib/customer-auth/links.ts
artifacts/api-server/src/lib/customer-auth/panel-ui.ts
artifacts/api-server/src/lib/customer-auth/ui.ts
artifacts/api-server/src/lib/public-site/components/header.ts
artifacts/api-server/src/routes/client-finance.ts
artifacts/api-server/src/routes/customer-panel.ts
artifacts/bhru/src/hooks/use-services.ts
artifacts/bhru/src/pages/manual-services.tsx
lib/api-client-react/src/generated/api.schemas.ts
lib/api-client-react/src/generated/api.ts
lib/api-spec/openapi.yaml
lib/api-zod/src/generated/api.ts
lib/api-zod/src/generated/types/index.ts
lib/api-zod/src/generated/types/serviceGroupAvailability.ts
lib/db/src/migrations/024_service_group_availability.sql
scripts/test-customer-panel.mjs
scripts/test-public-customer-onboarding.mjs
```
