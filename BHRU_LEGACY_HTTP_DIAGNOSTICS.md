# DHRU Legacy — upstream HTTP status diagnostics

## Change

Previously, transport errors retained `HTTP_FAILURE` but discarded the numeric
status. The incoming BHRU request status is separate and cannot diagnose this.

Legacy non-successful upstream responses now retain a validated integer status
(100–599) in `ProviderError.upstreamHttpStatus`. The existing health category
and retryability remain unchanged, including:

- 401/402/403 → `AUTHENTICATION_FAILED`, no retry.
- 429 and 5xx → `UNREACHABLE`, existing retry eligibility.
- Other non-successful statuses, including redirects and 404/405 →
  `INVALID_RESPONSE`, no retry.

The Legacy-only draft failure response adds optional nullable
`upstreamHttpStatus`. The UI labels it explicitly, for example:

> Provider returned an unsuccessful upstream HTTP response (HTTP 403).
> Check endpoint, access permissions and availability.

Saved TEST/SYNC jobs and provider history use the existing text columns:
`category:HTTP_FAILURE:403`. Historical two-part diagnostics and REST plain-code
errors still render without claiming an unknown status. No schema change.

Each Legacy HTTP failure logs only these fixed/validated fields:

```json
{
  "providerProtocol": "DHRU_FUSION_LEGACY_V61",
  "diagnosticCode": "HTTP_FAILURE",
  "upstreamHttpStatus": 403
}
```

The fixed log message is “Legacy provider returned an unsuccessful HTTP response”.
No request/error/response object, endpoint URL, headers, body, credentials,
account balance or provider username is passed to this logger call.
REST does not receive the new status metadata or log.

`requestformat=JSON`, action restrictions, encoding, TLS/DNS pinning, response
limits, parser behavior, credentials and tenant-specific SQL remain unchanged.

## Offline verification

`node scripts/test-legacy-provider-compatibility.mjs`: **54 checks passed**.

Coverage includes:

- Actual Legacy transport statuses: 302, 400, 401, 402, 403, 404, 405, 429,
  500, 502 and 503; classification/retryability and fixed log fields checked.
- Generated connection-test response validation and visible numeric status.
- Catalog failure during account lookup and after successful account lookup
  when `imeiservicelist` fails.
- Actual TEST/SYNC worker error paths with mocked transactions: both job and
  provider error fields contain the status for 401/403/404/405/429/500.
  Existing subscriber/provider/config-version SQL parameters are preserved.
- Redaction of synthetic username/key/body values, error text, tokens and
  database-credential-shaped strings.
- Missing/invalid/non-numeric statuses never become reflected diagnostic text.
- DNS security, network, TLS and shortened mocked timeout failures remain
  `NETWORK_FAILURE`, without a fabricated HTTP status.
- HTML/XML/JSON/schema diagnostics remain separate.
- REST success/failure behavior and absence of new REST logging/metadata.

OpenAPI generation/shared-library TypeScript, API TypeScript/build and frontend
TypeScript/build passed. Frontend builds retain non-blocking sourcemap and
bundle-size warnings. No browser/E2E suite or database-writing suite was run.

A read-only safety preflight confirmed the backend connection matches managed
development storage and there are zero queued/running provider jobs. Preview
workflows were refreshed only after that check. No migration, SQL mutation,
credential read/decryption against real records or live provider test was run.

## Exact files changed for this follow-up

1. `artifacts/api-server/src/lib/providers/transport.ts`
2. `artifacts/api-server/src/lib/providers/worker.ts`
3. `artifacts/api-server/src/routes/external-providers.ts`
4. `artifacts/bhru/src/lib/provider-diagnostics.ts`
5. `artifacts/bhru/src/pages/external-providers.tsx`
6. `lib/api-spec/openapi.yaml`
7. `lib/api-client-react/src/generated/api.schemas.ts`
8. `lib/api-zod/src/generated/api.ts`
9. `lib/api-zod/src/generated/types/providerTestResult.ts`
10. `scripts/lib/provider-transport-mock.mjs`
11. `scripts/test-legacy-provider-compatibility.mjs`
12. `BHRU_LEGACY_HTTP_DIAGNOSTICS.md`

Earlier diagnosis/compatibility reports remain unchanged as historical reports.
Generated/ignored build outputs are not additional application source changes.

## Remaining limitations

- No actual iFree status or root cause was established: all provider requests
  in verification used offline mocks and synthetic credentials.
- A numeric 403 alone does not prove IP Guard or invalid credentials; a 404/405
  alone does not establish the correct endpoint or HTTP method.
- Network/DNS/TLS/timeout failures may have no HTTP response. They carry no
  fabricated status; successful HTTP responses that fail parsing retain their
  specific parsing diagnostic, without this non-success-status metadata.
- Historical failures cannot gain a status retroactively. Only future executed
  Legacy failures carry it.
- Worker persistence was verified with mock transactions, not live DB writes
  or signed-in browser testing. Concurrent provider logs intentionally omit
  provider identity and secrets.

No real upstream requests, paid orders, IP Guard changes, commit, push,
deployment, Dokploy/VPS access or production changes. Await separate approval.
