# BHRU built-in currency catalog

## Canonical source

The application has one backend-owned, typed catalog:

- Metadata snapshot: `artifacts/api-server/src/lib/commerce/currency-catalog-data.json`
- Selection policy/types: `artifacts/api-server/src/lib/commerce/currency-catalog.ts`
- Authority: [SIX ISO 4217 current currency list](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml)
- Source publication date: **2026-09-17**
- **178** ISO metadata entries; **165** active/selectable monetary codes with defined ISO minor-unit precision.

Codes, names and minor-unit precision come from the official XML, deduplicated by
ISO code. Country names are retained for search. Symbols are supplementary Unicode
presentation metadata, pinned from CLDR with explicit Arabic symbol overrides;
ISO 4217 itself does not standardize currency symbols.

Active fund/indexed units with a defined ISO precision are supported too, e.g.
CLF/UYW at four decimals. Precious metals and other units with ISO precision
marked “N.A.”, test codes and “no currency” remain non-selectable metadata; BHRU
does not guess a monetary precision for them. Withdrawn currencies are not newly selectable.

## Application behavior

The existing authenticated currency configuration response supplies the same
catalog to every subscriber. The frontend contains no independent currency list.
Search inside the picker matches code, name, country and symbol without an
80-option truncation. Configured currencies, including permanent USD, are excluded.

The catalog contains **no exchange rates**, tenant settings or presentation
overrides. Choosing an entry sets its code/name/precision and clears the unsaved
rate. Prefix, suffix and format remain editable. A new subscriber still receives
only USD, enabled, Base / Reference at 1.000000 and initial Client Default.

New currency additions are validated against selectable catalog entries on the
server. The Add form sends `create_only: true`: an already-configured code returns
409 rather than overwriting its settings. Existing per-subscriber write locking
serializes concurrent additions; the existing tenant/code primary key also
prevents duplicate rows. Edit/quick actions use `create_only: false`.

Existing configured currencies can still be read and edited even if retired from
the current catalog. Their stored decimal precision is preserved; new currencies
use ISO precision, e.g. JPY 0 and KWD/BHD/JOD 3. Historical snapshots are untouched.
Panel and public selectors continue to use configured/enabled tenant currencies,
not global metadata. Admin preview remains read-only.

## Maintenance

Updates are deliberate source changes, not runtime downloads or FX synchronization:

```sh
curl -fLsS \
  https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml \
  -o /tmp/bhru-iso-list-one.xml
node scripts/generate-currency-catalog.mjs --xml-file /tmp/bhru-iso-list-one.xml \
  > artifacts/api-server/src/lib/commerce/currency-catalog-data.json
node scripts/test-currency-catalog.mjs
```

Review additions/withdrawals, precision and Unicode symbols before approving a
snapshot update. The JSON records its source date and XML SHA-256. The generator
rejects conflicting precision and precisions beyond the current 0–4 schema
support, requiring explicit review instead of guessing.

No migration 016 is needed: existing code, Unicode and precision constraints
already support the selectable catalog. Migrations 001–015 are unchanged.
