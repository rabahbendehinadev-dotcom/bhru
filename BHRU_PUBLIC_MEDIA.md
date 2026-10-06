# BHRU public-site media: Development and Dokploy

CMS Phase 1 supports PNG/JPEG logos and hero images. It uses PostgreSQL for
subscriber ownership/references and a dedicated filesystem directory for image
bytes. It has no dependency on Replit App Storage, a VPS host pathname, or S3.

## Development

If `BHRU_MEDIA_DIR` is absent, the API creates
`.local/bhru-public-media` relative to its working directory. `.local/` is already
Git-ignored. This is a Development equivalent, not a production persistence
guarantee. An explicit Development `BHRU_MEDIA_DIR` overrides that default.
Only generated UUID filenames are stored; originals are never used as paths.

## Required Dokploy configuration before any production deployment

Configure **the BHRU API/application service**, not the database service:

| Setting | Required value |
|---|---|
| Mount type | Persistent named Docker volume |
| Volume name | `bhru-public-media` |
| Container mount path | `/var/lib/bhru/public-media` |
| Mount access | Read/write |
| Environment variable | `BHRU_MEDIA_DIR=/var/lib/bhru/public-media` |
| Runtime owner | UID/GID `1000:1000` (`node` in the existing Dockerfile) |

The container path is a recommendation and may be changed. The environment
variable and mount target must match exactly. **Do not put a VPS host path in
source, and do not use an unmounted container directory or `/tmp`.**
If Dokploy qualifies the volume name, use its actual created volume name when
initializing/backing up; keep its container target as configured above.

Before first startup, initialize that actual volume and its explicit confirmation
marker. For example, on the deployment host, using the built BHRU image and the
actual persistent volume name:

```sh
docker run --rm --user 0 \
  --mount type=volume,source=<actual-Dokploy-volume-name>,target=/media \
  --entrypoint sh <built-BHRU-image> -c \
  'mkdir -p /media &&
   touch /media/.bhru-persistent-media &&
   chown -R 1000:1000 /media &&
   chmod 700 /media &&
   chmod 600 /media/.bhru-persistent-media'
```

This is an operator instruction, **not a command run by this implementation**.
Production startup requires an absolute configured directory, a regular
non-symlink `.bhru-persistent-media` marker and working write permissions.
Production does not create the directory/marker and never falls back to
Development storage. The marker confirms operator setup; it cannot prove
that Dokploy actually mounted a volume. Verify the service's mount configuration
and preservation across container rebuilds before exposing it publicly.

Apply additive SQL migrations with the existing explicit migration procedure,
including `005_subscriber_public_website.sql`. There are no startup migrations,
automatic seeds, database resets, or production environment changes here.

## Persistence, isolation and lifecycle

- Uploads require an eligible subscriber session and the existing CSRF checks.
- File type is checked against actual bytes, decoded fully, then re-encoded
  without original metadata. SVG, GIF, executables, corrupt images, MIME
  mismatches and trailing payloads are rejected; input limit is 5 MiB, each
  dimension ≤4096, total ≤8 million pixels; normalized limit 8 MiB.
- Generated file keys contain no original filename, subscriber ID or host path.
  Files are atomically renamed after writing/syncing; reads reject leaf symlinks.
- Composite foreign keys prevent referencing another subscriber's images.
- Unsaved image previews use ten-minute, image-specific signed URLs issued only
  after authenticated owner validation. Those URLs are bearer capabilities:
  do not share them; no account data or permanent public access is granted.
- Anonymous unsigned image URLs work only while a saved config references the
  image and its owner meets the existing public-site eligibility rules.
  Media does not read or modify visitor sessions. Responses are not cached.
- Replacing/removing a saved image updates configuration first, then cleans
  the old unreferenced file. Reset/removing unsaved uploads uses the owner-only
  unused-image endpoint; deleting an image still referenced by saved config
  is blocked. Shared logo/hero references are not removed prematurely.
- CMS Phase 2 has at most 16 configured slots; two bounded staging slots permit
  replacement before Save. Limits are 18 retained image records / 48 MiB per subscriber and 20 uploads
  per 15-minute window, independent of subscriptions or licence behavior.
- A process crash between file write and database commit can leave an
  unreferenced file. A deletion failure can leave a DB-unreferenced file.
  Those are storage reconciliation concerns, not evidence that a save failed.
  There is no unattended filesystem deletion/garbage collector in Phase 1.
  Before any later CMS module reuses media, extend reference protection and
  cleanup to include that module.

## Backups and operations

Back up PostgreSQL **and this volume**, not just the image or Git repository.
Use an operator-controlled consistent snapshot/quiesced-write procedure, retain
permissions and the marker, and test restoration of both assets and references.
Volume removal is destructive; replacing/rebuilding the container is not a
reason to remove it. Do not run `down -v` or volume pruning on this named volume.

The current adapter assumes one writable persistent filesystem shared by all
API processes serving this database. Do not horizontally distribute across hosts
with independent local volumes. A future storage-adapter migration is a separate
decision, not included in this phase.

Nothing in this document publishes, pushes, initializes production storage, or
changes production configuration.
