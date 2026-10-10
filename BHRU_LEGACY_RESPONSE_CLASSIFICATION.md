# Scoped DHRU Legacy account response classification

## Scope and compatibility

Detailed classification is disabled by default. It observes only an explicitly
authorized saved Legacy TEST job, on its first attempt. It does not run on draft
tests, SYNC jobs, retry attempts or REST. It performs no additional HTTP request.
No version, account schema, currency, credit or catalog acceptance rule changed.
The observer returns the original response or error to the existing adapter.

The existing short parser-stage and HTTP diagnostics remain available as before.
Only the new detailed record requires this authorization.

## Fixed output

Log code: `LEGACY_ACCOUNT_RESPONSE_CLASSIFICATION`

| Field | Allowed values |
| --- | --- |
| response | JSON, HTML, XML, MALFORMED_JSON |
| version | MISSING, SUPPORTED_6_1, OBSERVED_2023_21, OTHER_STRING, MALFORMED |
| success | VALID, INVALID |
| account | VALID, INVALID |
| currency | VALID, MISSING, NULL, INVALID |
| credit | VALID, MISSING, NULL, INVALID |

The record also contains internal tenantId/providerId/jobId, never provider names,
URLs, credentials, usernames, raw response text, monetary values, unknown keys
or arbitrary version strings. The emitter validates all enums and copies only
the allowlisted fields.

Version is classified after the same exact-number JSON parsing used by the
adapter. Numeric JSON tokens become strings without floating-point rounding,
including numeric version tokens. This preserves the parser's interpretation.
Unsupported versions do not prevent diagnostic evaluation of SUCCESS,
AccoutInfo, currency and credit. They still prevent actual acceptance.

SUCCESS validation respects existing ERROR precedence, array length, object
types and forbidden pagination markers. ERROR content is never copied; existing
authentication/IP/upstream-rejection diagnostics continue to explain rejection.
An invalid account container leaves field classifications at MISSING.

For HTML/XML/malformed JSON, other fields are placeholders, not statements about
an account: interpret the structural fields only when response is JSON.
Declared HTML rejected by transport and HTML detected in a JSON-labelled body
both produce response=HTML; neither is treated as a DHRU account.

## Authorization

Operator-controlled environment variable (not a credential):

`BHRU_LEGACY_ACCOUNT_DIAGNOSTICS`

Its entire value must be one JSON object with exactly:

```json
{
  "tenantId": "<exact subscriber UUID>",
  "providerId": "<exact saved provider UUID>",
  "jobId": "<exact queued TEST job UUID>",
  "expiresAt": "<UTC ISO timestamp ending Z>"
}
```

The deadline must be in the future and no more than 15 minutes away. All IDs
must be UUIDs and exactly match. Empty, malformed, extra-key, expired,
wrong-tenant/provider/job or overly long configurations fail closed.
This is independent of BHRU_LEGACY_METADATA_DIAGNOSTICS: catalog authorization
does not enable account diagnostics.

Authorization is checked before observation and again immediately before logging.
Output occurs only after successful job finalization or a committed, current-
configuration failure with a valid lease. Logger failure cannot change the
provider result. There is at most one detailed record per normal first-attempt
execution; retries do not emit detailed records. No raw response is persisted.

## Future authorized Unlock OK test

No such test or environment configuration was performed in this task.

1. Obtain separate approval for deployment, then the single authenticated
   account test from the intended authorized server IP. Do not test from Preview.
2. Use the supplier-confirmed exact API endpoint. Website root and
   /api/index.php are distinct; this change does not auto-discover endpoints.
3. Arrange a controlled maintenance window with all automatic worker instances
   stopped before queuing the test. The current server starts its worker
   automatically; there is no existing worker-pause switch. Do not race the
   three-second worker loop or assume a pause flag exists.
4. An authorized operator must enqueue the one saved-provider TEST through the
   existing enqueueProviderJob transaction in a controlled maintenance runner,
   without starting the normal server worker. Record the returned job UUID and
   confirm it is the intended TEST, not an existing SYNC returned by deduplication.
   Do not directly edit job rows, replay a completed job or reset attempts.
   A dedicated operator runner is not added by this diagnostics-only change.
   If that controlled execution environment is unavailable, STOP rather than
   attempting a live UI race; arrange the operational tooling separately.
5. Set the exact authorization above on the worker environment with a fresh
   short UTC deadline before allowing that queued job to execute. Use normal
   secure environment configuration; do not change provider credentials.
6. Resume authorized processing and inspect the one classification log by its
   exact tenant/provider/job UUIDs. Also inspect the existing TEST safeError.
   Do not export request payloads, HAR files or broad unfiltered logs.
7. Remove the authorization immediately afterward; expiration also disables it.

Example interpretation:
OBSERVED_2023_21 + VALID structure/currency/credit supplies bounded compatibility
evidence, but the real adapter still rejects it with LEGACY_VERSION_MISMATCH.
OTHER_STRING does not disclose the string: supplier documentation or a separately
approved fixed allowlist extension would be needed, never raw-version logging.
HTML is a separate response-format failure, not evidence of any API version.

## Verification and files

- 75 offline Legacy/REST checks passed.
- 18 offline metadata-diagnostics checks passed.
- API TypeScript/build and frontend TypeScript/build passed.
- Frontend retains non-blocking sourcemap and bundle-size warnings.

Synthetic tests cover version classes, structural validity, null/missing/invalid
money fields, HTML, authentication rejection, strict rejection despite diagnostic
classification, tenant/provider/job isolation, expiration, disabled defaults,
retry/SYNC/REST exclusion, lost lease, redaction and emitter field allowlisting.
No real provider or database is used by either test suite.

Files changed in this task:

- artifacts/api-server/src/lib/providers/legacy-account-response-diagnostics.ts (new)
- artifacts/api-server/src/lib/providers/worker.ts
- scripts/test-legacy-provider-compatibility.mjs
- BHRU_LEGACY_RESPONSE_CLASSIFICATION.md (new)

No migrations, schema changes, credential updates, provider-record changes,
paid dispatch, production access, commit, push or deployment.
