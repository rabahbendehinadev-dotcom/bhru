# Subscriber currencies — Development implementation

## Where to manage

Settings → Currencies (`/m/currencies`). The server derives the owner from the subscriber session,
never from a posted subscriber ID. This settings page does not grant E-Commerce entitlement
or change any licence/module eligibility rules.

The searchable standard-currency catalog comes from Node's ISO/ICU currency data.
Each subscriber separately stores code, name, prefix, suffix, number format, manual rate,
currency decimal precision, enabled status and Client Default.

Exactly one enabled Client Default is enforced transactionally, including by a deferred
database constraint. Selecting another default atomically demotes the previous one.
The current default cannot be disabled or deleted until another default is selected.
Other entries can be disabled/deleted without changing products or historical orders.

## Base and rates

The product base currency remains the existing E-Commerce Settings currency. Its identity
rate is always 1 if it is configured as a display entry. Visibility is separate: deleting
that non-default display entry does not delete or change the underlying product currency.
The existing restriction on changing base currency after products/orders exist is retained.
Before products/orders exist, base changes require keeping only the base display entry,
because commercial rates cannot safely be rebased automatically.

Enter rates manually relative to that base: `displayedPrice = basePrice × configuredRate`.
No bank FX source, external API or example rate is installed. Only the intrinsic base identity
rate is initialized automatically. New foreign rates start blank in the editor.
Rates have up to five decimal places, are positive, and are bounded at 999999999.

## Money and rounding

Existing product/order base values remain integer minor units with two decimal places.
Rates are parsed as integer hundred-thousandths. Conversion uses BigInt rational arithmetic:

`targetMinor = roundHalfUp(baseMinor × rateUnits × 10^targetDecimals / 10000000)`

Each unit price is rounded once; line total is converted unit price × quantity; subtotal/total
is the sum of those lines. Homepage, details, cart, checkout and confirmation use that rule.
JPY-style zero decimals and three/four-decimal currencies use ISO decimal precision.
Converted amounts/totals exceeding PostgreSQL's signed-bigint range fail explicitly.
Prefix/suffix and grouping/decimal separators are configurable, not currency-symbol guesses.

Changing the visitor currency updates price nodes in place and does not recreate the
checkout form or modify stored product prices.

## Visitor persistence

Language and currency use `bhru-storefront-preferences:{public_slug}` in localStorage.
No saved currency uses the subscriber's Client Default; a disabled/deleted selection falls
back to that default. Public dropdowns use only the subscriber's enabled entries.

English is the only implemented storefront translation; other requested languages have an
explicit English fallback. Arabic/Hebrew apply RTL to header/commerce presentation.
Login/Register remain honest customer-access availability notices, not owner/admin login.

## Order snapshots

New orders retain their existing base-valued totals/items for compatibility and add an
immutable JSON currency snapshot: base currency/total, selected currency/rate/format,
enabled commercial currencies at submission, base unit amounts, quantities and converted
selected-currency unit/line/total values.
Order retries return the saved snapshot, not current exchange rates.
If the selected rate or availability changed before submission, the server rejects it and
requires review/reload rather than silently accepting different totals.
Confirmation uses historical rates/formats from the order snapshot, including when selecting
another still-enabled currency which existed at submission. If no currently enabled currency
has a historical snapshot, confirmation shows the original order currency as read-only with
an explicit notice; it does not fabricate a historical rate or overwrite the browsing preference.
Legacy orders are not rewritten and continue to use their original base-currency amounts.

## Additive migrations

- `009_subscriber_currencies.sql`: tenant configuration, existing-subscriber identity
  initialization, new-subscriber identity initialization, immutable order snapshot column.
- `010_currency_visibility_policy.sql`: separates public visibility from the underlying
  product base currency, while retaining exactly one enabled default.

Both were applied in Development using the existing checksum/advisory-lock migration runner.
No existing migration was modified. No production migration, push or deployment was performed.

## Manual review

1. Open Settings → Currencies; add a foreign currency with your own commercial rate.
2. Change prefix/suffix and format; enable it and set Client Default.
3. Open the subscriber's public store without a saved preference, then change currency.
4. Verify prices on products/cart/checkout and confirm changing currency retains typed fields.
5. Disable/delete a non-default currency and reload a previously saved visitor selection.
6. Submit a guest order; change the rate later and check the order confirmation retains
   historical rates. Confirm the default cannot be disabled/deleted directly.
7. Repeat using another subscriber account; verify configurations/catalog prices stay isolated.

Only compile/type/build and script-syntax checks were run. Browser/E2E/regression suites
were intentionally not run; the above flows are for the user's manual review.

## Changed files

### API and public storefront
- `artifacts/api-server/src/lib/commerce/currencies.ts` (new)
- `artifacts/api-server/src/lib/commerce/currency-money.ts` (new)
- `artifacts/api-server/src/lib/commerce/storefront-money-script.ts` (new)
- `artifacts/api-server/src/lib/commerce/checkout.ts`
- `artifacts/api-server/src/lib/commerce/navigation.ts`
- `artifacts/api-server/src/lib/commerce/public-render.ts`
- `artifacts/api-server/src/lib/commerce/public-script.ts`
- `artifacts/api-server/src/lib/commerce/storefront-header-script.ts`
- `artifacts/api-server/src/lib/commerce/storefront-header.ts`
- `artifacts/api-server/src/lib/commerce/storefront-preferences.ts`
- `artifacts/api-server/src/lib/commerce/validation.ts`
- `artifacts/api-server/src/routes/commerce.ts`

### Subscriber Settings integration
- `artifacts/bhru/src/pages/currencies.tsx` (new)
- `artifacts/bhru/src/pages/module.tsx`
- `artifacts/bhru/src/hooks/use-commerce.ts`

### Migrations and API contract/code generation
- `lib/db/src/migrations/009_subscriber_currencies.sql` (new)
- `lib/db/src/migrations/010_currency_visibility_policy.sql` (new)
- `lib/api-spec/openapi.yaml`
- `lib/api-client-react/src/generated/api.ts`
- `lib/api-zod/src/generated/api.ts`

### Documentation and durable scope rules
- `BHRU_CURRENCIES.md` (new)
- `.agents/memory/commerce-product-boundaries.md`
