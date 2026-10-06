---
name: Subscriber Settings staging
description: Distinguish the General Settings internal navigation from the subscriber's main Settings menu and keep delivery staged.
---

The General Settings page follows DHRU Fusion's information architecture but uses BHRU's visual design. Its 11-entry internal Settings navigation is separate from the existing subscriber sidebar Settings flyout; do not merge, rename, or replace either navigation.

**Why:** The user supplied distinct references for the main menu and this page's secondary navigation, and wants the remaining Settings pages built one by one.

**How to apply:** Preserve both navigation structures and exact labels. Build only the specific internal Settings page requested in each phase; do not invent content for its unbuilt neighbours.

The user approved General Settings persistence with the ownership rule: 1 Subscriber = 1 Business / Unlock Server = 1 Website = 1 Subscription. Site settings belong to the subscriber's business boundary, not the person signing in. Do not introduce a separate tenant/server/workspace/organization identity for this model.

**Why:** The user reviewed the architecture audit and explicitly approved reusing the existing subscriber ownership model rather than inventing another business identity.

**How to apply:** Derive normal subscriber settings ownership from the authenticated session, never a browser-selected identifier. Company Name and Site Name are presentation settings and must not silently rename the subscriber business identity.

Site Link and Site SSL Link are compatibility configuration only. Custom domains, DNS, SSL provisioning, slugs, redirect behaviour, payment processing, module functionality and multiple servers remain separate, unapproved phases.

**Why:** The user explicitly restricted this phase to safely persisting General Settings, with no domain or business-function implementation.

**How to apply:** Persist only the requested configuration; do not apply these values to routing, certificates, subscriber domain metadata, redirects, payments or module behaviour without separate approval. Keep drafts in the current workspace session, not private-data browser caches.
