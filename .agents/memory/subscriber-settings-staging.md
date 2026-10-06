---
name: Subscriber Settings staging
description: Distinguish the General Settings internal navigation from the subscriber's main Settings menu and keep delivery staged.
---

The General Settings page follows DHRU Fusion's information architecture but uses BHRU's visual design. Its 11-entry internal Settings navigation is separate from the existing subscriber sidebar Settings flyout; do not merge, rename, or replace either navigation.

**Why:** The user supplied distinct references for the main menu and this page's secondary navigation, and wants the remaining Settings pages built one by one.

**How to apply:** Preserve both navigation structures and exact labels. Build only the specific internal Settings page requested in each phase; do not invent content for its unbuilt neighbours.

General Settings is a frontend-only form for now. Do not infer tenant configuration from the DHRU sample values or claim that an edited setting is saved. Custom domains, tenant provisioning, and settings persistence are later, separate phases.

**Why:** The user explicitly postponed backend settings and tenant-URL work until after page-structure review.

**How to apply:** Keep local editing honest and session-scoped; wire real data and persistence only after their scope and authorization rules are separately specified.
