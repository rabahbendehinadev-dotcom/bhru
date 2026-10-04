---
name: BHRU product boundaries
description: User-directed scope, tenant distinction, Development-only real backend phase, and subscription access rules.
---

BHRU serves unlock and digital-services server owners. A BHRU Subscriber is the platform owner's customer; a Subscriber Customer belongs only to that subscriber's server. Never mix these two levels.

**Why:** The user explicitly identified this distinction as essential to the business model.

**How to apply:** Keep platform subscriber management separate from the subscriber's customer/order/service surfaces.

The user directs development screen by screen. Build only the requested iteration, show the Preview and testing instructions, then stop and wait for review. Do not advance to another phase without approval.

**Why:** The user stated: «لا تنتقل لأي مرحلة أخرى بدون موافقتي».

**How to apply:** Do not proactively implement deferred sidebar modules, real supplier APIs, payments, production domains, deployment, imports, or infrastructure.

The current phase replaces the original demo with real PostgreSQL-backed registration, password authentication, sessions, protected admin, plans, licences and audit logs in Development only. Preserve the existing design and navigation. No GitHub push, VPS deployment, Production database changes or deferred business modules.

**Why:** The user explicitly requested leaving DEMO MODE and reviewing the real foundation personally before publishing to bhru.net.

**How to apply:** New registrations stay PENDING and never automatically become admin. Administrative promotion requires trusted manual action. Suspension, expiration and revocation deny panel access server-side without deleting accounts or data. Deliver a schema/auth/session/env/migration/build/start/test report, then stop.

Disabling a plan prevents new assignments, but preserves existing licences on that plan. No synthetic plans or prices are seeded; the platform owner creates them.

**Why:** Plan availability should not silently cancel customers' existing access; licence suspension and revocation are separate explicit actions.

**How to apply:** Check plan availability during assignment, not when validating an already-issued licence. Keep future business-module limits and billing out of this phase.

Subscriber dashboard primary actions manage the server's business, not purchase services from itself. Do not make Add Funds or New Order primary quick actions.

**Why:** Orders are submitted by the subscriber's customers; the server owner manages incoming orders and supplier connections.

**How to apply:** Use the requested management actions, and keep unbuilt modules clearly marked as deferred.