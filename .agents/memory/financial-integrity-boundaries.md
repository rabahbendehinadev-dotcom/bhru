---
name: Financial integrity boundaries
description: Read-only reconciliation, historical attribution and provenance for future wallet imports.
---

Financial integrity diagnostics must not automatically repair balances, rewrite
ledger history or create artificial opening credits to make a mismatch disappear.
Historical actors and unavailable attribution must not be invented.

**Why:** The user requires immutable financial history and truthful diagnostic
results, not a reconciliation process that changes the facts it measures.

**How to apply:** Keep reconciliation read-only. Any repair needs separately
approved work. Future imported or nonzero-opening wallets require verified
opening provenance; never infer an opening baseline as stored balance minus
ledger totals, because that conceals discrepancies.
