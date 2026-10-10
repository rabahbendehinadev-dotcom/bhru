---
name: Preview HTTP fixture cleanup
description: Safety policy for disposable tenants used in authenticated Preview diagnostics.
---

Use disposable test identities for authenticated Preview probes rather than
creating sessions on real subscriber accounts. Plan cleanup for all defaults
that application middleware may initialize, not just explicitly inserted rows.
Scope cleanup strictly to the newly created tenant identities and verify the
development database before creating them.

**Why:** A readiness GET during testing initialized tenant defaults implicitly,
so deleting only the session and user left a subscriber referenced by defaults.

**How to apply:** Treat the whole HTTP diagnostic as the unit of cleanup. Remove
only test-owned rows in dependency order and fail loudly on incomplete cleanup.
Do not reset tables, reuse existing tenant IDs or equate a GET with zero writes.
