---
name: BHRU product boundaries
description: User-directed scope, tenant distinction, demo-only first iteration, and subscription access rules.
---

BHRU serves unlock and digital-services server owners. A BHRU Subscriber is the platform owner's customer; a Subscriber Customer belongs only to that subscriber's server. Never mix these two levels.

**Why:** The user explicitly identified this distinction as essential to the business model.

**How to apply:** Keep platform subscriber management separate from the subscriber's customer/order/service surfaces.

The user directs development screen by screen. Build only the requested iteration, show the Preview and testing instructions, then stop and wait for review. Do not advance to another phase without approval.

**Why:** The user stated: «لا تنتقل لأي مرحلة أخرى بدون موافقتي».

**How to apply:** Do not proactively implement deferred sidebar modules, real supplier APIs, payments, production domains, deployment, imports, or infrastructure.

The first iteration uses mock/synthetic data only and allows testing both Super Admin and Subscriber roles. Suspension, expiration, and revocation deny server-panel access but never delete subscriber data.

**Why:** The user needs to experience the activate → subscriber access → suspend → blocked access → reactivate sequence before later development.

**How to apply:** Treat this as a demo, not production authentication; preserve subscriber business data across all licence state changes.

Subscriber dashboard primary actions manage the server's business, not purchase services from itself. Do not make Add Funds or New Order primary quick actions.

**Why:** Orders are submitted by the subscriber's customers; the server owner manages incoming orders and supplier connections.

**How to apply:** Use the requested management actions, and keep unbuilt modules clearly marked as deferred.