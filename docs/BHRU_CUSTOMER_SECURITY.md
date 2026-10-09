# Customer security — Slice 4

Preview implementation only. No production access, deployment, Git commit/push,
new mail provider, 2FA or unrelated product feature is included.

## Existing architecture / compatibility

Public customers have a distinct tenant-bound session realm. The host/slug is
resolved by the existing shared-host/custom-domain eligibility infrastructure,
not by a client-supplied subscriber/customer ID. Cookies are host-only,
HttpOnly, SameSite=Lax, Secure in production, seven-day lifetime, and named by
tenant slug. A random 256-bit token is authenticated by the existing
tenant/realm-specific HMAC; only its SHA-256 digest is stored.

Passwords retain the existing salted scrypt algorithm: N=131072, r=8, p=1,
64-byte derived key, random 32-byte salt. Existing credential hashes remain
unchanged. Existing successful login rotates the browser's prior token and
remains supported; all new login sessions use fresh random tokens.

Migration 027 preserves existing token digests, creation/expiry and credentials.
It assigns independent random `session_public_id` UUIDs for safe session actions.
Old device/IP/last-seen/password-change metadata remains unknown, not invented.
No migration-wide session invalidation occurs.

## Session model

Reuse `public_customer_sessions`; do not create a second session system.
Add safe opaque public ID, last-seen, revocation time, IP, bounded/sanitized user
agent and derived device label. Auth checks expiry, `revoked_at IS NULL` and
current account Active state. Last-seen updates at most once per five minutes
of authenticated requests. Last-seen is approximate request activity, not proof
that a device is currently online.

Current-session determination compares the authenticated token digest internally.
It never exposes that digest. Lists show only the caller's tenant/customer
sessions, up to 50, plus an exact total count. Revoked sessions stay invalid
until existing lazy cleanup removes expired records; old blocking/logout
deletion behavior is preserved. Login history survives session removal.

The current session cannot be revoked through an individual-session action:
return 409 and offer Logout instead. An owned other session is revoked once;
retry returns `affected:0`. Foreign/nonexistent UUIDs return 404.
Sign out all other sessions preserves the current session, and emits one event
only when sessions actually change. Repeated zero-change actions emit no event.

Session revocation affects subsequent authentication checks; it is not a
guarantee that an already-running non-security request is retroactively cancelled.
Security mutations recheck the current session and enabled account inside
the canonical account-lock transaction.

## Login history and failed attempts

`customer_login_history` is separate from `client_activity_events`. Each known
account attempt stores tenant/customer, timestamp, result (`success`, `failed`,
`locked`, `blocked`), safe IP, sanitized user agent, derived device label and
optional safe session public UUID. Records are immutable and indexed newest-first.
Unknown identifiers receive the same generic denial and dummy scrypt
verification, but no customer identity/history is fabricated.

Each real authentication attempt is its own history record/event; repeat HTTP
login attempts are new attempts, not cached-token replay. Success events use the
verified customer actor. Unauthenticated denied attempts, lockout detection and
recovery requests use System, never impersonate the targeted customer.
History and activity are committed before throwing a generic login-denial
response, so failed-attempt/lockout information is not rolled back accidentally.

Canonical account row locking serializes attempts across email/username/code
aliases. `customer_security_state` holds:
- Five incorrect attempts within 15 minutes trigger a 15-minute login lockout.
- Attempts during lockout do not extend that lockout.
- After expiry, a correct login clears failure count/window/lockout.
- A reset clears lockout/failure state.
- Reseller blocking is independent; temporary lockout never changes `enabled`.
- Existing blocked-account session revocation and generic login denial remain.

Last successful login is read from the dedicated successful-history record.
For pre-cutover accounts, an existing persisted login timestamp may be shown
explicitly as legacy; its IP is unknown. No historical history is reconstructed.

## Password change

Authenticated POST requires current password, new password and confirmation.
Use the existing 8–128-character policy, allow passphrases, preserve whitespace,
and do not require artificial complexity rules. Verify the current hash, reject
current-password reuse, derive a new scrypt hash, update password-change time,
invalidate pending reset grants and revoke other sessions atomically with the
`password_changed` event.

Keep the already-random current session valid. No new token is needed for this
choice; cookie/token fixation protection remains unchanged. A wrong current
password, weak/mismatched/reused new password fails without mutation. Repeating
the old-password request after a successful change cannot change it again or
duplicate an event. No password history beyond the current hash is stored.

## Recovery/reset lifecycle and truthful delivery limitation

No existing customer email-delivery implementation was found. Therefore:
- Forgot Password accepts email, username or client code.
- Both existing and unknown accounts get identical wording and shape:
  `deliveryAvailable:false`, no email sent, contact reseller.
- Known enabled accounts may receive a persisted hashed reset grant; the raw
  random token is discarded because no sender exists.
- No public endpoint, reseller action, log or HTML returns a reset secret.
- Recovery email is **not operational** until a separately approved real sender
  is integrated. The token lifecycle/reset endpoint/UI are real and tested.

Internal `issueResetToken` is a delivery integration boundary, not a public API.
It requires the caller's canonical account lock. Token entropy is 256 bits,
only SHA-256 is stored, validity is 30 minutes, and new issuance invalidates all
older unused grants. Reset locks the account and grant; verifies tenant, unused
and unexpired state, Active account, confirmation/policy/current reuse; consumes
grants, changes the hash, clears temporary lockout and revokes **all** sessions
transactionally with `password_reset_completed`. Concurrent/repeated consumption
cannot apply the grant twice. There is no automatic login; sign in again to
receive a fresh rotated session.

Future delivery URLs must use `/customer/reset-password#token=<raw-token>`
(with tenant prefix on shared hosts), never query strings. The browser removes
the fragment and posts the token over same-origin HTTPS. Fragments do not reach
server access logs. Request logging uses method/URL, not request bodies; no
security code logs password/token input. Do not add body logging to these routes.

## Rate limits / IP handling

Reuse the existing shared PostgreSQL-backed `auth_rate_limits`; all windows
are 15 minutes:
- Login: 60/IP, 10/tenant identifier, plus canonical account lockout above.
- Password change: 10/tenant customer.
- Forgot: 10/IP, 3/tenant identifier.
- Reset: 20/IP.

Identifiers are hashed by the existing limiter before storage. Existing customer
CSRF header/same-origin/Fetch-Metadata checks remain required for mutations.
IP extraction uses Express `req.ip` under the existing one-hop trusted-proxy
policy; no security code parses or blindly selects raw X-Forwarded-For.
The application origin must stay behind its trusted ingress, which must append
the verified peer IP. Do not expose that origin directly or accept alternate
untrusted proxy paths with this policy. This slice changes no proxy/domain setup.
Store only validated IPv4/IPv6; remove control characters from user agent,
limit it to 500 characters, derive a short allowlisted browser/device label.

## Activity mapping / atomicity

Extend Slice 3's closed registry via additive migration 027; keep its actor,
reference, metadata and financial validation intact. Security events reference
the canonical customer account. Login events have one namespaced key per history
record; reset events have separate request/completion keys per grant. Other
mutation keys are tied to actual changed state. Activity does not replace login
history, token storage, sessions, money or lifecycle authority.

| Action | Event |
| --- | --- |
| Successful login | `login_success` |
| Known failed/blocked/locked attempt | `login_failed` |
| Threshold starts lockout | `login_locked` |
| Existing centralized logout | `customer_logged_out` (existing Slice 3 name retained) |
| Password change | `password_changed` |
| Grant issued | `password_reset_requested` |
| Grant consumed/password reset | `password_reset_completed` |
| Individual other-session revoke | `session_revoked` |
| Revoke all other sessions | `all_other_sessions_revoked` |
| Reseller force logout | `reseller_force_logout` |

Password/hash updates, reset consumption, revocations, history and corresponding
events share PostgreSQL transactions. An audit failure fails closed and rolls
the authoritative security mutation back. No background eventual capture exists.

## Permissions / UI / privacy / retention

Customer Security: password change, own active sessions with current indicator,
individual revoke/other-session logout, recent 30 login attempts and account
security summary. Existing Logout is retained. Data refreshes on explicit
refresh/focus/visibility without replacing password input. Password fields reset
only after success. Empty/error/pending states and inline script CSP hashes
are supported.

Reseller Client Detail Security tab: only their own client's last login/IP,
active session count/list, recent login attempts, blocked/temporary-lockout
status and scoped force logout. No owner password setting or reset-token
visibility is added. Force logout retries with no active sessions emit nothing.

DTOs explicitly project only approved metadata and independent opaque UUIDs.
No internal session primary token digest, raw cookie/token, password hash, reset
digest, private notes or arbitrary raw DB object is returned. Login's existing
HttpOnly Set-Cookie remains the necessary secure session delivery mechanism,
not a JSON/HTML token response. User agents are stored bounded but UI/API history
shows a derived label instead of dumping arbitrary user-agent text.

History is prospective. No purge/retention job or advanced account security
control is invented. IP, user agent and display names require a separately
approved retention/privacy policy. 2FA, email providers, payment/funding/invoice,
credit, client policy/pricing/API and notification preferences remain out of scope.
