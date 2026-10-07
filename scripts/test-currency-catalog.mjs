// Focused acceptance simulation: no real database, users, network or browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import { currencyCatalog, currencyMetadata, currencyCatalogSource } from '../artifacts/api-server/src/lib/commerce/currency-catalog.ts';
import { searchCurrencyCatalog } from '../artifacts/bhru/src/lib/currency-catalog-search.ts';
import { storefrontPreferences } from '../artifacts/api-server/src/lib/commerce/storefront-preferences.ts';

assert.equal(currencyCatalog.length, 165);
assert.equal(currencyMetadata.length, 178);
assert.equal(new Set(currencyMetadata.map(c => c.code)).size, 178);
assert.equal(currencyCatalogSource.published, '2026-09-17');
assert.equal(Object.isFrozen(currencyCatalog), true);
const required = 'USD DZD MAD SAR AED QAR KWD BHD OMR JOD TND LYD EGP IQD YER LBP EUR GBP CHF CAD AUD NZD JPY CNY HKD SGD INR PKR TRY RUB BRL MXN ZAR NGN XCG ZWG'.split(' ');
for (const code of required) {
 const entry = currencyCatalog.find(c => c.code === code);
 assert.ok(entry, `Missing ${code}`);
 assert.ok(entry.active && entry.selectable);
 assert.ok(entry.name && entry.symbol && entry.countries.length);
 assert.ok(!('rate' in entry) && !('client_default' in entry) && !('prefix' in entry));
}
for (const code of ['KWD', 'BHD', 'OMR', 'JOD', 'TND', 'LYD']) {
 assert.equal(currencyCatalog.find(c => c.code === code).decimals, 3);
}
assert.equal(currencyCatalog.find(c => c.code === 'JPY').decimals, 0);
assert.equal(currencyCatalog.find(c => c.code === 'CLF').decimals, 4);
for (const code of ['BEF', 'DEM', 'GRD', 'ITL', 'EEK', 'LVL', 'LTL', 'HRK', 'ANG', 'BGN', 'XAU', 'XTS', 'XXX']) {
 assert.ok(!currencyCatalog.some(c => c.code === code), `Not a normal active choice: ${code}`);
}
for (const [query, code] of [['DZD', 'DZD'], ['Algeria', 'DZD'], ['Algerian', 'DZD'],
 ['MAD', 'MAD'], ['Moroccan', 'MAD'], ['SAR', 'SAR'], ['Saudi', 'SAR'], ['دج', 'DZD']]) {
 assert.ok(searchCurrencyCatalog(currencyCatalog, ['USD'], query).some(c => c.code === code), query);
}
assert.equal(searchCurrencyCatalog(currencyCatalog, ['USD'], '').length, 164);
assert.equal(searchCurrencyCatalog(currencyCatalog, ['USD', 'DZD'], 'DZD').length, 0);
for (const code of ['DZD', 'MAD', 'SAR', 'AED', 'KWD', 'BHD', 'JOD']) {
 const symbol = currencyCatalog.find(c => c.code === code).symbol;
 assert.match(symbol, /[\u0600-\u06ff]/);
 assert.equal(Buffer.from(symbol, 'utf8').toString('utf8'), symbol);
 assert.ok(!symbol.includes('\ufffd'));
}

const output = await build({
 entryPoints: ['artifacts/api-server/src/lib/commerce/currencies.ts'],
 bundle: true, platform: 'node', format: 'esm', write: false,
 plugins: [{
  name: 'no-real-database',
  setup(builder) {
   builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'db', namespace: 'isolated' }));
   builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({
    contents: 'export const pool={query(){throw new Error("Real database access forbidden")}};',
    loader: 'js',
   }));
  },
 }],
});
const { saveCurrency, currencyConfig, saveDisplayCurrency } = await import(
 `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`,
);
const newUsd = () => ({
 code: 'USD', name: 'US Dollar', prefix: '$', suffix: 'USD', number_format: '1,234.56',
 rate: '1.000000', decimals: 2, enabled: true, client_default: true, is_base: true, rate_configured: true,
});
const tenants = new Map([['fresh-a', [newUsd()]], ['fresh-b', [newUsd()]]]);
const client = {
 async query(sql, args) {
  if (sql.includes('account_users')) {
   assert.ok(tenants.has(args[1]));
   return { rows: [] };
  }
  assert.ok(tenants.has(args[0]), 'Every query must target a known fixture tenant');
  if (sql.includes('money_model_version')) return { rows: [{ currency: 'USD', money_model_version: 2 }] };
  if (sql.includes('currency AS code')) return { rows: [{ code: 'USD' }] };
  const rows = tenants.get(args[0]);
  if (sql.includes('FROM subscriber_currencies')) return { rows: rows.map(r => ({ ...r })) };
  if (sql.includes('SET client_default=false')) {
   rows.forEach(r => r.client_default = false);
   return { rows: [] };
  }
  if (sql.includes('INSERT INTO subscriber_currencies')) {
   const [, code, name, prefix, suffix, number_format, rate, decimals, enabled, client_default, is_base] = args;
   const row = { code, name, prefix, suffix, number_format, rate, decimals, enabled, client_default, is_base, rate_configured: true };
   const old = rows.find(r => r.code === code);
   if (old) Object.assign(old, row);
   else rows.push(row);
   return { rows: [] };
  }
  throw new Error(`Unexpected fixture query: ${sql}`);
 },
};
let cfg = await currencyConfig('fresh-a', client, 'fixture-user');
assert.deepEqual(cfg.currencies.map(c => c.code), ['USD']);
assert.equal(cfg.currencies[0].rate, '1.000000');
assert.ok(cfg.currencies[0].enabled && cfg.currencies[0].is_base && cfg.currencies[0].client_default);
assert.equal(cfg.catalog.length, 165);
const input = (code, rate, extra = {}) => ({
 code, name: currencyCatalog.find(c => c.code === code)?.name ?? code,
 prefix: '', suffix: code, number_format: '1,000.99', rate,
 enabled: true, client_default: false, create_only: true, ...extra,
});
await assert.rejects(saveCurrency('fresh-a', input('DZD', ''), client));
await saveCurrency('fresh-a', input('DZD', '2'), client);
await saveCurrency('fresh-a', input('MAD', '3'), client);
await saveCurrency('fresh-a', input('SAR', '4', { enabled: false }), client);
for (const code of ['KWD', 'BHD', 'JOD']) await saveCurrency('fresh-a', input(code, '5.123456'), client);
for (const code of ['KWD', 'BHD', 'JOD']) {
 assert.equal(tenants.get('fresh-a').find(c => c.code === code).decimals, 3);
}
await saveCurrency('fresh-b', input('DZD', '7'), client);
assert.equal(tenants.get('fresh-a').find(c => c.code === 'DZD').rate, '2.000000');
assert.equal(tenants.get('fresh-b').find(c => c.code === 'DZD').rate, '7.000000');
await assert.rejects(saveCurrency('fresh-a', input('DZD', '8'), client), e => e.status === 409);
await assert.rejects(saveCurrency('fresh-a', input('USD', '1'), client), e => e.status === 409);
await assert.rejects(saveCurrency('fresh-a', input('DEM', '1'), client), e => e.status === 400);
await assert.rejects(saveCurrency('fresh-a', input('XAU', '1'), client), e => e.status === 400);
const history = Object.freeze({ currency: Object.freeze({ code: 'DEM', decimals: 2, rate: '1.234567' }), amount: 'original' });
tenants.get('fresh-a').push({ ...newUsd(), code: 'DEM', name: 'German Mark', is_base: false, client_default: false });
await saveCurrency('fresh-a', input('DEM', '1.25', { create_only: false }), client);
assert.equal(tenants.get('fresh-a').find(c => c.code === 'DEM').decimals, 2);
assert.equal(history.currency.rate, '1.234567');
assert.equal(history.amount, 'original');
cfg = await currencyConfig('fresh-a', client, 'fixture-user');
const configuredEnabled = cfg.currencies.filter(c => c.enabled && c.rate_configured !== false).map(c => c.code);
assert.ok(configuredEnabled.includes('USD') && configuredEnabled.includes('DZD'));
assert.ok(!configuredEnabled.includes('SAR') && !configuredEnabled.includes('EUR'));
await assert.rejects(saveDisplayCurrency('fresh-a', 'fixture-user', { code: 'EUR' }, client), e => e.status === 400);
await assert.rejects(saveDisplayCurrency('fresh-a', 'fixture-user', { code: 'SAR' }, client), e => e.status === 400);
const publicCurrencies = storefrontPreferences('USD', {}, cfg.currencies).currencies.map(c => c.code);
assert.deepEqual(publicCurrencies, configuredEnabled);
const page = fs.readFileSync('artifacts/bhru/src/pages/currencies.tsx', 'utf8');
assert.doesNotMatch(page, /slice\(0,\s*80\)|Intl\.supportedValuesOf|260|270/);
assert.match(page, /create_only: f\.isNew/);
assert.match(page, /decimals: currency\.decimals, rate: ''/);
assert.match(page, /const locked = legacy \|\| adminPreview/);
const panel = fs.readFileSync('artifacts/bhru/src/hooks/use-panel-money.ts', 'utf8');
assert.match(panel, /\(cfg\?\.currencies \?\? \[\]\)\.filter/);
const route = fs.readFileSync('artifacts/api-server/src/routes/commerce.ts', 'utf8');
assert.match(route, /SELECT id FROM subscribers WHERE id=\$1 FOR UPDATE[\s\S]*?saveCurrency/);
const init = fs.readFileSync('lib/db/src/migrations/011_new_subscriber_usd_currency.sql', 'utf8');
assert.match(init, /VALUES\s*\(NEW\.id,'USD'/);
assert.doesNotMatch(init.slice(init.indexOf('CREATE OR REPLACE FUNCTION')), /VALUES\s*\(NEW\.id,'(?:DZD|MAD|SAR)'/);
await build({
 entryPoints: [
  'artifacts/bhru/src/pages/currencies.tsx',
  'artifacts/bhru/src/components/subscriber/CurrencyCatalogPicker.tsx',
 ],
 bundle: true, packages: 'external', platform: 'browser', format: 'esm',
 outdir: '/tmp/bhru-catalog-compile', write: false, logLevel: 'silent',
});
console.log('PASS: 165 selectable / 178 ISO metadata entries; required regional/major codes; country/code/name/symbol search; Arabic UTF-8; ISO precision; fresh USD-only simulated tenants; distinct manual rates; duplicate/unknown-code rejection; retired edit/read preservation; tenant-only panel/storefront choices.');
