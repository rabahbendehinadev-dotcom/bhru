# DHRU Legacy multi-provider account diagnostics

## Result and scope

Account parser failures now use fixed stage-specific diagnostic codes through
the existing ProviderError, draft-result, saved safe_error and UI architecture.
No response acceptance rule is relaxed. No provider-specific display-name
branch, additional adapter, schema migration or credential change was added.

## Codes and exact conditions

| Code | Trigger during accountinfo parsing |
| --- | --- |
| `LEGACY_VERSION_MISMATCH` | Present top-level apiversion is not exactly string `"6.1"`. This includes synthetic `"2023.21"`, other strings and malformed types. |
| `LEGACY_SUCCESS_ENVELOPE_INVALID` | Non-object root, missing/non-array SUCCESS, array size other than one, non-object sole entry, or existing forbidden root pagination markers. |
| `LEGACY_ACCOUNT_CONTAINER_MISSING` | SUCCESS[0].AccoutInfo is absent or not an object. Alternate AccountInfo spelling remains unsupported. |
| `LEGACY_ACCOUNT_CURRENCY_INVALID` | A present, non-null currency fails existing uppercase three-letter validation. |
| `LEGACY_ACCOUNT_CREDIT_INVALID` | A present, non-null credit fails existing exact decimal validation. |
| `LEGACY_ERROR_ENVELOPE_INVALID` | Present ERROR is not a nonempty array, or an entry is not an object. |

Missing apiversion and supported `"6.1"` retain the same successful behavior.
Unsupported versions share one fixed mismatch code: no arbitrary version value
is logged or returned. `"2023.21"` is only a synthetic/observed identifier, not
verified support for a different wire protocol.

ERROR still precedes version/success checks. Recognized negative authentication
and IP statements retain AUTHENTICATION_REJECTED and IP_RESTRICTED.
Unrecognized structured errors, including Invalid Action, retain
UPSTREAM_REJECTION; no invented API error-code classification was introduced.
HTML/XML/MIME, malformed JSON, HTTP status and network diagnostics remain intact.
Catalog-list envelope parsing and import eligibility remain unchanged.

Optional absent/null credit/currency retain existing null results; this change
does not tighten or broaden that pre-existing nullable account contract.

## Attribution and confidentiality

Draft tests return the existing diagnosticCode field and fixed UI message.
Their structured log contains only protocol, diagnostic code, internal tenant
and request IDs, and null provider/job IDs: an unsaved draft has no such IDs.

Saved TEST/SYNC failures retain category:diagnosticCode in the existing
safe_error fields. After a valid lease update commits, a matching Legacy provider
and configuration emits a fixed log with tenant/provider/job internal IDs.
Expired leases or changed provider configuration do not emit that parser log.

No username, key, credential object, account values, raw response, URL, arbitrary
version, upstream message, personal details or sensitive headers are logged.
REST does not receive Legacy parser behavior or stage logs.

## Verification

- `node scripts/test-legacy-provider-compatibility.mjs`: **67 offline checks passed**.
- `node scripts/test-legacy-metadata-diagnostics.mjs`: **18 offline checks passed**.
- API TypeScript and build: passed.
- Frontend TypeScript and build: passed; existing non-blocking sourcemap and
  bundle-size warnings remain.

Tests use synthetic response fixtures, mocked HTTPS/DNS and mocked transactions,
with no live providers, real credentials or database writes. Existing iFree-
compatible account/catalog, requestformat=JSON, exact money, HTTP-status,
REST and metadata-diagnostics coverage remains passing.

New coverage includes missing/supported/alternative/malformed versions,
missing/wrong SUCCESS, account spelling/type, invalid currency/credit,
ERROR shapes/priority, authentication/IP errors, redaction, independent
tenant/provider/job attribution and stale-lease log suppression.

The database-writing provider suite and browser/E2E suites were not run.

## Exact feature files changed

1. artifacts/api-server/src/lib/providers/legacy-diagnostics.ts
2. artifacts/api-server/src/lib/providers/legacy-adapter.ts
3. artifacts/api-server/src/lib/providers/worker.ts
4. artifacts/api-server/src/routes/external-providers.ts
5. artifacts/bhru/src/lib/provider-diagnostics.ts
6. scripts/test-legacy-provider-compatibility.mjs
7. BHRU_LEGACY_ACCOUNT_DIAGNOSTICS.md

Project context was also recorded in .agents/memory/bhru-product-boundaries.md:
the user's multi-supplier business requirement. No generated contract changes
were required because diagnosticCode is already an optional string.

## Future Unlock OK investigation — separate approval required

After a separately approved deployment and authorized account-only test from the
intended server IP, inspect the existing draft response diagnosticCode or
saved provider TEST job history. No catalog sync is needed for this diagnosis.

For a draft, the UI shows the fixed stage-specific explanation; if the exact
code is needed, inspect only the response's health, diagnosticCode and
upstreamHttpStatus in developer tools. Do not export the request payload or a HAR:
the request contains credentials.

For a saved TEST, inspect safeError on the job/provider. For example:

`INVALID_RESPONSE:LEGACY_ACCOUNT_CONTAINER_MISSING`

An authorized operator may filter structured parser logs by the internal
tenant/provider/job IDs (draft: tenant/request IDs). Share only those allowlisted
fields, not a broad raw-log export.

Interpretation:

- VERSION_MISMATCH establishes that a present account-response version failed
  strict validation, not that it was specifically 2023.21 or requires a new adapter.
- SUCCESS_ENVELOPE_INVALID localizes the failure to the success/root shape.
- ACCOUNT_CONTAINER_MISSING points to the supported container check.
- CURRENCY_INVALID / CREDIT_INVALID identify the exact monetary field validator.
- ERROR_ENVELOPE_INVALID identifies a structurally unsupported error response.
- AUTHENTICATION_REJECTED / IP_RESTRICTED retain their existing explicit evidence.
- UPSTREAM_REJECTION does not distinguish unknown errors from invalid action.
- HTTP_FAILURE retains the actual non-success upstream status where available.

No runtime Unlock OK response was captured or verified here. A targeted sanitized
structural capture or supplier documentation may still be needed before changing
compatibility. These codes identify the failing stage, not undisclosed values.

No live test/sync, paid order, IP/key changes, production/VPS/Dokploy access,
database migration/write, Git commit/push or deployment was performed.
Stop and await approval.
