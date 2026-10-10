# BHRU Slice 7A — implementation and operating report

## 1. Existing architecture discovered

Canonical BHRU services/groups, USD catalog pricing, customer/group overrides,
Slice 6B access policies, wallets/immutable ledgers and service orders are retained.
Reseller, customer and Platform Admin authentication remain separate.
The complete protocol comparison and exact reference-file inventory are in
`BHRU_EXTERNAL_PROVIDERS_AUDIT.md`. All three uploaded official archives were
extracted and read as text; no reference executable or example order was run.

## 2. Migration

`lib/db/src/migrations/032_external_provider_foundation.sql` is additive.
The repository was inspected: 031 was the last existing migration.
001–031 were not modified. 032 was applied with the existing migration runner only
after the API connection fingerprint matched Replit's development DB fingerprint.
No production database was accessed. There is no financial backfill.

## 3. Tables, constraints and indexes

- `external_providers`: tenant, protocol, encrypted credential envelope,
  connection version/state, last tested balance/currency and import policies.
- `external_provider_jobs`: initiator, kind, state, attempts, timestamps,
  correlation ID, counters and fenced lease; claim/history indexes and a partial
  unique index prevent multiple pending jobs for one provider.
- `external_provider_catalog`: normalized staged source snapshots/hash,
  previous snapshot, change labels, review reasons and missing/availability;
  unique tenant/provider/upstream ID and browse indexes.
- `external_provider_service_links`: canonical service association and imported
  cost/currency/FX/hash; uniqueness protects duplicate canonical imports.
- Composite foreign keys protect tenant/provider/catalog/service associations.
- `manual_services.fulfillment_source`: defaults to `manual` for existing rows.
  External source must stay inactive. A trigger prevents changing source identity,
  including attempts to relabel an external service as manual.

## 4. Protocols

| Protocol | Status | Authentication/verified contract |
|---|---|---|
| Fusion Pro REST Reseller API | IMPLEMENTED AND TESTED with mocks; live NOT TESTED | HTTPS `/api/reseller/v1`, Bearer token; GET `/account` and GET `/products` only; HTTP plus `status`/`code` envelope validation |
| Legacy DHRU Fusion API | NOT IMPLEMENTED; clearly unavailable | POST username/apiaccesskey/action/base64 JSON parameters; separate SUCCESS/ERROR contract |
| Fusion Pro Simple API Request Listener | NOT IMPLEMENTED; clearly unavailable | Custom actions and api_key contract; examples include disabled/demo authentication and must not be treated as REST |

There is no dispatch adapter, POST `/order`, callback handler or paid-order code path.

## 5. Authentication and encryption

Provider endpoints derive the tenant from the authorized reseller session.
Customer/admin sessions cannot substitute for reseller authentication. Browser-supplied
tenant IDs confer no authority. Existing CSRF checks and bounded rate limits apply.

AES-256-GCM uses a random 12-byte IV and authenticated tenant/provider identity.
Stored envelopes include version/key-version metadata, IV, authentication tag and
ciphertext. Responses expose only credential-present state, not tokens/envelopes.
Credential fields are masked/write-only and are not saved in browser storage.
Missing/invalid encryption configuration fails closed; no fallback to other keys.

Required environment:

- Existing `DATABASE_URL`: the intended environment's PostgreSQL database.
- Existing `SESSION_SECRET`: unchanged authentication configuration.
- `BHRU_PROVIDER_ENCRYPTION_KEY_V1`: one persistent 32-byte key encoded as base64,
  independently supplied through the secrets system. It is not a provider API token.
  Keep it backed up securely and stable across restarts/replicas.

Do not overwrite/regenerate V1 when credentials already exist. Losing it makes
saved tokens undecryptable. Automatic key rotation/re-encryption is NOT IMPLEMENTED;
the envelope is versioned for a separately reviewed future rotation procedure.
Production configuration was not inspected or changed.

## 6. SSRF guarantees

HTTPS/443 only; exact REST base path; no URL user-info, query/hash, internal hostnames
or unsafe IP ranges. All returned DNS addresses must be public; mixed public/private
answers fail closed. The HTTPS socket's custom lookup pins the validated address,
not a second ordinary DNS resolution. Original hostname SNI/certificate checking
remains enabled. No redirects, proxy forwarding or arbitrary method/path selection.

DNS deadline: 5 seconds. HTTP deadline: 20 seconds. JSON body maximum: 8 MiB.
Only identity-encoded JSON is accepted. Upstream body/token/auth headers are not
copied into safe errors or history. Public hosts can still be malicious: bounds,
strict response validation and inert staging protect downstream import; live
provider compatibility is not claimed.

## 7. Backend endpoints

Existing `/api` routing/authorization conventions:

- GET/POST `/external-providers`: list/create.
- POST `/external-providers/test`: authorized unsaved draft account test.
- PATCH `/external-providers/:id`: edit, replace token, enable/disable.
- POST/GET `/external-providers/:id/jobs`: enqueue saved TEST/SYNC and paginated history.
- GET `/external-providers/:id/catalog`: paginated search/type/category/change filtering.
- PUT `/external-providers/:id/pricing`: policies for future imports, not bulk repricing.
- POST `/external-providers/:id/preview`: exact server-calculated import preview.
- POST `/external-providers/:id/import`: atomic confirmation-hash-checked canonical import.

Existing audit logs record configuration, test/sync requests and imports without tokens.

## 8. Frontend

Test manually in Replit Preview as a reseller:
**Settings → API Settings**, route `/m/api-settings`.

Add provider with its real public HTTPS base URL ending `/api/reseller/v1` and Bearer
token. Saved connections start `NOT_TESTED`, not fake Connected. Test, edit/replace,
disable/enable, sync, history, pricing and staged import are implemented.
Legacy/Simple choices are visibly unavailable. Polling reads durable job states;
catalog tables paginate instead of rendering thousands of rows at once.
Select individual/category-filtered/type-filtered/all-matching services, rename,
select/create a canonical group, preview pricing and explicitly confirm import.
Limits are visible; unsupported/missing/disabled/already-linked entries cannot be selected.
Theme integration uses existing components; no global CSS scaling was introduced.

Status: IMPLEMENTED BUT NOT TESTED in an authenticated browser. Frontend type/build
checks passed. The preview health screenshot is not a signed-in UI acceptance test.

## 9. Synchronization/history

Jobs persist before execution. The normal API process starts a 3-second worker loop.
PostgreSQL row locks and SKIP LOCKED enforce one running job per tenant and a unique
pending job per provider, across replicas. At most 10 pending jobs per tenant;
four attempts maximum, bounded exponential backoff/jitter and 90-second fenced leases.
Expired leases can be reclaimed after restart; stale workers cannot finalize them.
Configuration changes/disable prevent stale reads from being committed.

A successful, fully validated catalog is atomically staged; duplicates do not create
extra records. Cost, name, category, field/constraint fingerprints, availability,
type, currency and estimate changes are detected. Missing is set only after a
complete successful catalog. Errors/unsupported pagination preserve prior staging.
Staging never automatically reprices, changes inputs of, disables or deletes linked
canonical services. History tracks initiator, start/completion, state, counts,
safe error and job ID; statuses are QUEUED/RUNNING/COMPLETED/
COMPLETED_WITH_WARNINGS/FAILED.

## 10. Exact pricing/import

Upstream cost remains separate from retail selling price. USD uses integer 10^12
units; configured currency rates use existing 10^6 units-per-USD and deterministic
round-half-up. Non-USD cost pricing requires an enabled configured currency rate
and explicit USD reference. Missing FX blocks pricing, never guesses a rate.

Initial retail price = converted USD cost × (1 + percentage / 100) + fixed USD amount.
Preview shows source currency/cost, FX assumption, converted USD, proposed price,
margin, existing selling price and optional existing-client-group prices.
Customer account FX still runs only in BHRU's existing pricing/order engine.

Import is one transaction; stale preview hashes fail. Canonical pricing locks and
unique link constraints serialize concurrent imports; retries skip already linked
services without changing them. New group rules use existing Slice 6A tables.
Existing customer override > active group rule > standard precedence is unchanged.
Imported services remain inactive and cannot be enabled through ordinary editing
or SQL source relabeling; manual services remain enabled/orderable as before.

## 11. Focused verification

25 focused checks passed, including:

- Real PostgreSQL/HTTP tenant isolation, valid reseller sessions, customer/admin
  denial, CSRF and no plaintext credentials in responses.
- Mocked account/catalog contracts, HTTP-200 error envelopes, authentication errors,
  malformed/non-JSON/oversized results, private/mixed DNS, pinned TLS lookup,
  blocked redirects, timeout, safe network errors and missing-key fail-closed.
- Exact costs/markup/FX, unsupported fields/types, null availability, missing FX.
- Initial/repeated/changed/missing catalog, partial failure preserving prior state.
- Actual durable worker success/failure/history, retries, disable/config protection,
  competing PostgreSQL claims, lease recovery and stale-worker fencing.
- Atomic inactive import, repeated import and concurrent HTTP duplicate prevention.
- Customer/group/standard precedence, local price preservation after source sync.
- Wallet/ledger/service-order/Retail/pricing/access table digests unchanged after
  fixture transactions; disposable test tenant/provider/service/session/audit rows removed.

Commands passed:

```text
pnpm -w run typecheck:libs
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/bhru run typecheck
pnpm --filter @workspace/bhru run build
BHRU_TEST_DB_FINGERPRINT=<freshly-verified-development-fingerprint> node scripts/test-external-providers.mjs
```

The script checks DB identity and refuses NODE_ENV=production. Obtain a fresh
fingerprint through both Replit development DB tooling and the API connection
before running; do not blindly reuse an old fingerprint or production connection.
The fingerprint compares database name/OID, PostgreSQL start time and migration
ledger checksum. No actual provider was contacted. No E2E/browser/full suite ran.
Frontend build emitted existing sourcemap/chunk-size warnings but completed.

## 12. Preserved behavior

No changes to authentication/private admin entry, tenant eligibility, wallets,
financial calculations, currency rules, checkout/order transitions, refund logic,
Retail/E-Commerce, public templates, CMS, Top Area, domains or media storage.
The sole canonical-catalog addition is the immutable source/inactive import gate.

## 13. Configuration status

Development provider encryption configuration is supplied and functional.
No development configuration blocker remains. Production requirements are documented,
but production secrets/migrations/worker operation are NOT TESTED and not changed.
An actual authorized provider account/catalog connection is NOT TESTED.

## 14. Limits

- Only the verified Fusion Pro REST read-only contract is implemented.
- Maximum validated upstream catalog: 20,000 services, 8 MiB; no invented pagination
  contract. Pagination markers fail closed instead of declaring missing services.
- Import batch maximum: 500; process larger catalogs in explicit batches.
- Controlled fields only, maximum 12 per service. Unknown constraints/types need
  review and are blocked from import, never silently downgraded.
- Numeric money lexemes are preserved before JSON parsing; unsupported exponent,
  negative, over-precision/oversized money fails validation.
- Explicit disabled upstream services are excluded; unspecified availability stays
  unknown, not fabricated. All imported external services are inactive regardless.
- Sync does not perform automated bulk retail repricing or overwrite existing rules.
- No automatic encryption-key rotation, live-provider verification or browser QA.

## 15. Slice 7B boundary

NOT IMPLEMENTED: paid dispatch, POST /order, callbacks, provider order retries,
completion/rejection automation, provider-driven refunds and reconciliation.
These require separately approved verified contracts, dispatch idempotency,
signed/verified callback strategy and auditable order/money handling.
Slice 7A deliberately cannot place an upstream paid order.

## Changed application/test files

- `lib/db/src/migrations/032_external_provider_foundation.sql`
- `artifacts/api-server/src/lib/providers/{credentials,transport,adapter,connections,worker,import}.ts`
- `artifacts/api-server/src/routes/external-providers.ts`
- `artifacts/api-server/src/{index.ts,routes/index.ts,lib/client-finance/catalog.ts}`
- `artifacts/bhru/src/pages/{external-providers,module}.tsx`
- `artifacts/bhru/src/hooks/use-external-providers.ts`
- `artifacts/bhru/src/components/subscriber/ProviderCatalog.tsx`
- `lib/api-spec/openapi.yaml`
- Generated provider React Query/TypeScript/Zod files in `lib/api-client-react`
  and `lib/api-zod`, plus the established explicit-export collision fix in
  `lib/api-zod/src/index.ts`.
- `scripts/test-external-providers.mjs`
- `scripts/lib/provider-transport-mock.mjs`
- `BHRU_EXTERNAL_PROVIDERS_AUDIT.md`, this report.

No commit, push, force-push, publish/deploy or VPS/Dokploy access was performed.
