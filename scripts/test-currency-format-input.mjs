// Focused configuration checks only: no network, database, browser or real accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import { parseNumberFormat, formatCurrencyMinor } from '../artifacts/api-server/src/lib/commerce/currency-money.ts';
import { parseNumberFormat as panelParse, formatScaled, normalizeCurrencyRate } from '../artifacts/bhru/src/lib/currency-money.ts';

const examples = [
 ['1,000.99', '1,234.56'], ['1.000,99', '1.234,56'],
 ['1000.99', '1234.56'], ['1000,99', '1234,56'],
 ['1 000.99', '1 234.56'], ['1 000,99', '1 234,56'],
 // Persisted configurations from before the editable input.
 ['1,234.56', '1,234.56'], ['1.234,56', '1.234,56'],
 ['1 234,56', '1 234,56'], ['1234.56', '1234.56'],
];
const row = format => ({
 code: 'EUR', name: 'Euro', prefix: '', suffix: '', number_format: format,
 decimals: 2, rate: '1.000000', enabled: true, client_default: false,
});
for (const [format, expected] of examples) {
 assert.deepEqual(panelParse(format), parseNumberFormat(format));
 assert.ok(parseNumberFormat(format));
 assert.equal(formatCurrencyMinor(123456n, row(format)), expected);
 assert.equal(formatScaled(1234560000000000n, 12, row(format)), expected);
 assert.equal(formatScaled(1234567800000000n, 12, row(format)), expected.slice(0, -2) + '57');
}
const invalidFormats = ['', '1,000,99', '1.000.99', '<script>alert(1)</script>', 'javascript:alert(1)',
 '1000.99\n<img>', '1\t000.99', '1\u00a0000.99', '1000', '1,00.99', '1,000.999', '1,000.99;DROP TABLE x'];
for (const format of invalidFormats) {
 assert.equal(parseNumberFormat(format), null);
 assert.equal(panelParse(format), null);
}
assert.equal(normalizeCurrencyRate('2'), '2.000000');
assert.equal(normalizeCurrencyRate(' 0.123456 '), '0.123456');
assert.equal(normalizeCurrencyRate('000000001'), '1.000000');
for (const rate of ['', '0', '-1', '1e3', 'NaN', '1.1234567', '1000000000', '999999999.000001', '<b>2</b>']) {
 assert.throws(() => normalizeCurrencyRate(rate));
}

const isolated = async entry => {
 const output = await build({
  entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{
   name: 'forbid-database',
   setup(builder) {
    builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'db', namespace: 'isolated' }));
    builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({
     contents: 'export const pool={query(){throw new Error("Real database access is forbidden")}};',
     loader: 'js',
    }));
   },
  }],
 });
 return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
};
const { currencyInput, saveCurrency } = await isolated('artifacts/api-server/src/lib/commerce/currencies.ts');
const input = { ...row('1,000.99'), rate: '2', enabled: true, client_default: false };
delete input.decimals;
for (const [format] of examples) {
 assert.equal(currencyInput.parse({ ...input, number_format: format }).number_format, format);
}
assert.equal(currencyInput.parse(input).rate, '2.000000');
for (const number_format of invalidFormats) assert.equal(currencyInput.safeParse({ ...input, number_format }).success, false);
for (const rate of ['', '0', '-1', '1e3', 'NaN', '1.1234567', '1000000000', '999999999.000001']) {
 assert.equal(currencyInput.safeParse({ ...input, rate }).success, false);
}
const usd = { ...row('1,234.56'), code: 'USD', name: 'US Dollar', is_base: true, client_default: true };
const queries = [];
const client = {
 async query(sql, args) {
  queries.push({ sql, args });
  if (sql.includes('money_model_version')) return { rows: [{ money_model_version: 2 }] };
  if (sql.includes('currency AS code')) return { rows: [{ code: 'USD' }] };
  if (sql.includes('FROM subscriber_currencies')) return { rows: [usd] };
  return { rows: [] };
 },
};
await saveCurrency('test-only-tenant', { ...input, number_format: '1000,99', client_default: true }, client);
const insert = queries.find(q => q.sql.includes('INSERT INTO subscriber_currencies'));
assert.equal(insert.args[0], 'test-only-tenant');
assert.equal(insert.args[5], '1000,99');
assert.equal(insert.args[6], '2.000000');
assert.equal(insert.args[9], true);
assert.ok(queries.some(q => q.sql.includes('SET client_default=false')));
await assert.rejects(saveCurrency('test-only-tenant', { ...input, code: 'USD', rate: '2' }, client), e => e.status === 400);
await assert.rejects(saveCurrency('test-only-tenant', { ...input, code: 'USD', rate: '1', enabled: false }, client), e => e.status === 400);

// Execute only the pure embedded price script in a mocked JS context, not a browser.
const { STOREFRONT_MONEY_SCRIPT, STOREFRONT_MONEY_HASH } = await isolated('artifacts/api-server/src/lib/commerce/storefront-money-script.ts');
assert.equal(STOREFRONT_MONEY_HASH, `'sha256-${createHash('sha256').update(STOREFRONT_MONEY_SCRIPT).digest('base64')}'`);
for (const [format, expected] of examples) {
 const c = row(format), node = {
  textContent: '',
  hasAttribute: () => false,
  getAttribute: key => key === 'data-sf-money' ? '1234560000000000' : null,
 };
 const cfg = { slug: 'isolated-format-test', currencies: [c], defaultCurrency: c.code, moneyScale: 12, view: 'home' };
 vm.runInNewContext(STOREFRONT_MONEY_SCRIPT, {
  document: { getElementById: () => ({ textContent: JSON.stringify(cfg) }), querySelectorAll: () => [node] },
  localStorage: { getItem: () => null, setItem: () => {} }, window: {},
 });
 assert.equal(node.textContent, expected);
}
const page = fs.readFileSync('artifacts/bhru/src/pages/currencies.tsx', 'utf8');
assert.doesNotMatch(page, /select-(?:add|currency)-format|Accounting Reference|Rate \(1|260|270/);
for (const id of ['input-add-format-mobile', 'input-add-format', 'input-currency-format']) {
 assert.match(page, new RegExp(`<input[^\\n]*data-testid="${id}"`));
}
assert.match(page, /USD is the Base \/ Reference currency\./);
assert.match(page, /Amount of this currency equal to 1 USD\./);
assert.match(page, /const locked = legacy \|\| adminPreview/);
assert.match(page, /value=\{form\.code === base \? '1\.000000' : form\.rate\}[\s\S]*?disabled=\{form\.code === base\}/);
await build({
 entryPoints: ['artifacts/bhru/src/pages/currencies.tsx'], bundle: true, packages: 'external',
 platform: 'browser', format: 'esm', write: false, logLevel: 'silent',
});
console.log('PASS: six typed styles + legacy formats; matching panel/server/embedded formatting; live-preview samples; unsafe/invalid input rejection; six-decimal rates; fixed USD; explicit default; read-only preview guards; focused UI compile.');
