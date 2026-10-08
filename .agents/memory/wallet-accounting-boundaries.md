---
name: BHRU wallet and FX safeguards
description: Non-obvious business and migration decisions for prepaid service orders and legacy currency configurations.
---

New prepaid BHRU service wallets must be accounted in exact canonical USD units; an older subscriber's non-USD-based currency rates must never be silently treated as USD exchange rates. When there is no verified USD basis, restrict wallet currency conversion to canonical USD rather than inventing a rate or transferring retail balances.

**Why:** Existing subscriber configurations can retain legacy non-USD accounting references. Assuming their rates are USD-based could charge or refund the wrong amount. The user explicitly made wallet-funded manual service orders the core BHRU workflow while requiring Retail/E-Commerce checkout to remain separate.

**How to apply:** On future funding, order, provider-automation or currency work, preserve USD wallet/order/ledger snapshots and fail closed for unverified FX rates. Do not rewrite old retail pricing, alter customer credit automatically or convert historical balances without separately approved conversion.

In PostgreSQL trigger functions, use separate explicit credit/debit branches instead of embedding a CASE expression within a PL/pgSQL IF guard.

**Why:** The initial additive migration repeatedly failed to parse with a misleading end-of-input error pointing inside the nested conditional; replacing it with explicit branches resolved the migration in the isolated test database.

**How to apply:** When adding ledger guard conditions, keep each branch syntactically simple and apply the complete migration to an isolated temporary PostgreSQL database before touching a configured one.
