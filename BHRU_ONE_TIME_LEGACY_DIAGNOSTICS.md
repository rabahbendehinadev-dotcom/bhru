# One-time saved-provider Legacy diagnostics

## Scope and boundaries

This is an operator-only account TEST action, not catalog synchronization or an
order operation. It supports any enabled saved `DHRU_FUSION_LEGACY_V61` provider;
no supplier names, domains or credentials are hardcoded. Normal TEST/SYNC,
iFree, REST, catalog normalization, parser acceptance, `requestformat=JSON`,
authentication realms and rate limits remain unchanged.

Unsupported versions (including `2023.21`) still fail the existing parser.
Classifications are observations, never approval of protocol compatibility.

## Migration review

`034_one_time_provider_diagnostics.sql` adds only
`external_provider_test_authorizations`. It does not update existing tables or
records. The table has an exact composite job/tenant/provider foreign key, an
independent admin foreign key, a scoped unique request key, a five-minute maximum
expiration constraint, and consistency checks for consumed/lease state.

The new endpoint fails closed if migration 034 is missing. Ordinary jobs still
operate when the authorization table is absent. Existing rows are not backfilled
or modified. Applied migrations 001–033 must not be edited.

In this development session, the API connection was matched to Replit's
development database by database identity and migration-ledger fingerprint
before running the existing migration procedure. Only 034 was pending.
No production migration was run.

## Authentication and request contract

`POST /api/external-providers/{providerId}/diagnostic-test`

Requires both **independently valid** cookies in the same browser:

- subscriber session for the provider's owning tenant;
- enabled independent Platform Admin session.

There is no admin impersonation or tenant ID accepted from the body. An admin
cookie alone is insufficient. Subscriber-only, disabled-admin, foreign-tenant
and cross-origin requests are denied by the real session/CSRF protections.

Headers:

```text
Content-Type: application/json
X-BHRU-Request: 1
X-BHRU-Auth: subscriber
```

Body:

```json
{
  "confirmedProviderId": "<exact saved provider UUID>",
  "idempotencyKey": "<one UUID retained for this operator intent>"
}
```

No credentials, username, endpoint, custom expiry, version acceptance flags,
raw payload or diagnostic fields are accepted. Unknown body fields are rejected.
The server's existing tenant `provider-job:` rate bucket (30 per 15-minute
window) and ten-live-job queue cap still apply. Idempotent requests still count
toward the existing rate bucket; no bucket is reset or bypassed.

## Atomicity and one-time behavior

The enqueue transaction locks the subscriber and saved provider, checks
ownership and configuration, rejects any existing live TEST/SYNC for this
provider, and creates a new TEST plus authorization plus admin audit event.
An independent worker cannot see uncommitted records. HTTP retries with the
same scoped request key return the original job without refreshing its expiry.
Conflicting provider/actor reuse is denied.

In the existing claim transaction, the worker acquires the normal job lease,
locks the exact authorization, validates TEST/first-attempt/scope/expiry,
consumes it and binds it to that lease. It is never issued again.

Authorization is checked again before supplier I/O and finalization.
Expired jobs fail without supplier I/O; if expiry happens after an account call
began, no detailed classification is emitted after expiry. Expiration auditing
is lazy: recorded when the worker encounters or revalidates the grant, not by a
new background expiration scanner.

Diagnostic jobs are single-attempt, including transient HTTP/network failures.
Normal jobs retain their retry behavior. A worker crash after consumption may
produce no diagnostic result; lease recovery rejects the job without a second
supplier call. Exactly-once *output* is not guaranteed across process crashes.

## Output and auditing

Only fixed classifications for response type, version, SUCCESS, AccoutInfo,
currency and credit are logged, plus internal tenant/provider/job identifiers.
Existing bounded HTTP-status/error diagnostics and safe job history remain
available. No raw version, raw response, balance, credentials, session secrets,
database URL or sensitive headers are added to diagnostics.
Unlike an ordinary TEST, this classification-only action does not update any
provider record, including health, currency or stored balance. Its result is
the TEST job history and allowlisted diagnostic log, not a balance refresh.

Authorization creation, consumption, expiration, configuration rejection and
lost-permit rejection use the existing durable database audit log. Route
rejections with both valid principals are also audited there. Requests rejected
before usable principals exist—including CSRF failures—produce fixed structured
request-protection log events, without inventing an authenticated audit actor.

## Future operator procedure — do not execute before production approval

1. Review and approve the code, migration and deployment separately. Run the
   additive migration against the verified intended target using the project's
   normal controlled migration process.
2. Ensure **all worker replicas use the new implementation** before requesting a
   diagnostic TEST. Mixed old/new workers cannot guarantee this workflow.
   Diagnostic requests do not require pausing/restarting the shared worker,
   changing process environment variables or resetting rate limits.
3. Sign in separately to the independent admin realm and the owning subscriber
   realm on the same BHRU origin/browser. Do not copy cookies into scripts/logs.
4. Confirm the enabled saved Unlock OK connection and exact supplier-provided
   endpoint. Do not guess suffixes or change a working iFree connection.
5. Verify no live TEST/SYNC exists for that provider. Generate one idempotency
   UUID and keep it for this request; explicit confirmation is the provider UUID.
6. Submit the contract above from the same authenticated origin, with normal
   CSRF headers. A 202 response returns the job UUID and original creation time.
   Expiration is creation/authorization time plus five minutes.
7. Let the worker execute. Inspect the ordinary job history and the matching
   `LEGACY_ACCOUNT_RESPONSE_CLASSIFICATION` log. Inspect its audit events.
8. On an uncertain HTTP response, retry only with the same request key.
   Do not replay a completed job or replace the key merely to evade a cooldown.
   A new diagnostic attempt requires a fresh explicit operator intent.

No live supplier test was performed during implementation. No new provider
compatibility was approved.

## Local verification

`scripts/test-one-time-provider-diagnostics.mjs` requires a freshly verified
`BHRU_TEST_DB_FINGERPRINT` and rejects production mode. It uses real PostgreSQL
transactions/concurrent connections in a random, isolated fixture schema.
Core checks/indexes and grant foreign keys are retained. The shared development
worker cannot see those fixtures. All supplier transport is replaced with
synthetic data or a hard failure. Only the explicitly created fixture schema is
removed afterward; public application/provider/financial records are fingerprinted
before and after and must be unchanged.

Also run the focused Legacy compatibility and metadata diagnostics scripts,
shared-library/API TypeScript checks, and relevant builds. These do not replace
future production operator approval.
