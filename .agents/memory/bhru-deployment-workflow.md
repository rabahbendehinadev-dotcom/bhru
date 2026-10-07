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

An empty legacy account may have multiple currency configuration rows.
Currency-row count must not be used as evidence of populated monetary business data.

**Why:** The previous single-row eligibility condition excluded empty DZD+USD
configurations without protecting any product/order amounts.
**How to apply:** Check every implemented monetary source, including nonzero fund
limits and approved conversion records, under write-blocking transaction locks.
Keep non-USD rates explicitly unconfigured rather than guessing a USD-relative rate.
