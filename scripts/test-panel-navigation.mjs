// Focused presentation tests: no browser, requests, database or customer sessions.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Script, runInNewContext } from 'node:vm';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';

const result = await build({
  entryPoints: ['artifacts/api-server/src/lib/customer-auth/client-header.ts'],
  bundle: true, platform: 'node', format: 'cjs', write: false,
});
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require: createRequire(import.meta.url) });
const { renderClientHeader, PANEL_NAV_SCRIPT, PANEL_NAV_SCRIPT_HASH } = module.exports;
new Script(PANEL_NAV_SCRIPT);
assert.equal(PANEL_NAV_SCRIPT_HASH, createHash('sha256').update(PANEL_NAV_SCRIPT).digest('base64'));
const ui = readFileSync('artifacts/api-server/src/lib/customer-auth/ui.ts', 'utf8');
assert.match(ui, /<script>\$\{PANEL_NAV_SCRIPT\}<\/script>/);
assert.match(ui, /CUSTOMER_DOCUMENT_SCRIPT_HASHES = \[[^\]]*PANEL_NAV_SCRIPT_HASH/);
for (const base of ['/shop/customer', '/customer']) {
  const model = { siteName: 'Tenant <test>', customerAccess: { accountHref: base + '/account', homeHref: '/', apiBase: '/api/public/customer/shop' } };
  const html = renderClientHeader(model, { page: 'services', firstName: 'Client' });
  for (const page of ['dashboard', 'services', 'orders', 'wallet', 'transactions', 'announcements', 'profile', 'security']) {
    assert.ok(html.includes(`href="${base}/${page}"`), page);
  }
  for (const page of ['services', 'orders']) for (const type of ['imei', 'server', 'file', 'remote']) {
    assert.ok(html.includes(`href="${base}/${page}?serviceType=${type}"`));
  }
  for (const anchor of ['sx-t-pw', 'sx-history', 'sx-sessions']) assert.ok(html.includes(`${base}/security#${anchor}`));
  assert.ok(html.includes('Tenant &lt;test&gt;'));
  assert.ok(!renderClientHeader(model).includes('data-panel-dropdown'), 'Non-panel header unchanged');
}

// Minimal DOM events exercise the actual shipped script, not a copied controller.
const listeners = new Map(), timers = new Map();
let timerId = 0, desktop = true, hover = true;
const document = { activeElement: null, addEventListener: (type, fn, capture) => listeners.set(type + (capture ? ':capture' : ''), fn) };
class Control {
  constructor(menu) { this.menu = menu; this.attrs = {}; }
  setAttribute(k, v) { this.attrs[k] = v; }
  focus() { document.activeElement = this; }
  getClientRects() { return [1]; }
  closest(selector) { return selector === 'a[href]' && this === this.menu.link ? this : null; }
}
class Menu {
  constructor() {
    this.open = false; this.events = {}; this.summary = new Control(this); this.link = new Control(this);
    this.drop = { style: {}, getBoundingClientRect: () => ({ left: 20, right: 250, top: 56 }) };
  }
  querySelector(selector) { return selector === 'summary' ? this.summary : selector === '.ph-drop' ? this.drop : this.link; }
  addEventListener(type, fn) { this.events[type] = fn; }
  contains(target) { return target === this.summary || target === this.link; }
  matches() { return false; }
}
const menus = [new Menu(), new Menu(), new Menu()];
for (const menu of menus) menu.summary.addEventListener = (type, fn) => { menu.events['summary:' + type] = fn; };
const outer = { open: true, contains: target => menus.some(menu => menu.contains(target)), querySelectorAll: () => menus.flatMap(menu => [menu.summary, ...(menu.open ? [menu.link] : [])]) };
const header = { querySelectorAll: () => menus, querySelector: () => outer };
document.querySelector = () => header;
const window = { innerWidth: 1024, innerHeight: 768, matchMedia: query => ({ get matches() { return query.includes('hover') ? hover : desktop; } }), addEventListener: (type, fn) => listeners.set(type, fn) };
runInNewContext(PANEL_NAV_SCRIPT, {
  document, window, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
});
const event = (extra = {}) => ({ prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra });
const [a, b] = menus;
a.events.pointerenter(event({ pointerType: 'mouse' }));
assert.equal(a.open, true);
assert.equal(a.summary.attrs['aria-expanded'], 'true');
a.events.pointerleave();
assert.equal(a.open, true, 'Close is delayed across pointer gap');
a.events.pointerenter(event({ pointerType: 'mouse' }));
assert.equal(timers.size, 0, 'Re-entry cancels delayed close');
b.events.pointerenter(event({ pointerType: 'mouse' }));
assert.equal(a.open, false);
assert.equal(b.open, true, 'Only one dropdown opens');
b.events.pointerleave();
for (const fn of [...timers.values()]) fn();
assert.equal(b.open, false);
a.events['summary:keydown'](event({ key: 'ArrowDown' }));
assert.equal(document.activeElement, a.link);
const escape = event({ key: 'Escape' });
a.events.keydown(escape);
assert.equal(a.open, false);
assert.equal(document.activeElement, a.summary);
assert.equal(escape.stopped, true);
a.events['summary:click'](event());
assert.equal(a.open, true);
a.events['summary:click'](event());
assert.equal(a.open, false, 'Click toggles closed');
a.events['summary:click'](event());
a.events.click(event({ target: a.link }));
assert.equal(a.open, false, 'Destination selection closes without preventing navigation');
hover = false; desktop = false;
a.events.pointerenter(event({ pointerType: 'touch' }));
assert.equal(a.open, false, 'Touch never opens on hover');
a.events['summary:click'](event());
assert.equal(a.open, true, 'Tap expands');
a.events.focusout(event({ relatedTarget: b.summary }));
assert.equal(a.open, false, 'Focus departure closes');
b.events['summary:click'](event());
listeners.get('pointerdown')(event({ target: {} }));
assert.equal(b.open, false, 'Outside pointer closes');
document.activeElement = menus.at(-1).summary;
const tab = event({ key: 'Tab' });
listeners.get('keydown:capture')(tab);
assert.equal(document.activeElement, a.summary, 'Mobile focus wraps through visible controls only');
assert.equal(tab.prevented, true);
assert.equal(tab.stopped, true);
a.events['summary:click'](event());
listeners.get('resize')();
assert.equal(a.open, false);
console.log('PASS: tenant/custom-host routes, 4 supported type filters, security anchors, non-panel preservation, JS syntax/CSP hash, mouse delay/re-entry, exclusivity, click/tap, keyboard/Escape, focus departure, outside dismissal, mobile focus trap and resize.');
