# Subscriber Public Slug Foundation — Phase 1

Phase 1 stores the immutable public URL identifier on the existing subscriber.
It does not serve public websites or change authentication, subscriptions,
licences, the panel, CMS or custom-domain behavior.

## Data and allocation

- `subscribers.public_slug`: non-null, unique, lowercase ASCII, at most 63
  characters; alphanumeric groups may be separated by single hyphens.
- The original business name is retained verbatim by backfill.
- NFKD normalization removes accents and punctuation/spacing; explicit mappings
  cover Latin characters that do not decompose (`ß`, `æ`, `œ`, `ø`, `ł`, `đ`,
  `ð`, `þ`). Numbers are retained.
- Empty, non-Latin-only and reserved bases become `business-` plus a stable
  twelve-character MD5 token derived from the existing UUID. This is an opaque
  naming fallback, not a credential or a second subscriber identity.
- Duplicates receive numeric suffixes starting at `-2`; truncation leaves room
  for the suffix within 63 characters.
- Application/static route roots and the current private admin entry are
  excluded case-insensitively. Every candidate, including numeric suffixes,
  is checked.
- The shared PostgreSQL functions in migration 004 are used by both backfill
  and registration. A unique-index conflict retries the next candidate.
  Other database failures still abort the registration transaction.
- Database triggers reject changing or removing an assigned slug, including
  direct SQL updates. Business/company edits do not regenerate it.

The eventual URL is `https://bhru.net/{public_slug}`. Phase 1 deliberately
does not introduce a slug route or public API.

## Migration procedure

Use the existing explicit, checksummed SQL migration runner. Never schema-push,
edit an applied migration, or automatically run migrations at server startup.

Migration 004 requires the existing `PLATFORM_ADMIN_PATH` environment
configuration so backfill can reserve it. The runner supplies it as a
transaction-local parameter; it is not written into source or logged.

Pause registration writes before applying this migration and keep them paused
until the updated API is running. The old registration handler does not supply
the new non-null field. In this Development run, the managed API workflow was
paused, the migration applied, and the updated workflow restarted.

The migration takes a subscriber-table lock, assigns missing slugs in
`created_at, id` order, verifies uniqueness through the index, enforces NOT NULL,
and installs immutability protection in one transaction. Failure rolls everything
back. Existing IDs, names, domains, settings and subscriptions are untouched.

API startup refuses a configured private-entry/public-slug collision without
changing the private URL or administrator authentication.

## Verification

Run `node scripts/test-public-slugs.mjs` in Development for repeatable database,
registration, isolation, authentication and route regression checks. It creates
uniquely marked fixtures, compares pre-existing data fingerprints and deletes
only its own test records. Credentials are generated in memory, never printed.

For the one-time real legacy-backfill verification, run the same script with
`--seed` **before** applying migration 004, then run it normally after the updated
API starts. It seeds duplicate, reserved, Arabic, punctuation-only and empty-name
legacy fixtures. The seed mode intentionally refuses an already-migrated schema.

If interrupted, inspect the failure and run `--cleanup` to remove the uniquely
owned fixtures recorded in `/tmp/bhru-public-slug-verification.json`.

Review this phase in Development Preview. No push or deployment is authorized.
