// Focused configuration checks only: no network, database, browser or real accounts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';
import { parseNumberFormat, formatCurrencyMinor, SUPPORTED_NUMBER_FORMATS } from '../artifacts/api-server/src/lib/commerce/currency-money.ts';
import { parseNumberFormat as panelParse, formatScaled, normalizeCurrencyRate, SUPPORTED_NUMBER_FORMATS as panelFormats, canSaveNumberFormat } from '../artifacts/bhru/src/lib/currency-money.ts';

const examples = [
 ['1,000,99', '1,234,56'], ['1,000', '1,234.56'],
 ['1,000.99', '1,234.56'], ['1.000,99', '1.234,56'],
 ['1000.99', '1234.56'], ['1000,99', '1234,56'],
 ['1 000.99', '1 234.56'], ['1 000,99', '1 234,56'],
 // Persisted configurations remain readable, even when no longer new choices.
 ['1,234.56', '1,234.56'], ['1.234,56', '1.234,56'],
 ['1 234,56', '1 234,56'], ['1234.56', '1234.56'],
];
assert.deepEqual(SUPPORTED_NUMBER_FORMATS, ['1000.99', '1,000.99', '1,000,99', '1,000']);
assert.deepEqual(panelFormats, SUPPORTED_NUMBER_FORMATS);
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
for (const format of SUPPORTED_NUMBER_FORMATS) {
 assert.ok(canSaveNumberFormat(format));
 for (const decimals of [0, 2, 3, 4]) {
  const c = { ...row(format), decimals };
  const value = decimals === 0 ? 1235n : decimals === 2 ? 123457n : decimals === 3 ? 1234568n : 12345678n;
  assert.equal(formatScaled(12345678n, 4, c), formatCurrencyMinor(value, c));
 }
}
assert.equal(canSaveNumberFormat('1.000,99'), false);
assert.equal(canSaveNumberFormat('1.000,99', '1.000,99'), true);
assert.equal(canSaveNumberFormat('1000,99', '1.000,99'), false);
const invalidFormats = ['', '1.000.99', '<script>alert(1)</script>', 'javascript:alert(1)',
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
await saveCurrency('test-only-tenant', { ...input, number_format: '1,000,99', client_default: true }, client);
const insert = queries.find(q => q.sql.includes('INSERT INTO subscriber_currencies'));
assert.equal(insert.args[0], 'test-only-tenant');
assert.equal(insert.args[5], '1,000,99');
assert.equal(insert.args[6], '2.000000');
assert.equal(insert.args[9], true);
assert.ok(queries.some(q => q.sql.includes('SET client_default=false')));
await assert.rejects(saveCurrency('test-only-tenant', { ...input, number_format: '1000,99' }, client), e => e.status === 400);
await saveCurrency('test-only-tenant', { ...input, code: 'USD', number_format: usd.number_format, rate: '1', client_default: true }, client);
const oldEur = row('1.000,99');
const oldClient = {
 async query(sql, args) {
  if (sql.includes('FROM subscriber_currencies')) return { rows: [usd, oldEur] };
  return client.query(sql, args);
 },
};
await saveCurrency('test-only-tenant', { ...input, number_format: oldEur.number_format, prefix: '€' }, oldClient);
assert.equal(queries.filter(q => q.sql.includes('INSERT INTO subscriber_currencies')).at(-1).args[5], oldEur.number_format);
await assert.rejects(saveCurrency('test-only-tenant', { ...input, number_format: '1000,99' }, oldClient), e => e.status === 400);
for (const number_format of SUPPORTED_NUMBER_FORMATS) await saveCurrency('test-only-tenant', { ...input, number_format }, oldClient);
for (const [tenant, rate] of [['manual-a', '260'], ['manual-b', '270']]) {
 await saveCurrency(tenant, { ...input, code: 'DZD', name: 'Algerian Dinar', rate }, client);
 const write = queries.filter(q => q.sql.includes('INSERT INTO subscriber_currencies')).at(-1);
 assert.equal(write.args[0], tenant);
 assert.equal(write.args[6], `${rate}.000000`);
}
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
assert.doesNotMatch(page, /input-(?:add|currency)-format|Type a numeric sample|Accounting Reference|Rate \(1|260|270/);
for (const id of ['select-add-format-mobile', 'select-add-format', 'select-currency-format']) {
 assert.match(page, new RegExp(`data-testid="${id}"`));
}
for (const id of ['input-add-rate', 'input-currency-rate', 'input-add-prefix', 'input-add-suffix']) {
 assert.match(page, new RegExp(`<input[^\\n]*data-testid="${id}"`));
}
assert.match(page, /<CurrencyCatalogPicker/);
assert.match(page, /number_format: '1,000.99', rate: ''/);
assert.match(page, /USD is the Base \/ Reference currency\./);
assert.match(page, /Amount of this currency equal to 1 USD\./);
assert.match(page, /const locked = legacy \|\| adminPreview/);
assert.match(page, /value=\{form\.code === base \? '1\.000000' : form\.rate\}[\s\S]*?disabled=\{form\.code === base\}/);
await build({
 entryPoints: ['artifacts/bhru/src/pages/currencies.tsx'], bundle: true, packages: 'external',
 platform: 'browser', format: 'esm', write: false, logLevel: 'silent',
});

// Render the isolated native selector without a browser; inspect actual dropdown HTML.
const require = createRequire(path.resolve('artifacts/bhru/package.json'));
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const compiled = await build({
 entryPoints: ['artifacts/bhru/src/components/subscriber/CurrencyFormatSelect.tsx'],
 bundle: true, packages: 'external', platform: 'node', format: 'cjs', jsx: 'automatic',
 alias: { '@': path.resolve('artifacts/bhru/src') }, write: false, logLevel: 'silent',
});
const componentModule = { exports: {} };
vm.runInNewContext(compiled.outputFiles[0].text, { module: componentModule, exports: componentModule.exports, require });
const { CurrencyFormatSelect } = componentModule.exports;
const render = props => renderToStaticMarkup(createElement(CurrencyFormatSelect, { onChange: () => {}, ...props }));
for (const value of SUPPORTED_NUMBER_FORMATS) {
 const html = render({ value });
 assert.match(html, /^<select /);
 assert.equal((html.match(/<option /g) ?? []).length, 4);
 for (const format of SUPPORTED_NUMBER_FORMATS) assert.ok(html.includes(`value="${format}"`));
 assert.ok(html.includes(`value="${value}" selected=""`));
}
const retained = render({ value: '1.000,99', savedValue: '1.000,99' });
assert.ok(retained.includes('1.000,99 (saved format)'));
assert.ok(retained.includes('value="1.000,99" selected=""'));
assert.ok(render({ value: '1,000.99', savedValue: '1.000,99' }).includes('1.000,99 (saved format)'));
assert.equal((render({ value: '1,000.99', savedValue: '1,000.99' }).match(/<option /g) ?? []).length, 4);
const previous = fs.readFileSync('lib/db/src/migrations/015_currency_manual_number_formats.sql', 'utf8');
const migration = fs.readFileSync('lib/db/src/migrations/016_currency_format_dropdown.sql', 'utf8');
const previousCondition = previous.split('CHECK (')[1].replace(/\)\s*;\s*$/, '').replace(/\s+/g, ' ').trim();
assert.ok(migration.replace(/\s+/g, ' ').includes(previousCondition), '016 must preserve the entire 015 domain');
assert.match(migration, /number_format IN \('1,000,99', '1,000'\)/);
assert.doesNotMatch(migration, /\b(?:UPDATE|INSERT|DELETE|TRUNCATE|DROP TABLE)\b/i);
console.log('PASS: four dropdown options rendered/selected; retained saved option; panel/server/embedded storefront formatting and ISO precision; no new custom formats; unchanged legacy saves; manual 260/270 rates; fixed USD; read-only preview; additive 016 preserves 015 domain; focused UI compile.');
