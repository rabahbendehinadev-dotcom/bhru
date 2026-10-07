---
name: Custom-domain operational boundary
description: Customer-host onboarding is authorized; real TLS needs the user's Traefik integration.
---
The user authorized custom domains as a shared multi-tenant feature, not separate
applications/containers or manual per-customer Dokploy setup. Keep the slug URL
working and show the same public site at the custom hostname without redirecting
to the platform slug.

**Why:** This is the user's explicit production and SaaS requirement.
**How to apply:** Preserve the shared public rendering and existing eligibility
checks. Never mark a domain Active from DNS alone or fake certificate issuance.
The application-side controller requires operator-installed persistent file
provider mounts, network access and an ACME resolver; repository configuration
does not establish that these exist on the live VPS. See BHRU_CUSTOM_DOMAINS.md.

Registrar choice customizes instructions only; never request registrar passwords.
The user performs Git Push, Dokploy deployment and live DNS/TLS/manual acceptance.

External custom-domain checks must use a dedicated, explicitly configured public
DNS resolver; never change Node's global resolver or Docker service-name lookup.

**Why:** Production evidence showed Docker's default resolver returning ENOTFOUND
for a valid public TXT record while an explicit public resolver in the same
container resolved it correctly.
**How to apply:** Keep public TXT/A/AAAA/CNAME checks isolated from internal
database/upstream resolution. Missing records and temporary resolver failures
must remain distinct, fail-closed verification outcomes.
