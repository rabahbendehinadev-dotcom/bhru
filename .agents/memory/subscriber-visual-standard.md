---
name: Subscriber visual standard
description: User-approved direction for the subscriber UI foundation and future subscriber pages.
---

The final light subscriber-dashboard reference supersedes earlier dark-only dashboard requests. Light Mode is the default; Dark Mode is an explicit, remembered user/browser choice. Both themes must use the same reusable components and shared theme tokens.

**Why:** The user explicitly designated the light reference as final and said all future subscriber pages must automatically support both themes.

**How to apply:** Scope subscriber themes separately from Platform Admin and authentication screens. Preserve existing sessions, registration, access checks, subscriptions, licences, API behaviour and schema when changing subscriber presentation.

The subscriber home Dashboard stays simple: a twelve-month orders chart and IMEI, Server and Remote order cards showing New and Accepted. Revenue, profit, customers, supplier costs, API logs and quick actions belong on later internal pages, not the home Dashboard. Never invent production data.

**Why:** The user explicitly rejected restoring the old many-card/table dashboard and deferred business-module implementation until after reviewing the UI foundation.

**How to apply:** Use compact top-level sidebar navigation and reusable overlay flyouts rather than permanently expanding every subpage. Work in Preview and wait for review before pushing, deploying or building deferred business modules.