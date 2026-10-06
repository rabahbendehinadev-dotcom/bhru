import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { pool, base, prepare, load, cleanup, api } from './lib/public-site-fixtures.mjs';

let passed = 0;
const pass = message => console.log(`PASS ${++passed}: ${message}`);
const document = async (path, actor = {}) => {
  const response = await fetch(`${base}${path}`, { redirect: 'manual',
    headers: actor.cookie ? { Cookie: actor.cookie } : {} });
  return { response, status: response.status, html: await response.text() };
};
try {
  if (process.argv.includes('--prepare')) {
    await prepare();
    pass('Seven uniquely owned public-site fixtures prepared; original data fingerprinted');
  } else if (process.argv.includes('--cleanup')) {
    await cleanup(await load());
    pass('All test fixtures removed; original business, slug, account, settings and licence data unchanged');
  } else {
    const fixtures = await load();
    const [a, b] = fixtures.sites;
    const generic = await document(`/unknown-public-site-${fixtures.tag}`);
    assert.equal(generic.status, 404);
    for (const site of [a, b]) {
      const page = await document(`/${site.slug}`);
      assert.equal(page.status, 200);
      assert.match(page.response.headers.get('content-type'), /text\/html/);
      assert.equal(page.response.headers.get('cache-control'), 'no-store');
      assert.equal(page.response.headers.get('set-cookie'), null);
      assert(page.html.includes(site.company) && page.html.includes(site.business));
      assert(page.html.includes('data-public-template="bhru-v1"'));
      assert(page.html.includes('Coming soon'));
      assert(!page.html.includes('No statistics published yet') && !page.html.includes('No feedback published yet'));
      assert(!page.html.includes('id="statistics"'), 'Empty optional statistics must not render');
      assert(!/<form\b/i.test(page.html));
      for (const target of ['home', 'services', 'about', 'contact', 'customer-access']) {
        assert(page.html.includes(`id="${target}"`));
      }
      for (const [, href] of page.html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
        assert(href.startsWith('#'), 'Homepage default links must stay within the public document');
      }
      const menuSource = await readFile(new URL('../artifacts/api-server/src/lib/public-site/mobile-menu.ts', import.meta.url), 'utf8');
      const expectedMenuScript = menuSource.match(/String\.raw`([\s\S]*?)`;/)[1];
      const scripts = [...page.html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
      assert.equal(scripts.length, 1, 'Only the fixed menu interaction script is allowed');
      assert.equal(scripts[0][1], expectedMenuScript);
      assert.equal((page.html.match(/<script\b/gi) || []).length, 1);
      const scriptPolicy = page.response.headers.get('content-security-policy').match(/script-src ([^;]+)/)[1];
      assert.equal(scriptPolicy, `'sha256-${createHash('sha256').update(expectedMenuScript).digest('base64')}'`);
      assert(!page.html.includes('/api/state'));
      for (const privateField of [...fixtures.sites.flatMap(row => [row.id, row.owner, row.email, row.licence]), 'PRIVATE_PHONE', fixtures.planId, fixtures.adminPath]) {
        assert(!page.html.includes(privateField), 'Private data must not occur in public HTML');
      }
    }
    pass('ACTIVE/TRIAL share the public template, own names, honest service placeholders, optional empty sections hidden; no panel scripts/private metadata');
    for (const site of fixtures.sites.slice(2)) {
      const page = await document(`/${site.slug}`);
      assert.equal(page.status, 404);
      assert.equal(page.html, generic.html);
    }
    pass('PENDING/SUSPENDED/EXPIRED/REVOKED and elapsed ACTIVE share the unknown-site 404');
    for (const path of [`/${a.slug.toUpperCase()}`, `/${a.slug}/extra`, `/bad_slug`, '/a--b', '/a-', `/${'a'.repeat(64)}`,
      '/%2fescape', '/%252fescape', '/not.a.slug']) {
      const page = await document(path);
      assert.equal(page.status, 404);
      assert.equal(page.html, generic.html);
    }
    const head = await fetch(`${base}/${a.slug}`, { method: 'HEAD' });
    assert.equal(head.status, 200); assert.equal(await head.text(), '');
    // URL clients normalize dot segments before sending. Test the original raw
    // spelling through the document bridge instead of asserting on a rewritten `/`.
    const traversal = await fetch(`${base}/api/public/site-document?path=${encodeURIComponent('/%2e%2e')}`);
    assert.equal(traversal.status, 404); assert.equal(await traversal.text(), generic.html);
    pass('Unknown, uppercase, malformed, oversized and encoded paths return genuine 404; HEAD works');
    for (const path of ['/', '/login', '/register', '/dashboard', '/settings', '/m/general-settings',
      '/assets', '/brand', '/pwa', '/healthz', fixtures.adminPath, `${fixtures.adminPath}/subscribers`]) {
      const response = await fetch(`${base}/api/public/site-document?path=${encodeURIComponent(path)}`);
      assert.equal(response.status, 204); assert.equal(await response.text(), '');
    }
    for (const path of ['/login', '/register', '/dashboard', '/settings', '/m/general-settings', fixtures.adminPath,
      '/manifest.webmanifest', '/sw.js', '/robots.txt', '/brand/bhru-icon.png', '/pwa/offline.html']) {
      const page = await document(path);
      assert.equal(page.status, 200);
      assert(!page.html.includes('data-public-template="bhru-v1"'));
    }
    assert.equal((await api({}, '/healthz')).status, 200);
    assert.equal((await api({}, '/unknown-public-site-endpoint')).status, 404);
    assert.equal((await api({}, '/state')).status, 401);
    pass('Existing application/private-admin/API/static/PWA/health namespaces retain priority');
    const actor = {};
    assert.equal((await api(actor, '/auth/login', 'POST', { identifier: a.username, password: fixtures.password })).status, 200);
    const originalCookie = actor.cookie;
    const other = await document(`/${b.slug}?subscriberId=${a.id}`, actor);
    assert.equal(other.status, 200); assert(other.html.includes(b.company)); assert(!other.html.includes(a.company));
    assert.equal(other.response.headers.get('set-cookie'), null);
    assert.equal((await api(actor, '/state')).data.session.subscriberId, a.id);
    assert.equal(actor.cookie, originalCookie);
    assert.equal((await api(actor, `/subscribers/${a.id}/panel`)).status, 200);
    assert.equal((await api(actor, `/auth/entry?path=${encodeURIComponent(fixtures.adminPath)}`)).status, 403);
    pass('Authenticated A sees only B public names; private ownership/cookie/panel remain A; admin entry denied');

    await pool.query('UPDATE subscriber_general_settings SET company_name=$2 WHERE subscriber_id=$1',
      [b.id, '<script>PRIVATE_XSS_TEST</script> & "Company"']);
    try {
      const page = await document(`/${b.slug}`);
      assert.equal(page.status, 200);
      assert(page.html.includes('&lt;script&gt;PRIVATE_XSS_TEST&lt;/script&gt;'));
      assert(!page.html.includes('<script>PRIVATE_XSS_TEST'));
      assert.match(page.response.headers.get('content-security-policy'), /default-src 'none'/);
    } finally {
      await pool.query('UPDATE subscriber_general_settings SET company_name=$2 WHERE subscriber_id=$1', [b.id, b.company]);
    }
    pass('Public names are HTML escaped and served with a script-blocking CSP');

    const require = createRequire(new URL('../artifacts/api-server/package.json', import.meta.url));
    const { build } = require('esbuild');
    const file = new URL(`../artifacts/api-server/.public-site-check-${fixtures.tag}.mjs`, import.meta.url);
    let module;
    try {
      await build({
        stdin: { contents: 'export * from "./src/lib/public-site"; export * from "./src/lib/public-site/model"; export * from "./src/lib/public-site/data"; export * from "./src/lib/public-site/safety"; export {pool as testPool} from "@workspace/db"; export {publicSitePreview} from "../bhru/public-site-preview";',
          resolveDir: new URL('../artifacts/api-server/', import.meta.url).pathname, loader: 'ts' },
        outfile: file.pathname, platform: 'node', bundle: true, format: 'esm', logLevel: 'silent',
        banner: { js: 'import {createRequire} from "node:module"; const require=createRequire(import.meta.url);' },
      });
      module = await import(pathToFileURL(file.pathname).href);
      const modelA = module.loadSubscriberPublicSiteData({ subscriberId: a.id, businessName: a.business,
        companyName: a.company, email: 'PRIVATE_MODEL_EMAIL', licenceKey: 'PRIVATE_MODEL_LICENCE' });
      const modelB = module.loadSubscriberPublicSiteData({ subscriberId: b.id, businessName: b.business, companyName: b.company });
      assert.equal(modelA.siteName, a.company); assert.equal(modelB.siteName, b.company);
      assert(!JSON.stringify(modelA).includes(a.id) && !JSON.stringify(modelA).includes('PRIVATE_MODEL'));
      assert.notEqual(modelA.services, modelB.services);
      assert.equal(module.publicPagePath(a.slug), `/${a.slug}`);
      assert.equal(module.publicPagePath(a.slug, 'services'), `/${a.slug}/services`);
      assert.equal(module.safePublicHref('javascript:alert(1)'), '#home');
      assert.equal(module.safePublicImage('javascript:alert(1)'), null);
      assert.equal(module.safePublicColor('red;}</style><script>', '#17251e'), '#17251e');
      pass('Normalized model drops internal IDs/extra private properties, stays per-tenant and sanitizes future content fields');
      const capture = () => ({
        headers: {}, setHeader(key, value) { this.headers[key] = value; },
        status(value) { this.statusCode = value; return this; },
        type() { return this; }, end(value) { this.body = value || ''; },
      });
      for (const error of [Object.assign(new Error('PRIVATE_DATABASE_ERROR'), { code: '08006' }), null]) {
        const result = await module.resolvePublicDocument(`/${a.slug}`, { query: async () => { throw error; } });
        assert.equal(result.status, 503);
        const response = capture();
        module.writePublicDocument({ log: { error() {} } }, response, result);
        assert.equal(response.statusCode, 503);
        assert(!response.body.includes('PRIVATE_DATABASE_ERROR') && !response.body.includes('08006'));
        assert(response.body.includes('Website temporarily unavailable'));
      }
      pass('Database/service exceptions yield generic 503, never not-found or internal error details');
      for (const path of [`/${a.slug}`, `/${b.slug}`, '/unknown-site', `/${a.slug.toUpperCase()}`]) {
        const response = capture();
        await module.publicSiteNavigation({ method: 'GET', originalUrl: path, log: { error() {} } }, response,
          () => { throw new Error('Public paths must not fall through'); });
        const preview = await document(path);
        assert.equal(response.statusCode, preview.status); assert.equal(response.body, preview.html);
      }
      let forwarded = false;
      await module.publicSiteNavigation({ method: 'GET', originalUrl: fixtures.adminPath }, capture(), () => { forwarded = true; });
      assert(forwarded);
      pass('Production navigation handler and Preview return identical status/HTML; private entry passes through');
      let middleware;
      module.publicSitePreview().configureServer({ middlewares: { use(handler) { middleware = handler; } } });
      const originalFetch = globalThis.fetch;
      try {
        for (const status of [200, 404, 503]) {
          globalThis.fetch = async () => new Response('PRIVATE_UNEXPECTED_JSON', {
            status, headers: { 'Content-Type': 'application/json' },
          });
          const response = capture();
          await middleware({ method: 'GET', url: '/public-proxy-check' }, response,
            () => { throw new Error('Unexpected service data must not fall through'); });
          assert.equal(response.statusCode, 503);
          assert(!response.body.includes('PRIVATE_UNEXPECTED_JSON'));
        }
      } finally { globalThis.fetch = originalFetch; }
      pass('Unexpected/missing resolver JSON is treated as service failure 503, never a public 404 or forwarded private data');
    } finally {
      if (module) await module.testPool.end();
      await unlink(file).catch(() => {});
    }
    const listeners = {};
    let fetches = 0;
    vm.runInNewContext(await readFile(new URL('../artifacts/bhru/public/sw.js', import.meta.url), 'utf8'), {
      URL, Request, Response, console,
      self: { registration: { scope: `${base}/` }, location: { origin: base },
        addEventListener(name, handler) { listeners[name] = handler; }, clients: {} },
      fetch: async () => { fetches++; throw new Error('Offline'); },
      caches: { open: async () => ({ match: async () => new Response('PANEL_OFFLINE_NOTICE') }) },
    });
    let interception;
    const event = path => ({ request: { method: 'GET', mode: 'navigate', url: `${base}${path}`, headers: new Headers() },
      respondWith(promise) { interception = promise; } });
    listeners.fetch(event(`/${b.slug}`));
    assert.equal(interception, undefined); assert.equal(fetches, 0);
    listeners.fetch(event('/dashboard'));
    assert.equal(await (await interception).text(), 'PANEL_OFFLINE_NOTICE');
    pass('Existing worker bypasses public navigation while retaining the panel offline fallback; no worker change needed');
    console.log('Fixtures retained for the single browser verification pass; run --cleanup afterwards.');
  }
} finally { await pool.end(); }
