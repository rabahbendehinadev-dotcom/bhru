---
name: Client panel product boundaries
description: Signed-in customer experience and announcement/funding scope decisions.
---

The customer experience is panel-first after login, while the reseller's public
website remains available. Keep the customer theme light, compact and modern,
with reseller branding rather than a visually heavy legacy DHRU clone.
Use visual references only for hierarchy and component placement, not oversized
typography/cards or an exaggerated AI-mockup appearance. Favor mature
server-panel density, restrained icons, subtle surfaces and limited accent use.
For Dashboard content, prefer a few grouped operational sections with internal
separators over nine or ten equal floating metric cards; preserve the typography scale.

**Why:** The user explicitly chose a true server/client panel as the signed-in
product experience without removing the public marketing website, and explicitly
corrected the visual brief to require compact production-SaaS proportions.
The user further rejected fragmented equal-card analytics styling in favor of
a grouped financial summary and order-status panel.

**How to apply:** Preserve the separate customer identity, existing sessions,
account-currency finances and reseller-origin navigation when extending the panel.

The reseller CMS Top Area belongs in the shared authenticated customer shell,
above customer navigation, on every current and future client page. This applies
to shared-host slug URLs and custom domains. Persistence means inclusion across
pages, not a requirement to make the area fixed or sticky.

**Why:** The user clarified that Dashboard-only branding/promotions are insufficient;
only the page content beneath the shared reseller shell should change.

**How to apply:** Reuse the public CMS Top Area renderer, styles and motion behavior.
Do not duplicate its data or add customer-only CMS fields.

Reuse the existing subscriber CMS announcements for current client messages
instead of introducing a second content system. Do not invent publication dates
or historical messages. A durable archive requires a separately approved scope.

**Why:** The user requested reuse of existing announcement infrastructure when
available; the existing CMS only supplies current messages, not a dated archive.

**How to apply:** Keep audience/history changes explicit in future announcement
work. Keep funding instructions honest until a real customer funding workflow
is approved; do not present a nonfunctional payment button as online funding.
