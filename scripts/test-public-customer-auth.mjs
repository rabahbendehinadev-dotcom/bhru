// Focused HTTP/auth checks with an isolated in-memory database substitute.
// No production/development database, migrations, browser, DNS or storage writes.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { request as httpRequest } from 'node:http';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(root, 'artifacts/api-server/package.json'));
const express = require('express');
process.env.SESSION_SECRET = 'isolated-public-customer-auth-test-secret-not-production';
process.env.NODE_ENV = 'production';
process.env.PLATFORM_ADMIN_PATH = 'private-test-entry';
process.env.BHRU_PLATFORM_HOSTS = 'bhru.net,www.bhru.net';
const tenantA = randomUUID(), tenantB = randomUUID();
const tenants = new Map([
  ['site-a', { id: tenantA, businessName: 'Site A', companyName: 'Site A', eligible: true }],
  ['site-b', { id: tenantB, businessName: 'Site B', companyName: 'Site B', eligible: true }],
]);
const domain = (hostname, subscriber_id, public_slug) => ({
  id: randomUUID(), hostname, subscriber_id, public_slug,
  verification_status: 'verified', dns_status: 'ready', tls_status: 'ready', dns_checked_at: new Date(),
});
const domains = new Map([
  ['shop-a.example.com', domain('shop-a.example.com', tenantA, 'site-a')],
  ['shop-b.example.com', domain('shop-b.example.com', tenantB, 'site-b')],
]);
const accounts = new Map(), sessions = new Map(), limits = new Map(), statements = [];
const rows = result => ({ rows: result, rowCount: result.length });
const profileRow = c => ({ id: c.id, subscriber_id: c.subscriber_id, firstName: c.firstName, lastName: c.lastName, email: c.email });
const db = { async query(sql, p = []) {
  statements.push(sql);
  if (sql.includes('WHERE d.hostname=$1')) return rows(domains.has(p[0]) ? [domains.get(p[0])] : []);
  if (sql.includes('FROM subscribers s JOIN subscriptions l')) {
    const t = tenants.get(p[0]);
    return rows(t?.eligible ? [{ subscriberId: t.id, businessName: t.businessName, companyName: t.companyName }] : []);
  }
  if (sql === 'SELECT id FROM subscribers WHERE public_slug=$1') return rows(tenants.has(p[0]) ? [{ id: tenants.get(p[0]).id }] : []);
  if (sql.startsWith('INSERT INTO auth_rate_limits')) {
    const attempts = (limits.get(p[0]) ?? 0) + 1; limits.set(p[0], attempts); return rows([{ attempts }]);
  }
  if (sql.startsWith('INSERT INTO public_customer_accounts')) {
    const [id, subscriber_id, firstName, lastName, email, password_hash] = p;
    const key = subscriber_id + ':' + email;
    if (!accounts.has(key)) accounts.set(key, { id, subscriber_id, firstName, lastName, email, password_hash, enabled: true });
    return rows([]);
  }
  if (sql.includes('FROM public_customer_accounts WHERE subscriber_id=$1 AND email=$2')) {
    const c = accounts.get(p[0] + ':' + p[1]);
    return rows(c ? [{ ...profileRow(c), password_hash: c.password_hash, enabled: c.enabled }] : []);
  }
  if (sql.includes('FROM public_customer_sessions s JOIN public_customer_accounts c')) {
    const s = sessions.get(p[0]), c = [...accounts.values()].find(c => c.id === s?.customer_id);
    return rows(s && c && s.subscriber_id === p[1] && c.subscriber_id === p[1] && c.enabled && s.expires_at > new Date() ? [profileRow(c)] : []);
  }
  if (sql.startsWith('DELETE FROM public_customer_sessions WHERE token_hash=')) {
    if (sessions.get(p[0])?.subscriber_id === p[1]) sessions.delete(p[0]); return rows([]);
  }
  if (sql.startsWith('DELETE FROM public_customer_sessions WHERE subscriber_id=')) {
    for (const [hash, s] of sessions) if (s.subscriber_id === p[0] && s.customer_id === p[1] && s.expires_at <= new Date()) sessions.delete(hash);
    return rows([]);
  }
  if (sql.startsWith('INSERT INTO public_customer_sessions')) {
    assert.ok([...accounts.values()].some(c => c.id === p[2] && c.subscriber_id === p[1]), 'Composite session FK must hold');
    sessions.set(p[0], { subscriber_id: p[1], customer_id: p[2], expires_at: new Date(Date.now() + 604800000) }); return rows([]);
  }
  throw new Error('Unexpected simulated SQL: ' + sql);
} };
globalThis.__customerAuthDB = db;
globalThis.__customerAuthModels = new Map();
const bundle = await build({
  stdin: { resolveDir: root, loader: 'ts', contents: `
    export {customerPublicContext,resolveCustomerTenant} from './artifacts/api-server/src/lib/customer-auth/context';
    export {default as router} from './artifacts/api-server/src/routes/customer-auth';
    export {normalizePublicSite} from './artifacts/api-server/src/lib/public-site/model';
    export {customerLinks,withCustomerAccess,withRequestCustomer} from './artifacts/api-server/src/lib/customer-auth/links';
    export {renderCustomerDocument,CUSTOMER_AUTH_SCRIPT,CUSTOMER_AUTH_HASH} from './artifacts/api-server/src/lib/customer-auth/ui';
    export {renderPublicHome} from './artifacts/api-server/src/lib/public-site/homepage';
    export {renderCommerceDocument} from './artifacts/api-server/src/lib/commerce/public-render';
  ` },
  bundle: true, platform: 'node', format: 'esm', write: false,
  define: { 'import.meta.dirname': JSON.stringify(resolve(root, 'artifacts/api-server/dist')) },
  banner: { js: `import {createRequire as mk} from 'node:module';const require=mk(${JSON.stringify(resolve(root, 'artifacts/api-server/package.json'))});` },
  plugins: [{ name: 'isolated-customer-db', setup(b) {
    b.onResolve({ filter: /^express$/ }, () => ({ path: pathToFileURL(require.resolve('express')).href, external: true }));
    b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'db', namespace: 'test' }));
    b.onResolve({ filter: /(?:^|\/)platform$/ }, () => ({ path: 'platform', namespace: 'test' }));
    b.onResolve({ filter: /(?:^|\/)logger$/ }, () => ({ path: 'logger', namespace: 'test' }));
    b.onResolve({ filter: /public-site\/data$/ }, () => ({ path: 'public-data', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, a => ({ loader: 'js', contents:
      a.path === 'db' ? 'export const pool=globalThis.__customerAuthDB;' :
      a.path === 'platform' ? 'export const transaction=fn=>fn(globalThis.__customerAuthDB);export const getSubscriber=async()=>({allowed:true});export const audit=async()=>{};export const cleanSubscriber=()=>{};' :
      a.path === 'logger' ? 'export const logger={error(){},info(){},warn(){}};' :
      'export const loadSubscriberPublicSiteData=async r=>globalThis.__customerAuthModels.get(r.subscriberId);',
    }));
  } }],
});
const auth = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
for (const t of tenants.values()) globalThis.__customerAuthModels.set(t.id, auth.normalizePublicSite(t));
let privateCalls = 0, unexpectedError;
const app = express();
app.use((req, _res, next) => { req.log = { error() {} }; next(); });
app.use(auth.customerPublicContext, auth.router);
app.get('/:slug', (req, res, next) => {
  if (!req.customerPublic) { next(); return; }
  res.type('html').send(auth.renderPublicHome(auth.withRequestCustomer(req.customerPublic.tenant.model, req)));
});
app.use((_req, res) => { privateCalls++; res.json({ privateRealm: true }); });
app.use((err, _req, res, _next) => {
  if (!err.status && err.name !== 'ZodError') unexpectedError = err;
  const fields = err.name === 'ZodError' ? Object.fromEntries(err.issues.map(i => [i.path.join('.'), i.message])) : undefined;
  res.status(err.status || (fields ? 400 : 500)).json({ error: fields ? 'Check the entered values.' : err.message, ...(fields ? { fields } : {}) });
});
const server = app.listen(0, '127.0.0.1');
await new Promise(ok => server.once('listening', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
let checks = 0;
async function request(path, { host = 'bhru.net', cookie, body, method = body ? 'POST' : 'GET', extra = {} } = {}) {
  // Node 24 fetch ignores an overridden Host. HTTP request preserves it, so
  // these tests exercise the actual host-routing boundary rather than localhost.
  const response = await new Promise((ok, fail) => {
    const req = httpRequest(origin + path, { method, headers: {
      Host: host, ...(body ? { 'Content-Type': 'application/json', 'X-BHRU-Customer-Request': '1', Origin: 'http://' + host } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...extra,
    } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) headers.append(key, item);
        }
        ok({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8'), headers });
      });
    });
    req.on('error', fail); req.end(body ? JSON.stringify(body) : undefined);
  });
  const text = response.text;
  let data; try { data = JSON.parse(text); } catch { data = null; }
  if (unexpectedError) throw unexpectedError;
  return { status: response.status, data, text, headers: response.headers };
}
const passA = 'example-customer-password-a', passB = 'example-customer-password-b';
const registration = (password = passA) => ({ firstName: ' Ada ', lastName: ' Visitor ', email: ' Customer@Example.com ', password, confirmPassword: password });
const apiA = '/api/public/customer/site-a', apiB = '/api/public/customer/site-b';
const cookieOf = result => result.headers.get('set-cookie')?.split(';')[0];
try {
  const first = await request(apiA + '/register', { body: registration() });
  assert.equal(first.status, 201); assert.equal(first.data.next, '/site-a/customer/login?registered=1');
  assert.equal(first.headers.get('set-cookie'), null, 'Registration must not auto-authenticate a duplicate address');
  const cA = accounts.get(tenantA + ':customer@example.com');
  assert.equal(cA.firstName, 'Ada'); assert.match(cA.password_hash, /^scrypt\$/); assert.notEqual(cA.password_hash, passA); checks++;

  const duplicate = await request(apiA + '/register', { body: { ...registration(passB), firstName: 'Overwrite' } });
  assert.deepEqual(duplicate.data, first.data); assert.equal(duplicate.status, first.status); assert.equal(accounts.size, 1);
  assert.equal(accounts.get(tenantA + ':customer@example.com').firstName, 'Ada'); checks++;
  const concurrent = await Promise.all([1, 2].map(() => request(apiA + '/register', { body: registration() })));
  assert.ok(concurrent.every(r => r.status === 201)); assert.equal(accounts.size, 1); checks++;

  await request(apiB + '/register', { body: registration(passB) });
  assert.equal(accounts.size, 2, 'Same normalized email can exist independently per tenant'); checks++;
  limits.clear();
  for (const invalid of [
    { ...registration(), subscriber_id: tenantB },
    { ...registration(), firstName: ' ' },
    { ...registration(), email: 'not-an-email' },
    { ...registration(), confirmPassword: 'does-not-match' },
    { ...registration(), password: 'short', confirmPassword: 'short' },
  ]) assert.equal((await request(apiA + '/register', { body: invalid })).status, 400);
  assert.equal(accounts.size, 2); checks++;
  limits.clear();
  const wrong = await request(apiA + '/login', { body: { email: 'customer@example.com', password: passB } });
  const missing = await request(apiA + '/login', { body: { email: 'missing@example.com', password: passB } });
  const crossPassword = await request(apiB + '/login', { body: { email: 'customer@example.com', password: passA } });
  assert.equal(wrong.status, 401); assert.deepEqual(wrong.data, missing.data); assert.deepEqual(wrong.data, crossPassword.data); checks++;

  const loggedA = await request(apiA + '/login', { body: { email: ' CUSTOMER@example.com ', password: passA } });
  const loggedB = await request(apiB + '/login', { body: { email: 'customer@example.com', password: passB } });
  assert.equal(loggedA.status, 200); assert.equal(loggedA.data.next, '/site-a/customer/account');
  assert.deepEqual(Object.keys(loggedA.data.customer).sort(), ['email', 'firstName', 'lastName']);
  const cookieA = cookieOf(loggedA), cookieB = cookieOf(loggedB);
  const setCookie = loggedA.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /Secure/); assert.match(setCookie, /SameSite=Lax/); assert.match(setCookie, /Path=\//); assert.doesNotMatch(setCookie, /Domain=/i); checks++;
  assert.equal((await request(apiA + '/session', { cookie: cookieA })).data.customer.email, 'customer@example.com');
  assert.equal((await request(apiB + '/session', { cookie: cookieA })).data.customer, null);
  assert.equal((await request(apiB + '/session', { cookie: cookieA.replace('site-a=', 'site-b=') })).data.customer, null);
  assert.ok((await request(apiB + '/session', { cookie: cookieA + '; ' + cookieB })).data.customer); checks++;
  assert.equal((await request(apiA + '/session', { cookie: cookieA.slice(0, -1) + (cookieA.endsWith('0') ? '1' : '0') })).data.customer, null); checks++;
  const raw = cookieA.split('=')[1];
  assert.equal((await request(apiA + '/session', { cookie: `bhru_session=${raw}; bhru_admin_session=${raw}`, extra: { 'X-BHRU-Auth': 'admin' } })).data.customer, null); checks++;

  const accountPage = await request('/site-a/customer/account', { cookie: cookieA });
  assert.equal(accountPage.status, 200); assert.match(accountPage.text, /customer@example\.com/);
  assert.match(accountPage.text, /My account/); assert.match(accountPage.text, /<button[^>]*data-customer-logout/);
  assert.doesNotMatch(accountPage.text, new RegExp(tenantA + '|' + cA.id + '|password_hash')); checks++;
  assert.equal((await request('/site-a/customer/account')).headers.get('location'), '/site-a/customer/login');
  assert.equal((await request('/site-a/customer/login', { cookie: cookieA })).headers.get('location'), '/site-a/customer/account'); checks++;
  cA.enabled = false;
  assert.equal((await request(apiA + '/session', { cookie: cookieA })).data.customer, null);
  const disabledLogin = await request(apiA + '/login', { body: { email: 'customer@example.com', password: passA } });
  assert.equal(disabledLogin.status, 401); assert.deepEqual(disabledLogin.data, wrong.data);
  cA.enabled = true; checks++;
  cA.firstName = '<script>alert("test")</script>';
  const escapedProfile = await request('/site-a/customer/account', { cookie: cookieA });
  assert.ok(escapedProfile.text.includes('&lt;script&gt;'));
  assert.ok(!escapedProfile.text.includes('<script>alert("test")</script>'));
  cA.firstName = 'Ada'; checks++;
  const loginPage = await request('/site-a/customer/login');
  const registerPage = await request('/site-a/customer/register');
  assert.match(loginPage.text, /method="post"/); assert.match(registerPage.text, /name="confirmPassword"/);
  assert.match(loginPage.text, /href="\/site-a\/customer\/register"/); assert.doesNotMatch(registerPage.text, /href="\/(?:login|register)"/);
  assert.match(loginPage.headers.get('content-security-policy'), new RegExp(`'sha256-${auth.CUSTOMER_AUTH_HASH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`)); checks++;

  const home = await request('/site-a', { cookie: cookieA });
  assert.match(home.text, /My account/); assert.match(home.text, /<button[^>]*data-customer-logout/);
  const guestHome = await request('/site-a');
  assert.match(guestHome.text, /href="\/site-a\/customer\/login"/); assert.match(guestHome.text, /href="\/site-a\/customer\/register"/);
  assert.ok(!/href="#customer-access"|Customer access coming soon/i.test(guestHome.text), 'Customer actions must not be placeholder notices'); checks++;
  const preview = auth.renderPublicHome(auth.withCustomerAccess(auth.normalizePublicSite(tenants.get('site-a')), auth.customerLinks('site-a')));
  assert.match(preview, /href="\/site-a\/customer\/register"/); assert.ok(!/<button[^>]*data-customer-logout/.test(preview), 'CMS preview must show logged-out actions'); checks++;
  const commerce = auth.renderCommerceDocument(auth.withCustomerAccess(auth.normalizePublicSite(tenants.get('site-a')), auth.customerLinks('site-a')),
    'site-a', { currency: 'USD', money_model_version: 2, title: 'Our Products', featured_first: true }, 'home', { data: [] }, []);
  assert.match(commerce, /sf-auth/); assert.match(commerce, /href="\/site-a\/customer\/register"/);
  const commerceMarkup = commerce.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  assert.ok(!/data-sf-auth|id="sf-customer-auth"|Customer Login and Register are not available yet/.test(commerceMarkup), 'Storefront must use real customer auth actions'); checks++;

  const customPage = await request('/customer/register', { host: 'shop-a.example.com' });
  assert.equal(customPage.status, 200); assert.match(customPage.text, /href="\/customer\/login"/); assert.doesNotMatch(customPage.text, /href="\/site-a/); checks++;
  const customLogin = await request(apiA + '/login', { host: 'shop-a.example.com', body: { email: 'customer@example.com', password: passA } });
  assert.equal(customLogin.status, 200); assert.equal(customLogin.data.next, '/customer/account');
  assert.ok((await request('/customer/account', { host: 'shop-a.example.com', cookie: cookieOf(customLogin) })).text.includes('My account')); checks++;
  assert.equal((await request(apiB + '/session', { host: 'shop-a.example.com', cookie: cookieB })).status, 404);
  assert.equal((await request('/customer/login', { host: 'unknown.example.com', extra: { 'X-Forwarded-Host': 'shop-a.example.com' } })).status, 404); checks++;
  domains.get('shop-a.example.com').tls_status = 'pending';
  assert.equal((await request('/customer/login', { host: 'shop-a.example.com' })).status, 404);
  domains.get('shop-a.example.com').tls_status = 'ready';
  domains.get('shop-a.example.com').dns_checked_at = new Date(Date.now() - 90000000);
  assert.equal((await request(apiA + '/session', { host: 'shop-a.example.com' })).status, 404);
  domains.get('shop-a.example.com').dns_checked_at = new Date(); checks++;
  tenants.get('site-a').eligible = false;
  assert.equal((await request(apiA + '/session', { cookie: cookieA })).status, 404);
  tenants.get('site-a').eligible = true; checks++;
  assert.equal((await request(apiA + '/login', { body: { email: 'customer@example.com', password: passA }, extra: { Origin: 'https://attacker.example' } })).status, 403);
  assert.equal((await request(apiA + '/logout', { cookie: cookieA, body: {}, extra: { 'X-BHRU-Customer-Request': '0' } })).status, 403); checks++;
  await assert.rejects(auth.resolveCustomerTenant({
    headers: { host: 'bhru.net' }, rawHeaders: ['Host', 'bhru.net', 'Host', 'shop-a.example.com'],
  }, '/site-a/customer/login', db), { status: 400 }); checks++;

  const rotated = await request(apiA + '/login', { cookie: cookieA, body: { email: 'customer@example.com', password: passA } });
  const rotatedCookie = cookieOf(rotated);
  assert.equal((await request(apiA + '/session', { cookie: cookieA })).data.customer, null);
  assert.ok((await request(apiA + '/session', { cookie: rotatedCookie })).data.customer); checks++;
  const hash = createHash('sha256').update(rotatedCookie.split('=')[1].split('.')[0]).digest('hex');
  sessions.get(hash).expires_at = new Date(0);
  assert.equal((await request(apiA + '/session', { cookie: rotatedCookie })).data.customer, null); checks++;
  limits.clear();
  const activeAgain = await request(apiA + '/login', { body: { email: 'customer@example.com', password: passA } });
  const logout = await request(apiA + '/logout', { cookie: cookieOf(activeAgain), body: {} });
  assert.equal(logout.status, 200); assert.equal(logout.data.next, '/site-a');
  assert.match(logout.headers.get('set-cookie'), /bhru_customer_site-a=;/);
  assert.doesNotMatch(logout.headers.get('set-cookie'), /bhru_session|bhru_admin_session|site-b/);
  assert.equal((await request(apiA + '/session', { cookie: cookieOf(activeAgain) })).data.customer, null);
  assert.ok((await request(apiB + '/session', { cookie: cookieB })).data.customer); checks++;
  limits.clear();
  for (let i = 0; i < 10; i++) assert.equal((await request(apiA + '/login', { body: { email: 'limit@example.com', password: 'incorrect' } })).status, 401);
  assert.equal((await request(apiA + '/login', { body: { email: 'limit@example.com', password: 'incorrect' } })).status, 429); checks++;
  const beforePrivate = statements.length;
  await request('/login'); await request('/register'); await request('/private-test-entry');
  assert.equal(statements.length, beforePrivate, 'Private routes must not query customer or tenant data');
  assert.equal(privateCalls, 3); checks++;
  const beforeCustomerGet = privateCalls;
  assert.equal((await request(apiA + '/login')).status, 404);
  assert.equal(privateCalls, beforeCustomerGet, 'Customer routes must not enter owner middleware'); checks++;
  const sql = readFileSync(resolve(root, 'lib/db/src/migrations/019_public_customer_auth.sql'), 'utf8');
  assert.match(sql, /UNIQUE\(subscriber_id,email\)/); assert.match(sql, /FOREIGN KEY\(subscriber_id,customer_id\)/);
  assert.doesNotMatch(sql, /ALTER TABLE (?:sessions|account_users|store_orders)|INSERT INTO|DROP|TRUNCATE/); checks++;
  process.stdout.write(`Public customer auth: ${checks} focused groups passed (isolated HTTP + real password hashing; no real DB/browser).\n`);
} finally {
  server.closeAllConnections();
  await new Promise(ok => server.close(ok));
  delete globalThis.__customerAuthDB; delete globalThis.__customerAuthModels;
}
