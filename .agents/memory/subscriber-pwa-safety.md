---
name: Subscriber PWA safety
description: Security and installation-UX decisions for the subscriber-only PWA.
---

The PWA intentionally provides a neutral connection notice offline, not an offline dashboard or account view. Never persist authenticated API responses or sensitive account content in a service-worker cache.

**Why:** The user explicitly requires preserving live authentication, licences and subscription access checks while adding installation support. A useful offline shell must not become an alternative source of account or access information.

**How to apply:** Keep account flows dependent on the existing online API. Subscriber mobile/PWA work must not alter Platform Admin, authentication, database, desktop presentation, or private entry configuration.

Installation is a user-initiated option, not an automatic popup. Use real installation capability for the browser prompt; iOS uses Safari Share → Add to Home Screen → Add instructions. Hide installation UI in standalone mode.

**Why:** The user explicitly forbids repeated installation popups, Android prompting on iOS, and device detection based only on screen width.

**How to apply:** Keep responsive layout decisions separate from platform/capability-based installation decisions, and explain Safari opening in unsupported iOS in-app browsers.