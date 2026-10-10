---
name: BHRU product boundaries
description: User-directed scope, tenant distinction, source review boundaries, and subscription access rules.
---

BHRU serves unlock and digital-services server owners. A BHRU Subscriber is the platform owner's customer; a Subscriber Customer belongs only to that subscriber's server. Never mix these two levels.

**Why:** The user explicitly identified this distinction as essential to the business model.

**How to apply:** Keep platform subscriber management separate from the subscriber's customer/order/service surfaces.

Each reseller must eventually be able to connect multiple external suppliers and selectively import services from each. Providers must maintain independent credentials, catalogs, source prices and service mappings.

**Why:** The user explicitly stated this multi-supplier business requirement.

**How to apply:** Preserve supplier independence when evaluating compatibility. A diagnostics task does not authorize additional provider integrations or order routing.

The user's primary BHRU business workflow is: reseller offers an unlock service, customer funds a prepaid wallet and orders it, reseller processes it manually, and rejection restores the original debit. Retail/E-Commerce checkout and orders remain completely separate.

**Why:** The user explicitly called this the core BHRU use case and forbade mixing it with Retail checkout.

**How to apply:** Prioritize service catalog, customer wallet and service orders as one tenant-bound business flow. Treat future provider automation as an adapter to that flow, not a replacement for its order or money model.

The user directs development screen by screen. Build only the requested iteration, show the Preview and testing instructions, then stop and wait for review. Do not advance to another phase without approval.

**Why:** The user stated: «لا تنتقل لأي مرحلة أخرى بدون موافقتي».

**How to apply:** Do not proactively implement deferred sidebar modules, real supplier APIs, payments, production domains, deployment, imports, or infrastructure.

Keep account/licence source changes limited to the requested review scope. Follow the [BHRU deployment workflow](bhru-deployment-workflow.md) for real database-dependent acceptance; Development Preview is not the real installation. Do not push to GitHub, deploy to VPS, change Production databases or build deferred business modules without explicit approval. Subscriber presentation follows the final light-first visual standard; Platform Admin and authentication appearance remain unchanged.

**Why:** The user explicitly requested leaving DEMO MODE and reviewing the real foundation personally before publishing to bhru.net.

**How to apply:** Subscriber registrations stay PENDING and never become admin. Administrator creation requires trusted bootstrap of an independent identity, never subscriber promotion. Administrators have no subscriber status, subscription, plan or licence. Suspension, expiration and revocation deny subscriber panel access server-side without deleting accounts or data. Deliver the requested report, then stop.

Disabling a plan prevents new assignments, but preserves existing licences on that plan. No synthetic plans or prices are seeded; the platform owner creates them.

**Why:** Plan availability should not silently cancel customers' existing access; licence suspension and revocation are separate explicit actions.

**How to apply:** Check plan availability during assignment, not when validating an already-issued licence. Keep future business-module limits and billing out of this phase.

Subscriber dashboard primary actions manage the server's business, not purchase services from itself. Do not make Add Funds or New Order primary quick actions.

**Why:** Orders are submitted by the subscriber's customers; the server owner manages incoming orders and supplier connections.

**How to apply:** Use the requested management actions, and keep unbuilt modules clearly marked as deferred.

Keep subscriber main navigation as one continuous menu in the user's approved order. Do not regroup it into category sections or invent additional pages. Preserve approved child labels exactly, including capitalization and legacy terminology.

**Why:** The user explicitly rejected category-based regrouping and repeated that Dashboard entries must not be renamed, reordered, merged or removed.

**How to apply:** Preserve the approved navigation when implementing individual modules; ask before changing its scope or organization.

External provider catalog imports are a read-only foundation, not authorization
to start paid supplier fulfillment. Imported external services stay unavailable
for customer ordering until the user separately approves the next dispatch phase.

**Why:** The user explicitly separated provider reading/import from paid ordering
and required stopping after the foundation and focused verification.

**How to apply:** Do not infer permission for paid provider calls, callbacks,
automated completion/refunds or production deployment from approval of imports.