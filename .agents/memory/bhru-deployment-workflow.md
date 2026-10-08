---
name: BHRU source and real database workflow
description: Replit is source development; real testing/data are on Dokploy/VPS.
---

The real BHRU database is PostgreSQL on the user's VPS, not Replit.
Replit is development/source code → GitHub repository → Dokploy/VPS application
→ VPS PostgreSQL used for the user's testing.

**Why:** The user explicitly corrected the environment assumption: Development
verification accounts are not the real installation's subscribers or money data.

**How to apply:** Modify source/migrations in Replit, run only short technical/build
checks, then report readiness. The user performs Git Push, Dokploy deployment and
manual testing; startup applies pending migrations with
`node migrate.mjs && exec node index.mjs`. Do not inspect/modify Production directly
from Replit. Never infer real subscriber/product/order/currency data from Replit
Development contents, or direct database-dependent acceptance testing to Replit
Preview when the necessary data exists only on the VPS.

When the user explicitly requests Replit Preview manual testing, a separate verified Replit development database may be prepared with BHRU's existing migration runner. Production must never be used for Preview. If the configured connection's environment is ambiguous, stop before connecting or migrating it.

**Why:** The user authorized development-only Preview preparation, while explicitly prohibiting any VPS, Dokploy or production database access.

**How to apply:** Verify and report only safe database metadata; preserve development records, use the normal tracked migrations and startup guard, and do not seed financial transactions. Development results remain separate from real VPS business data.

An empty legacy account may have multiple currency configuration rows.
Currency-row count must not be used as evidence of populated monetary business data.

**Why:** The previous single-row eligibility condition excluded empty DZD+USD
configurations without protecting any product/order amounts.
**How to apply:** Check every implemented monetary source, including nonzero fund
limits and approved conversion records, under write-blocking transaction locks.
Keep non-USD rates explicitly unconfigured rather than guessing a USD-relative rate.
