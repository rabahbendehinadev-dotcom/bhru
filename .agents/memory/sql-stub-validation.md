---
name: SQL stub fidelity
description: Avoid false strict-validation failures in focused source-only API tests.
---

In-memory SQL substitutes must return the columns selected by each query, not
every property of the stored test record.

**Why:** Returning ownership/order metadata excluded by the real SELECT produced
false strict-schema rejections during tenant-scoped presentation tests. Fix the
test substitute rather than weakening production validation.

**How to apply:** Preserve SELECT projections and query ordering in lightweight
test substitutes; keep real database access forbidden in source-only checks.
