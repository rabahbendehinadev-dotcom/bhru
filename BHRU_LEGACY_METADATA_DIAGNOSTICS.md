# Legacy catalog unknown-metadata diagnostics

## Scope

The Legacy adapter's unknown-metadata review rule remains strict. These changes
identify safe field names for engineering investigation; they do not approve a
service, infer order fields, reprice it, enable it or submit an order.

No existing catalog records, migrations, credentials or schema are changed.
Diagnostics are separate from stored snapshots, requirements and review reasons.
Normal future catalog sync retains its existing database behavior.

## Capture and protection

Unknown service-level keys are identified using the existing exact allowlist
and `Requires.*` exception. Only an explicitly authorized Legacy SYNC job
captures diagnostic names. No values are copied into diagnostics.
Names are sanitized before leaving the normalizer through its diagnostic
callback, and filtered again before logging.

- At most 128 unknown names are examined per service.
- At most 16 unique names are retained per service, each at most 64 characters.
- Only all-uppercase or all-lowercase ASCII identifier-like names are accepted.
- Individual identifier segments over 24 characters, long numeric/hex sequences,
  mixed-case/opaque names, HTML, whitespace and other suspicious names are omitted.
- Credential/authentication/token/password/key/user/account/contact/personal,
  payment and device-identifying field names are conservatively omitted.
- `fieldNamesOmitted: true` is the fixed fallback for filtered, suspicious or
  excess names. Rejected names and their values are never included.
- At most 100 services produce diagnostic events per job.

Diagnostics are emitted only after successful transaction commit, current
provider/configuration checks and a valid job lease. Failed/rolled-back/stale
operations do not emit partial results. Authorization and sanitization are
checked again at emission. A diagnostic logger failure does not fail or retry
an already committed catalog sync.

## Explicit authorization — disabled by default

The optional non-secret environment variable is:

`BHRU_LEGACY_METADATA_DIAGNOSTICS`

Its value must be a JSON object containing exactly four fields:

```json
{
  "tenantId": "<subscriber UUID>",
  "providerId": "<provider UUID>",
  "jobId": "<authorized queued SYNC job UUID>",
  "expiresAt": "<UTC ISO timestamp ending in Z>"
}
```

The identifiers must match the exact executing job and its resolved provider.
The expiry must be in the future and no more than 15 minutes ahead. Missing,
malformed, expired, overlong or mismatched authorization disables diagnostics.
TEST jobs and REST providers never enable this feature.

For a separately approved troubleshooting operation, the operator needs the
exact queued job ID before its worker executes. Use the existing maintenance /
worker-pausing procedure; do not start a second sync to obtain an ID. Existing
job history can supply the ID, but completed jobs are not replayed by this feature.
If pausing and authorizing a queued job cannot be coordinated safely, leave this
feature disabled rather than broadening the authorization scope.

Configure this variable only for that authorized operation through the normal
environment configuration process. Ensure the backend process sees it before
the job executes, then remove it afterward. The feature does not automatically
enqueue, replay or initiate any provider request.

**No authorization variable was enabled and no real sync was performed as part
of this implementation. Production use requires separate approval and release.**

## Inspection

An authorized operator filters backend structured logs by:

`diagnosticCode = LEGACY_UNKNOWN_METADATA`

Each event contains only:

- fixed diagnostic code, review reason and message;
- internal tenant, provider, job and catalog UUIDs;
- sanitized `fieldNames` and the omission boolean.

Example with entirely synthetic values:

```json
{
  "diagnosticCode": "LEGACY_UNKNOWN_METADATA",
  "tenantId": "10000000-0000-4000-8000-000000000001",
  "providerId": "20000000-0000-4000-8000-000000000001",
  "jobId": "30000000-0000-4000-8000-000000000001",
  "catalogId": "40000000-0000-4000-8000-000000000001",
  "fieldNames": ["CAPABILITIES"],
  "fieldNamesOmitted": true,
  "reviewReason": "Undocumented Legacy service metadata needs review."
}
```

No provider URL, service name, upstream service ID, credentials, account balance,
raw response, unknown value or sensitive header is included. Inspect/share only
these filtered diagnostic events, not a broad log export. Restrict log access
and retention using the existing operational controls.

## Files changed

1. `artifacts/api-server/src/lib/providers/legacy-metadata-diagnostics.ts`
2. `artifacts/api-server/src/lib/providers/legacy-adapter.ts`
3. `artifacts/api-server/src/lib/providers/adapter.ts`
4. `artifacts/api-server/src/lib/providers/worker.ts`
5. `scripts/test-legacy-metadata-diagnostics.mjs`
6. `BHRU_LEGACY_METADATA_DIAGNOSTICS.md`

## Offline verification

Run the dedicated synthetic checks:

`node scripts/test-legacy-metadata-diagnostics.mjs`

Run the existing offline Legacy and REST compatibility checks:

`node scripts/test-legacy-provider-compatibility.mjs`

The dedicated harness replaces transport, credential decryption, database
transactions and logging with in-memory stubs. It exercises default-off capture,
scope/expiry, sensitive-name filtering, bounds, exact catalog association,
unchanged snapshots/prices/review, lost leases, rollback, partial parse failure,
TEST/REST exclusions, per-job limits and logger failures.

The database-writing `test-external-providers.mjs` suite is intentionally not
run under this request's no-database-writes restriction.

Results: 18 dedicated offline checks and 54 existing Legacy/REST compatibility
checks passed. API and frontend TypeScript checks and builds passed. Frontend
build output retains existing non-blocking sourcemap / chunk-size warnings.

## Risks and limitations

- The current 72 iFree records cannot be diagnosed retroactively.
- No real iFree field names or eligibility counts were established.
- Filtering intentionally loses sensitive, opaque and mixed-case names.
- Key-name heuristics cannot classify every possible covert encoding; keep the
  strict authorization window and restricted log access.
- The 100-service cap covers the reported 72-service catalog but intentionally
  limits larger catalogs; the omission boolean is per service, not a job total.
- Logs, not a new subscriber API or database table, are the inspection surface.
- No schema or catalog JSON-contract change is required.
- Correct interpretation of captured names still requires protocol evidence.
  No values or missing order-input contract are reconstructed by this feature.
