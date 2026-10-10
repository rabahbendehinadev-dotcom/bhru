# Provider readiness investigation — Replit Preview only

## Findings and limits of diagnosis

The original `storageReady` flag called `providerStorageReady()` in
`providers/credentials.ts`. This validates the API process's
BHRU_PROVIDER_ENCRYPTION_KEY_V1: present, exactly 44-character padded Base64,
decoding to 32 bytes. It did not test database schema readiness.

The warning was shown after a successful API response with storageReady=false.
Therefore it originally meant failed encryption configuration validation, not
evidence of a missing migration. The current shell and running API both pass
this check and an AES-GCM round-trip. A live authenticated request returned
HTTP 200 / storageReady=true before code changes as well as after restart.

An active backend failure could not be reproduced. There is no evidence to
identify which historical missing/invalid-key condition caused the reported
response, or to claim a missing migration was repaired. Do not describe the
historical key problem as independently proven.

A verified recovery defect existed: successful storageReady=false responses had
no dedicated retry control or automatic readiness polling. The stale-time
setting itself never refetches. A visible tab could retain the warning after
the backend configuration was restored. Cached storageReady=true could also
leave Add Provider enabled following a failed refetch.

## Development database and security verification

- Configured API database fingerprint matches the Replit development database.
- All repository migration checksums match their applied ledger entries.
- 032_external_provider_foundation.sql and 033_legacy_provider_protocol.sql
  were already applied. No migration was created, changed or executed.
- All four provider tables and required operational columns are available.
- All 13 provider indexes are valid and ready.
- Protocol/health constraints are validated and include Legacy v6.1 support.
- The configured key passes validation and authenticated encryption/decryption.
- Keys, ciphertext, provider credentials and session cookies were never printed.
- Existing provider records remain unchanged. Temporary HTTP test identities
  and their automatically initialized tenant defaults were removed.

## Changes

- New `artifacts/api-server/src/lib/providers/schema-ready.ts`: read-only schema
  gate checks operational columns, migration ledger, 13 indexes and the
  Legacy-compatible protocol/health constraints. Incompatible storage throws
  safe HTTP 503 rather than implying that encryption alone proves readiness.
- `artifacts/api-server/src/routes/external-providers.ts`: GET runs the schema
  gate before returning providers and encryption readiness.
- `artifacts/bhru/src/hooks/use-external-providers.ts`: always refetch on mount,
  refetch on reconnect, and poll local readiness every five seconds only while
  storageReady=false. No upstream provider calls are made by this polling.
- `artifacts/bhru/src/pages/external-providers.tsx`: accurate encryption warning,
  Check again control, and Add Provider requires a successful non-fetching
  response with storageReady=true. Failed refetches cannot reuse cached
  readiness to enable operations.
- New `scripts/test-provider-readiness.mjs`: development-fingerprint-guarded
  focused SQL, cryptographic validation and actual Preview HTTP checks.

## Verification

Nine focused checks passed:

1. Exact development target identity.
2. Applied migration checksum matching.
3. Provider columns, indexes and constraints.
4. Configured-key validation and AES-GCM round-trip.
5. Missing/malformed/wrong-length/whitespace-padded synthetic keys fail closed.
6. Actual schema gate succeeds; synthetic missing table/index/migration or
   incompatible constraint failures produce safe 503 errors.
7. Actual authenticated Preview HTTP 200 with storageReady=true and Legacy
   available; no-store response; anonymous HTTP 401.
8. Provider records unchanged and no upstream/migration/credential mutations.
9. Disposable fixtures and bootstrap defaults cleaned up.

API and frontend TypeScript/build checks passed. Frontend build retains the
non-blocking existing source-map and chunk-size warnings. Both application
workflows restarted successfully. The anonymous screenshot shows the sign-in
entry, not authenticated acceptance of the Add Provider button. No browser/E2E
or broad regression suite was run.

Manual check: Replit Preview → Settings → API Settings (`/m/api-settings`).
Reload/remount for the updated hook. Add Provider becomes enabled after the
fresh schema/encryption readiness response succeeds.

No commit, push, deployment, VPS/Dokploy access, production change, paid upstream
order, key replacement or destructive database operation was performed.
