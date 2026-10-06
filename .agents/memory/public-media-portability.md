---
name: Public media portability
description: User-approved storage boundary for subscriber public-site uploads on Dokploy
---

Use a dedicated persistent media directory for BHRU public-site uploads, designed
to be mounted as a Dokploy persistent volume in production. Keep the mount path
configurable by environment variable. Do not assume or hardcode a VPS host path.
Development must use a safe local equivalent. Document the exact Dokploy
volume/mount configuration required before production deployment.

**Why:** The user explicitly chose this storage approach for BHRU CMS.

**How to apply:** Preserve this self-hosted storage boundary in future public-site
media work. Do not substitute Replit-specific storage or another provider
without a new user decision.
