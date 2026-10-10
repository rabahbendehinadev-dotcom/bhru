# DHRU Legacy v6.1 — compatibility correction

## Implemented

Legacy `accountinfo` and `imeiservicelist` form POSTs now include
`requestformat=JSON`. Username/key encoding, endpoint path, action allowlist,
TLS verification, public DNS pinning, timeouts and response size limit remain
unchanged. No iFree-specific endpoint, PHP API contract or request-version field
was introduced.

This is conservative explicit negotiation, supported by the historical official
PHP client linked from DHRU's help article. The inspected v6.1 reference listener
ignores the additional field and emits JSON already. It does **not** prove every
real provider accepts the field, needs it, or defaults to XML. No automatic
fallback/retry without negotiation was added.

## Safe classifications

Existing database health categories are retained. Additional fixed codes explain
Legacy failures; arbitrary upstream messages/bodies are never returned or stored.

| Evidence | Diagnostic |
|---|---|
| HTML/XHTML MIME, or recognizable HTML prefix under JSON MIME | `UNEXPECTED_HTML` |
| XML MIME, or XML declaration under JSON MIME | `UNEXPECTED_XML` |
| Other/missing non-JSON MIME | `UNSUPPORTED_RESPONSE_FORMAT` |
| Invalid JSON | `MALFORMED_JSON` |
| Explicit negative authentication statement in JSON ERROR | `AUTHENTICATION_REJECTED` |
| Explicit negative IP-denial statement in JSON ERROR | `IP_RESTRICTED` |
| Unrecognized JSON ERROR statement | `UPSTREAM_REJECTION` |
| Unsupported envelope, version, account or catalog schema | `UNEXPECTED_RESPONSE_SCHEMA` |
| Unsuccessful HTTP status | `HTTP_FAILURE` |
| Network/DNS/TLS failure | `NETWORK_FAILURE` |
| Non-identity content encoding / oversized body | `UNSUPPORTED_CONTENT_ENCODING` / `RESPONSE_TOO_LARGE` |

Authentication and IP classification use bounded exact negative statements,
not arbitrary keywords or undocumented numeric codes. A message merely mentioning
IP Guard or credentials does not prove either caused rejection. HTTP 403 alone
does not produce an IP diagnostic.

Draft results add optional `diagnosticCode`. Saved failures store only
`category:diagnosticCode` in the existing `safe_error` text column. UI displays
fixed understandable messages in the draft form, provider list, latest-job
summary and job history. Existing plain-code display for REST records is retained.
No migration or schema modification is needed.

## Verification

- `node scripts/test-legacy-provider-compatibility.mjs`: **42 checks passed**.
- OpenAPI generation and shared-library TypeScript build: passed.
- API TypeScript and build: passed.
- BHRU frontend TypeScript and build: passed.
- API Preview restarted successfully; `/api/healthz`: HTTP 200, `{"status":"ok"}`.
- Frontend Preview restarted after code generation to clear transient Vite
  missing-generated-file/HMR errors caused by the generator's clean/rewrite cycle.
- Frontend build had non-blocking sourcemap and bundle-size warnings.

The offline suite uses actual adapter/transport modules with the existing
synthetic HTTPS/DNS helper and synthetic credentials, with no DB imports.
It covers request encoding and paths, JSON negotiation with an XML-default
control fixture, valid account/catalog responses and exact monetary values,
HTML/XML/MIME/JSON/schema failures, explicit versus ambiguous auth/IP errors,
HTTP failures, network/encoding/size limits, redaction, fixed UI messages, REST
success/error behavior and blocked Simple Listener/paid actions.

The existing larger provider test's form assertion was updated for the extra
field, but that DB-writing suite was **not run**.

Read-only preflight queries verified that the inherited backend connection and
managed development database have the same identity and no queued/running
provider jobs before restarting the worker. No SQL writes or migrations were
performed by the investigation or tests.

## Exact files changed by this correction

Backend:

1. `artifacts/api-server/src/lib/providers/transport.ts`
2. `artifacts/api-server/src/lib/providers/legacy-adapter.ts`
3. `artifacts/api-server/src/lib/providers/legacy-diagnostics.ts` — new
4. `artifacts/api-server/src/lib/providers/worker.ts`
5. `artifacts/api-server/src/routes/external-providers.ts`

Frontend:

6. `artifacts/bhru/src/lib/provider-diagnostics.ts` — new
7. `artifacts/bhru/src/pages/external-providers.tsx`

Contract and generated source:

8. `lib/api-spec/openapi.yaml`
9. `lib/api-client-react/src/generated/api.schemas.ts`
10. `lib/api-zod/src/generated/api.ts`
11. `lib/api-zod/src/generated/types/providerTestResult.ts`

Tests:

12. `scripts/lib/provider-transport-mock.mjs`
13. `scripts/test-external-providers.mjs` — request assertion only
14. `scripts/test-legacy-provider-compatibility.mjs` — new offline companion

Documentation:

15. `BHRU_LEGACY_PROVIDERS.md`
16. `BHRU_LEGACY_COMPATIBILITY_FIX.md` — this report

Compiled build outputs are generated/ignored, not additional application source.
The earlier diagnosis report remains unchanged as the pre-fix investigation.

## Preserved boundaries and uncertainties

No credential/encryption-key changes, provider-record updates, tenant/pricing
changes, imported-service mutations, enable-state changes, database schema
changes, authentication changes or REST wire-contract changes.

Potential compatibility risk: an undocumented provider rejecting additional
form fields could reject explicit JSON negotiation. Another provider might use
unrecognized error wording or a different MIME/schema; these still fail closed
with a safe diagnostic rather than speculative authentication/IP attribution.
Diagnostics identify format or explicit rejection evidence, not every root cause.

The worker/history persistence path was typechecked and its fixed display
helpers tested offline; real DB-writing job integration and signed-in browser
acceptance were deliberately not run.

**No real iFree connection was validated.** No live provider request, real
credential test, IP Guard change, paid order, browser/E2E test, production/VPS
access, commit, push or deployment occurred.

Stop here. Any live test or deployment requires separate explicit approval and
must respect the intended server IP/IP Guard binding.
