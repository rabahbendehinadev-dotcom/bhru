import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(new URL('../package.json', import.meta.url));
const { buildSync } = createRequire(require.resolve('vite'))('esbuild');
function load(file) {
  const output = buildSync({
    entryPoints: [fileURLToPath(new URL(`../src/components/subscriber/workspace/${file}`, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react/jsx-runtime', 'lucide-react'],
  });
  const mod = { exports: {} };
  vm.runInNewContext(output.outputFiles[0].text, { module: mod, exports: mod.exports, require, console });
  return mod.exports;
}
const { HOME_PAGE, createWorkspaceState, workspaceReducer: reduce } = load('workspace-model.ts');
const { workspacePageForPath: pageFor, isWorkspacePath } = load('workspace-pages.ts');
const inventory = pageFor('/m/digital-inventory');
const income = pageFor('/m/top-user-by-income');
const revenue = pageFor('/m/todays-10-service-by-revenue');
assert.equal(inventory.title, 'Digital Inventory');
assert.equal(income.title, 'Top User by Income');
assert.equal(revenue.title, 'Todays 10 Service by Revenue');
assert.equal(pageFor('/dashboard').route, '/');
assert.equal(pageFor('/settings').kind, 'settings');
for (const path of ['/login', '/register', '/another-application', '/admin/subscribers', '/m/nested/path']) {
  assert.equal(isWorkspacePath(path), false);
  assert.equal(pageFor(path), undefined);
}
assert.equal(pageFor('/m/unknown-page').title, 'Page not found');
let state = createWorkspaceState(HOME_PAGE);
assert.equal(state.tabs.length, 1);
assert.equal(state.tabs[0].closable, false);
assert.equal(reduce(state, { type: 'close', route: '/' }), state);
for (const page of [inventory, income, revenue]) state = reduce(state, { type: 'visit', page });
assert.equal(state.tabs.length, 4);
const retainedInventory = state.tabs[1];
const retainedTabs = state.tabs;
state = reduce(state, { type: 'visit', page: inventory });
assert.equal(state.tabs.length, 4, 'Repeated visits do not duplicate tabs');
assert.equal(state.tabs, retainedTabs, 'Activating an existing page retains the same tab collection');
assert.equal(state.tabs[1], retainedInventory, 'An opened page keeps its identity on activation');
state = reduce(state, { type: 'close', route: revenue.route });
assert.equal(state.activeRoute, inventory.route, 'Closing a background page leaves the active route untouched');
state = reduce(state, { type: 'visit', page: revenue });
assert.equal(state.tabs.length, 4, 'Closed pages can be reopened exactly once');
state = reduce(state, { type: 'close', route: revenue.route });
assert.equal(state.activeRoute, income.route, 'Closing the active page selects its nearest earlier opened neighbour');
state = reduce(state, { type: 'close', route: income.route });
assert.equal(state.activeRoute, inventory.route);
state = reduce(state, { type: 'close', route: inventory.route });
assert.equal(state.activeRoute, '/');
assert.equal(state.tabs.length, 1, 'The permanent Dashboard prevents an empty workspace');
state = reduce(state, { type: 'visit', page: inventory }); // Browser Back to a previously closed URL.
assert.equal(state.activeRoute, inventory.route);
assert.equal(state.tabs.length, 2);
const refreshed = createWorkspaceState(revenue);
assert.deepEqual(Array.from(refreshed.tabs, tab => tab.route), ['/', revenue.route]);
assert.equal(refreshed.activeRoute, revenue.route, 'A direct load or refresh opens its URL plus permanent Dashboard');
console.log('PASS: URL registry, permanent Dashboard, duplicate prevention, retained page identity, inactive close, nearest-neighbour active close, reopen, history visits and refresh initialization.');
