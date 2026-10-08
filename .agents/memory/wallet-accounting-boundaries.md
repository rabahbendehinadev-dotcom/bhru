---
name: BHRU wallet and FX safeguards
description: Non-obvious business and migration decisions for prepaid service orders and legacy currency configurations.
---

Each client has one immutable registration-selected account currency. Wallet credits, debits, adjustments, balances, statements and refunds use that currency without funding FX. Catalog services remain USD-based and convert once into account money using verified manual USD rates. Older non-USD-based rates must never be silently treated as USD FX.

**Why:** The user corrected the original USD-wallet/display-preference model: a DZD client's 1000 DZD funding must add exactly 1000 DZD, and neither reseller defaults nor financial-form selections may change an account's currency. Retail/E-Commerce checkout must remain separate.

**How to apply:** Freeze the final charged account amount and rate snapshot; refund that amount without current FX. Existing USD wallets remain USD, including zero wallets with old non-USD display preferences. Preserve legacy audit snapshots and amounts; never silently convert historical balances. Account-currency migration needs a separately approved financial process.

In PostgreSQL trigger functions, use separate explicit credit/debit branches instead of embedding a CASE expression within a PL/pgSQL IF guard.

**Why:** The initial additive migration repeatedly failed to parse with a misleading end-of-input error pointing inside the nested conditional; replacing it with explicit branches resolved the migration in the isolated test database.

**How to apply:** When adding ledger guard conditions, keep each branch syntactically simple and apply the complete migration to an isolated temporary PostgreSQL database before touching a configured one.
