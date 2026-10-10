# BHRU Slice 7A.1 — DHRU Fusion Legacy v6.1

## Status and scope

IMPLEMENTED AND TESTED in Replit Preview with deterministic mocked upstream
responses, actual HTTP reseller sessions and actual development PostgreSQL.
No real provider was contacted. Mocked success does not prove a real account is
connected. Signed-in browser acceptance is IMPLEMENTED BUT NOT TESTED.
No paid upstream action, dispatch, callback, refund, production access, commit,
push or deployment was performed.

## 1. Official reference inspected

Archive: `attached_assets/dhru-fusion-api-standards-master_1791591349028.zip`.
Inspected ZIP inventory and the complete contents of:

- `dhru-fusion-api-standards-master/README.md`
- `dhru-fusion-api-standards-master/api/index.php`

The README identifies v6.1 and six actions. The PHP reference documents account
and catalog envelopes, quantities, `Requires.*`, custom fields and order states.
Its `validateAuth()` and `validateCredits()` always return true: these demo
helpers were neither copied nor executed.

Protocol distinctions:

| Protocol | Authentication / transport | This slice |
|---|---|---|
| Fusion Pro REST Reseller | Bearer; GET fixed `/api/reseller/v1/account` and `/products` | Preserved and focused regression passed |
| DHRU Fusion Legacy v6.1 | Username/API access key; form POST to configured endpoint | Implemented read-only |
| Simple API Request Listener | Separate actions and `api_key` contract | NOT IMPLEMENTED; not treated as Legacy |

## 2. Exact Legacy request contract

Provider code: `DHRU_FUSION_LEGACY_V61`.

- Exact user-configured HTTPS URL on port 443; root endpoints and explicit paths
  are supported. No hostname is hardcoded. No `/api.php` suffix is appended.
- HTTP POST, `Content-Type: application/x-www-form-urlencoded`.
- Body: `username`, `apiaccesskey`, `action`.
- Only `action=accountinfo` and `action=imeiservicelist` are permitted at runtime.
- No Bearer header, credentials in URL/query, guessed REST suffix, or undocumented
  `requestformat`/request-version parameter.
- The reference decodes optional `parameters` as Base64 JSON. Neither read action
  uses parameters, so these requests omit it.

Order actions were inspected for architecture only: `placeimeiorder`,
`placeimeiorderbulk`, `getimeiorder`, `getimeiorderbulk`. No transport or worker
operation can invoke them. Documented order statuses are 0 New, 1 InProcess,
3 Reject/Refund, 4 Available/Success. No order functionality was implemented.

## 3. Authentication and key replacement

Username and access key are serialized together and encrypted with the existing
AES-256-GCM envelope and tenant/provider associated data. No plaintext credential
column was introduced. Neither saved credential is returned to the browser.
Both fields must be supplied together for replacement; omitting both preserves
the saved encrypted credentials. Protocol is immutable on an existing connection.

Before replacement, a read-only database identity comparison confirmed that the
API's configured database was the Replit development database. It contained zero
provider connections and zero encrypted provider credentials. The user then
submitted the requested replacement via the secure Secrets flow.

The configured key passed the existing 32-byte Base64 readiness check and an
authenticated encrypt/decrypt round-trip without displaying key or ciphertext.
The agent did not retrieve either key, so it did not independently compare old
and new values. This procedure relies on the user supplying the newly generated
key as requested. No encrypted connection was orphaned in Preview.

Automatic key rotation remains NOT IMPLEMENTED. If connections exist in another
environment, do not replace its V1 key: retain the old key securely, introduce
version-aware readers, re-encrypt every envelope transactionally with preserved
AAD, verify decryption/counts, then retire the old key only after coordinated
restart and rollback preparation. That migration requires separate review.

## 4. Response parsing and connection states

- Only a valid `SUCCESS` array with exactly one object is accepted.
- Any `ERROR` envelope takes precedence; mixed success/error fails closed.
- Exact documented `Authentication Failed` maps to `AUTHENTICATION_FAILED`.
  HTTP 401/402/403 receive the same Legacy classification.
- Other undocumented provider errors are `INVALID_RESPONSE`, not guessed codes.
  Raw upstream error text never reaches API responses/history.
- Account data uses the reference's misspelling `AccoutInfo`, `credit`, `currency`.
- Numeric JSON tokens are preserved as strings before parsing money.
- Missing optional balance/currency returns null, never a synthetic zero or USD.
  Catalog synchronization requires a currency from accountinfo; no guess/fallback.
- The reference supplies no verified account-status field or numeric error-code
  table. No undocumented status/code mapping was invented.
- `CONNECTED` is written only after authenticated success. Other supported states
  are `AUTHENTICATION_FAILED`, `UNREACHABLE`, `INVALID_RESPONSE`,
  `UNSUPPORTED_PROVIDER` and `DISABLED`. Existing REST `AUTH_FAILED` remains valid.
  Unsupported protocols are rejected by the registry/input validation.

## 5. Services and requirements

Catalog sync first reads accountinfo for currency, then imeiservicelist.
The response is `SUCCESS[0].LIST`, group-keyed objects containing `GROUPNAME`,
`GROUPTYPE` and `SERVICES`, with `SERVICEID`, `SERVICETYPE`, `SERVICENAME`,
`CREDIT`, `INFO` and `TIME`. Service map keys must match SERVICEID; duplicate IDs
across groups invalidate the entire response rather than silently overwriting.

IMEI and SERVER share this documented operation. REMOTE is explicitly mentioned
in reference comments and is normalized when returned by that operation;
there is no separate Remote endpoint. FILE is not documented and is review-only.

Supported controls:

- `Requires.SN` / `Requires.Reference`: required reference fields.
- Custom `text`, `textarea`, `dropdown`: controlled text/textarea/select fields.
- Numeric/boolean required flags, bounded comma-separated dropdown choices.
- Unknown types, constraints, keys, duplicate fields and quantity pricing are
  flagged for review, and therefore blocked from ordinary import.

No primary IMEI/serial field is invented solely from the service family.
Unknown metadata is represented by a definition hash, not persisted raw extras.
Supported description, category, cost, currency, time and normalized fields are
kept in the staged snapshot. Availability remains null unless verified; the
reference does not provide an availability flag.

Repeated sync uses existing unique provider/upstream identities. Metadata,
description, requirements and prices have change tracking. Only a complete
successful response can mark missing rows. Linked canonical services are never
automatically deleted, repriced or published.

## 6. Backend files

- New: `artifacts/api-server/src/lib/providers/legacy-adapter.ts`
- Modified: `artifacts/api-server/src/lib/providers/adapter.ts`
- Modified: `artifacts/api-server/src/lib/providers/transport.ts`
- Modified: `artifacts/api-server/src/lib/providers/connections.ts`
- Modified: `artifacts/api-server/src/lib/providers/worker.ts`
- Modified: `artifacts/api-server/src/routes/external-providers.ts`

Existing canonical import, group/customer pricing, access permissions,
account-currency, wallet, ledger, checkout and order code was not modified.

## 7. Frontend and contract files

- `artifacts/bhru/src/pages/external-providers.tsx`
- `lib/api-spec/openapi.yaml`
- Generated `lib/api-client-react/src/generated/api.schemas.ts`
- Generated `lib/api-zod/src/generated/api.ts`
- Generated `lib/api-zod/src/generated/types/providerInput.ts`
- Generated `lib/api-zod/src/generated/types/providerInputProtocol.ts`
- Generated `lib/api-zod/src/generated/types/providerTestResult.ts`

Settings → API Settings (`/m/api-settings`) now allows selecting Legacy,
entering exact endpoint/username/access key, testing and saving. Existing
edit/replace, saved test, sync, staged browse, import, pricing, history and disable
operations are reused. Disable/enable sends the actual provider protocol.
Sensitive fields stay write-only, clear on close/type change and use existing
zero-retention sensitive mutation handling. No unrelated page redesign.

## 8. Database changes

`033_legacy_provider_protocol.sql` expands existing protocol and health CHECK
constraints. No new tables, credentials columns, reset, seed, truncate or data
rewrite. Migration 032 and all prior files are unchanged. The existing runner
applied only 033 to the identity-verified development database.
Production was not inspected or modified.

## 9. Security and focused checks

Same production transport boundaries: HTTPS/443, verified TLS certificates,
all DNS answers checked, actual socket lookup pinned to a validated public IP,
no redirect/proxy/socket reuse, 5-second DNS and 20-second response deadlines,
8 MiB JSON response limit and identity content encoding.
Legacy action allowlisting is enforced before I/O. Credentials are exclusively
in the POST body; request logging excludes bodies and strips queries.
Tenant-derived routes, CSRF and existing rate limits apply.

Focused suite: `scripts/test-external-providers.mjs`.
Mock transport: `scripts/lib/provider-transport-mock.mjs`.
The suite requires a freshly verified development fingerprint; do not reuse an
old fingerprint or run against an arbitrary DATABASE_URL.

38 focused checks passed, including the original 25 foundation/regression checks
and 13 Legacy checks: request encoding/TLS/SSRF/redirect/timeout, authentication
errors, malformed JSON, exact decimals, services/requirements, encrypted paired
credentials, duplicate sync, change tracking, actual HTTP ownership/CSRF,
durable worker/history, concurrent inactive import and disable-without-I/O.
Fixture cleanup completed. No upstream network or paid order was executed.

Validation results:

- API TypeScript: passed.
- API build: passed.
- Shared library TypeScript (codegen): passed.
- Frontend TypeScript: passed.
- Frontend build: passed, with non-blocking Vite chunk-size/source-map warnings.
- Preview API health: HTTP 200; both application workflows restarted and running.
- Anonymous screenshot: existing sign-in page renders; no authenticated-browser
  or broad E2E suite was run.

Wallet/ledger/service-order/Retail/customer-price/access table digests were
unchanged. This is a focused preservation check, not a claim of full end-to-end
financial regression coverage.

## 10. REST regression

REST account and catalog, transport protections, saved configuration, staged
changes, durable retries, concurrent import and existing manual service/pricing
checks passed. Existing REST URL/authentication and failure response behavior
were preserved.

## 11. Limitations

20,000 staged services per full result, 12 controlled fields, 500 imported items
per batch. No undocumented paging, provider variants, guessed field rules,
quantity orders, FILE endpoints or provider-status/error-code heuristics.
Conflicting/unsupported metadata must be reviewed rather than made orderable.
Simple Listener, automatic encryption-key rotation and live-provider acceptance
remain NOT IMPLEMENTED.

## 12. Manual/live acceptance

No real-provider testing was performed. A user can open `/m/api-settings`, choose
DHRU Fusion Legacy v6.1 and use Test Connection to explicitly initiate read-only
accountinfo. The agent must not initiate a real provider test without separate
approval. Mocked CONNECTED results do not certify ifreeicloud or any real host.
The anonymous Preview screenshot checks the sign-in entry only, not this UI.

## 13. Slice 7B boundary

Paid dispatch, upstream order tracking, callbacks and financial completion/refund
integration are NOT IMPLEMENTED. Imported services remain external_provider,
inactive and blocked from customer ordering at both server and database levels.
Do not advance without explicit approval.
