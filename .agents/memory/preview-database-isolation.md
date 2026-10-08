---
name: Preview database target verification
description: Safely distinguish Replit development PostgreSQL from the separate VPS database without exposing secrets.
---

Verify the configured API connection against the Replit development database before migrations; do not rely on the connection hostname resolving to loopback.

**Why:** Replit's configured database hostname can resolve through a non-loopback proxy even when the PostgreSQL server reports a local address. Hostname-only checks falsely rejected the isolated development target. Database-name equality alone cannot prove isolation from an external installation.

**How to apply:** Use a read-only identity fingerprint from `executeSql` with `environment: "development"` and compare it through the API's configured connection. Include database name, database OID, PostgreSQL startup time and migration ledger checksums; expose only fingerprints and match booleans, never connection strings or credentials. Revalidate immediately before invoking the existing migration runner with the same inherited connection configuration. Never infer VPS production state from Preview data.
