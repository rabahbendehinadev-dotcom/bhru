import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { contract } from './navigation-contract.mjs';

// Use Vite's already-installed compiler without adding dependencies.
const require = createRequire(new URL('../package.json', import.meta.url));
const { buildSync } = createRequire(require.resolve('vite'))('esbuild');
const output = buildSync({
  entryPoints: [fileURLToPath(new URL('../src/components/subscriber/nav-catalog.tsx', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'lucide-react'],
});
const mod = { exports: {} };
vm.runInNewContext(output.outputFiles[0].text, { module: mod, exports: mod.exports, require, console });
const { NAV, SEARCH_INDEX, ROUTES, columnsOf, resolveSlug, titleForLocation, entryIsActive, hasFlyout } = mod.exports;
const labels = values => Array.from(values, value => value.label);
assert.deepEqual(labels(NAV), contract.map(entry => entry.label), 'Main labels and order must match the approved brief');
for (const expected of contract) {
  const actual = NAV.find(entry => entry.label === expected.label);
  const expectedItems = expected.items ?? (expected.columns ? expected.columns.flat() : Object.values(expected.groups).flat());
  assert.deepEqual(labels(actual.items), expectedItems, `${expected.label}: exact child labels and order`);
  if (expected.groups) {
    assert.deepEqual([...new Set(actual.items.map(item => item.group))], Object.keys(expected.groups));
    for (const [group, items] of Object.entries(expected.groups)) {
      assert.deepEqual(labels(actual.items.filter(item => item.group === group)), items);
    }
  }
  if (expected.columns) {
    const actualColumns = columnsOf(actual);
    assert.equal(actualColumns.length, 2);
    expected.columns.forEach((column, index) => assert.deepEqual(labels(actualColumns[index]), column));
  }
  assert.equal(hasFlyout(actual), actual.items.length > 0);
  assert(actual.icon, `${expected.label} needs its existing BHRU navigation icon`);
}
const destinations = NAV.flatMap(entry => [entry, ...entry.items.filter(item => item.href !== '/')]);
assert.equal(NAV.reduce((sum, entry) => sum + entry.items.length, 0), 148);
assert.equal(destinations.length, 162);
assert.equal(new Set(destinations.map(item => item.href)).size, destinations.length, 'Every destination needs a unique route');
assert.equal(new Set(destinations.map(item => item.id)).size, destinations.length, 'Every destination needs a unique identity');
assert.equal(SEARCH_INDEX.length, destinations.length, 'Search must include all main and child destinations');
assert.equal(ROUTES.size, 161);
for (const destination of destinations) {
  assert(destination.href === '/' || /^\/m\/[a-z0-9-]+$/.test(destination.href));
  assert(SEARCH_INDEX.some(item => item.href === destination.href && item.label === destination.label));
  assert.equal(titleForLocation(destination.href), destination.label);
  if (destination.href === '/') continue;
  const resolved = resolveSlug(destination.href.slice(3));
  assert.equal(resolved.title, destination.label);
  assert.equal(resolved.crumbs.at(-1), destination.label);
  assert.equal(resolved.crumbs[0], 'Dashboard');
  assert(entryIsActive(resolved.entry, destination.href));
  if (resolved.child?.group) assert(resolved.crumbs.includes(resolved.child.group));
}
const serverRepeats = SEARCH_INDEX.filter(item => item.label === 'Accepted Server Orders');
assert.equal(serverRepeats.length, 2);
assert.notEqual(serverRepeats[0].href, serverRepeats[1].href);
assert.notEqual(serverRepeats[0].context, serverRepeats[1].context);
assert.equal(resolveSlug('a-page-that-was-never-defined'), undefined);
assert(entryIsActive(NAV.find(entry => entry.id === 'settings'), '/settings'), 'Existing Settings URL remains recognized');
console.log('PASS: Dashboard matches all 22 entries in exact 12/10 columns; 15 main entries, 148 child entries, 162 unique destinations; exact labels/groups/columns, breadcrumbs, search and route lookup.');

// Optional read-only smoke check: every canonical destination must survive a direct HTTP request.
if (process.argv.includes('--http')) {
  const base = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'http://localhost:21252';
  for (let start = 0; start < destinations.length; start += 8) {
    await Promise.all(destinations.slice(start, start + 8).map(async item => {
      const response = await fetch(new URL(item.href, base));
      assert.equal(response.status, 200, `Direct GET ${item.href}`);
      assert((await response.text()).includes('id="root"'), `SPA shell at ${item.href}`);
    }));
  }
  console.log('PASS: all 162 destinations return the application shell on direct HTTP GET (no login or data writes).');
}
