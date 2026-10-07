# BHRU custom domains — source implementation and production prerequisites

## What was discovered

The repository ships one Express process behind one trusted reverse proxy, using
`trust proxy = 1`. Docker exposes container port 3000. Public slug and commerce
documents run before subscriber/admin session middleware. Their existing
licence, store entitlement, catalogue and checkout predicates remain authoritative.
Docker startup applies pending migrations before starting the server.

The repository does **not** contain the live Dokploy/Traefik static configuration,
networks, certificate resolver names or mounts. A `bhru.net` router does not
accept every customer hostname. A DNS CNAME alone neither proves ownership nor
creates a Traefik router/certificate. Current automatic custom-domain HTTPS
therefore cannot be confirmed from this repository.

No production access, push, migration execution or deployment was performed.

## Application architecture

- Additive migration `018_subscriber_custom_domains.sql`: globally unique ASCII
  hostname, subscriber ownership, random TXT challenge, DNS/TLS evidence,
  check-generation marker, timestamps, errors and a unique Primary per owner.
- Settings → Domains is `/m/domains`. Registration, provider instructions,
  verification, Primary changes, token replacement and confirmed removal are real
  subscriber-authenticated APIs. Provider cards never collect registrar credentials.
- The allowance adapter defaults to enabled/two domains, configurable globally;
  future Plans/Add-ons can replace that adapter without changing registration.
- HTTP/HTTPS input is normalized to a lower-case ASCII/IDNA hostname. URL paths
  and queries are discarded; credentials, ports, IPs, wildcard hosts, public
  suffixes, local names and BHRU-reserved hosts are rejected. `www` is a separate
  hostname requiring its own record and verification.
- Public Suffix List parsing handles domains such as `example.co.uk` and private
  suffixes. Subdomains receive CNAME instructions. Apex domains receive A/AAAA
  instructions, never an invalid apex CNAME.
- Ownership requires an exact random 256-bit TXT token at
  `_bhru-verify.<hostname>`. All resolved IPv4/IPv6 addresses must match configured
  BHRU edge IPs. Keep the TXT record permanently.
- TLS readiness requires a publicly trusted, hostname-valid HTTPS certificate
  and a matching BHRU domain challenge from **each configured edge IP**.
  Probes connect only to operator-configured IPs; they do not follow redirects or
  connect to addresses supplied by customers.
- Raw `Host`, preserved by Traefik, is used; `X-Forwarded-Host` and tenant-ID
  headers are not routing authorities. Unknown, unverified, expired-evidence and
  removed hosts fail closed. Private subscriber/admin/auth routes are not exposed
  on customer hosts. Public commerce APIs and media are constrained to that host's
  subscriber.
- Custom `/` uses the same slug resolver/renderers internally. Product/cart links
  stay at the custom origin, without redirecting to `bhru.net/<slug>`.
- Main `bhru.net/<slug>` remains available. Primary changes affect newly generated
  CMS public links, not historical orders/URLs. There is intentionally no automatic
  www/apex redirect; both can coexist and must be registered independently.
- The controller polls every 30 seconds, uses a PostgreSQL leader lock, rechecks
  DNS approximately hourly, and fails host routing closed after 24 hours without
  fresh DNS evidence. Busy queues/network outages can delay checks. Remove/revoke
  immediately affects application routing even before the next proxy refresh.

## One-time infrastructure integration (operator action, NOT performed)

Use the existing Traefik **file provider**, not one Dokploy app per domain.
The BHRU controller writes exact Host routers for DNS-verified, eligible tenants.
Traefik provisions/renews certificates through its existing ACME resolver.

First inspect your actual Traefik static configuration and container mounts.
Keep existing providers, routers, entrypoints, certificates, main-domain routing
and ACME storage. The following is an exact configuration template; substitute
the actual marked network/service/provider values. They cannot be inferred here.

1. Choose an operator-owned persistent host directory, e.g.
   `/var/lib/bhru-custom-domains` (**example, not an assumed existing path**).
   Create it with owner UID/GID `1000:1000`, mode `0750`, matching Docker's
   `node` user. The controller creates a `0640` file. Grant Traefik read/traverse
   access through its real UID/GID or ACL; do not use world-writable permissions.
2. In the BHRU Dokploy application, bind that **directory** to
   `/var/lib/bhru-domains` read/write. Set `BHRU_DOMAIN_TRAEFIK_DIR` to that
   container path.
3. Bind the same host directory read-only into Traefik as a dedicated subdirectory
   **inside its existing file-provider directory**, for example:
   `/etc/traefik/dynamic/bhru-custom-domains`.
   This target is correct only if your file provider watches
   `/etc/traefik/dynamic`. Use the actual configured directory otherwise.
   Mount the directory, not just the file: the writer uses atomic rename.
4. Ensure the existing static configuration has a watched directory:

   ```yaml
   providers:
     file:
       directory: /etc/traefik/dynamic # use ACTUAL existing watched directory
       watch: true
   ```

   Traefik's directory provider loads subdirectories. Do not replace Dokploy's
   existing dynamic files. A change to mounts/static configuration requires a
   one-time Traefik service update; subsequent tenant additions do not.
5. BHRU and Traefik must share the appropriate Docker network. Set the upstream
   to BHRU's **stable service DNS name** and internal port, not a container ID or
   `127.0.0.1`:
   `http://<ACTUAL-BHRU-SERVICE-NAME>:3000`.
6. Reuse the existing public ACME resolver if suitable, or configure one:

   ```yaml
   certificatesResolvers:
     bhru-acme:
       acme:
         email: <OPERATOR-ACME-EMAIL>
         storage: /persistent-acme/acme.json
         httpChallenge:
           entryPoint: web
   ```

   ACME storage must be persistent and protected (typically mode `0600`).
   Preserve the real existing resolver/storage instead of creating a competing
   resolver unnecessarily. Point `BHRU_DOMAIN_CERT_RESOLVER` at its exact name.
   Public ports 80/443 must reach this Traefik, with HTTP-01 challenges allowed.
   Customer CAA records must permit the chosen CA; DNSSEC/CAA failures are not
   bypassed. Use an ACME staging resolver during infrastructure commissioning to
   avoid issuance limits; staging certificates intentionally do **not** pass the
   application's publicly trusted TLS check.
7. Create the configured canonical target (e.g. `domains.bhru.net`) with A/AAAA
   records pointing only to the actual public edge IPs. The target is a DNS alias,
   not itself a subscriber website. During onboarding, Cloudflare records must be
   **DNS only**, not proxied. Remove stale conflicting AAAA records.
8. Do not expose BHRU port 3000 directly to the Internet. Traefik must preserve
   original Host (`passHostHeader: true`, emitted by the controller). Keep exactly
   one proxy hop; do not enable insecure forwarded-header trust. An additional CDN
   or load balancer requires a separate trusted-proxy/security review.

### Application environment variables

```text
BHRU_CUSTOM_DOMAINS_ENABLED=true
BHRU_DOMAIN_LIMIT=2
BHRU_PLATFORM_HOSTS=bhru.net,www.bhru.net
BHRU_DOMAIN_CNAME_TARGET=<CANONICAL-TARGET-YOU-CONFIGURED>
BHRU_DOMAIN_EDGE_IPS=<PUBLIC-IPV4>[,<PUBLIC-IPV6>]
BHRU_DOMAIN_TRAEFIK_DIR=/var/lib/bhru-domains
BHRU_DOMAIN_UPSTREAM=http://<ACTUAL-BHRU-SERVICE-NAME>:3000
BHRU_DOMAIN_CERT_RESOLVER=<EXISTING-OR-NEW-RESOLVER-NAME>
BHRU_DOMAIN_HTTP_ENTRYPOINT=web
BHRU_DOMAIN_HTTPS_ENTRYPOINT=websecure
```

Use the actual entrypoint names. Keep existing `DATABASE_URL`, `SESSION_SECRET`,
private admin-path settings and media variables unchanged. No new customer
credential or registrar API key is needed. Without DNS configuration the UI still
permits registration and TXT setup but cannot activate domains. Without a routing
integration, verified domains remain SSL pending/error rather than falsely Active.

Use one application/controller replica initially. If later scaling replicas,
they must see the same shared dynamic directory and database; the leader lock
serializes writers. Protect that directory: anyone able to write Traefik dynamic
configuration has routing authority. Do not give the app Docker socket access or
write access to unrelated Dokploy/Traefik configuration.

## Focused verification and manual VPS acceptance

Source-only checks: `node scripts/test-custom-domains.mjs`, API TypeScript,
generated-library TypeScript and focused frontend checks. Test doubles replace
database, DNS and routing-renderer dependencies; these are not real DNS/TLS,
migration-execution or browser acceptance tests.

Observed workspace validation: API TypeScript and the isolated domain UI compile
passed; the full frontend type check still reports the unrelated existing
`pages/ecommerce.tsx:402` settings/Record type mismatch. The API production bundle
build passed, but the local API startup stopped at its database/migration guard.
No database was modified to bypass that guard. Consequently Replit Preview
currently shows HTTP 502 and is **not** a successful interactive domain-page
acceptance test. Real database/migration and DNS/TLS acceptance remain on the VPS.

After **your** Git Push → Dokploy:

1. Confirm startup applies migration 018 through the existing migration runner.
   Confirm all old migrations remain tracked, and the main public slug, login
   and existing private admin entry still work.
2. Configure the one-time mounts/network/DNS/ACME integration above. Watch
   `bhru-custom-domains.yml` and Traefik ACME logs for permission, network, CAA,
   DNSSEC or challenge errors. Never report a domain Active just because DNS
   points to the VPS.
3. Create fresh subscribers A and B with valid existing licence/store access.
   Register two domains you actually control (not reserved `example.com` names).
4. On each, select a provider, copy the exact TXT and CNAME/A/AAAA records,
   publish DNS, and Verify. Wrong/missing TXT must fail. DNS verified must
   transition through SSL pending to Active only after a valid certificate and
   BHRU challenge are available.
5. A's root must show only A's website/products, B's root only B's. Test product
   click, card click, cart, Continue shopping, checkout and confirmation. Check
   that custom hostnames stay visible and the two old slug URLs still work.
6. B cannot register A's hostname, modify A's UUID, access A's catalogue API
   through B's host, or use forged `X-Forwarded-Host`/`X-Subscriber-ID` to switch
   tenant. Unknown and unverified hosts must not fall back to a subscriber.
7. Set a second verified domain as Primary. Check CMS's public link updates.
   Both registered hostnames keep working; historical orders stay unchanged.
8. Regenerate a token and confirm immediate deactivation until new ownership
   verification. Remove a domain and confirm immediate 404 on that Host, without
   deleting any website/products/orders/media or breaking its slug URL.
9. Test apex vs www independently, mobile wizard/copy/confirmation controls,
   expired/revoked DNS evidence and certificate-renewal monitoring.

References: https://docs.dokploy.com/docs/core/domains ;
https://docs.dokploy.com/docs/core/troubleshooting/domains ;
https://doc.traefik.io/traefik/reference/dynamic-configuration/file .
