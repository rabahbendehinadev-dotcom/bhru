import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const origin = 'https://bhru.example';
const events = new Map(), saved = new Map();
let online = true, clientUrl = `${origin}/dashboard`, networkCalls = 0;
let navigationCacheMode;
const cache = {
  addAll: async requests => { for (const request of requests) saved.set(request.url, new Response('public offline fallback')); },
  match: async request => saved.get(new URL(typeof request === 'string' ? request : request.url, origin).href)?.clone(),
  put: async (request, response) => saved.set(request.url, response),
  keys: async () => [...saved.keys()].map(url => new Request(url)),
  delete: async request => saved.delete(request.url),
};
const context = vm.createContext({
  URL, Response, console,
  Request: class extends Request {
    constructor(request, options) { super(typeof request === 'string' ? new URL(request, origin) : request, options); }
  },
  caches: { open: async () => cache, keys: async () => [], delete: async () => true },
  fetch: async (request, options) => {
    networkCalls++;
    if (request.mode === 'navigate') navigationCacheMode = options?.cache;
    if (!online) throw new TypeError('Network unavailable');
    const response = new Response('public static asset', { headers: { 'Cache-Control': 'public' } });
    Object.defineProperty(response, 'type', { value: 'basic' });
    return response;
  },
  self: {
    registration: { scope: `${origin}/` }, location: { origin },
    clients: { get: async () => clientUrl ? { url: clientUrl } : undefined, claim: async () => {} },
    addEventListener: (name, handler) => events.set(name, handler),
  },
});
vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
let install;
events.get('install')({ waitUntil: promise => { install = promise; } });
await install;
assert.equal(saved.size, 5);
assert([...saved.keys()].every(url => new URL(url).pathname.startsWith('/pwa/')));

async function request(path, options = {}) {
  let response;
  events.get('fetch')({
    request: { url: new URL(path, origin).href, method: 'GET', headers: new Headers(), mode: 'cors', ...options },
    clientId: 'isolated-test-client',
    respondWith: promise => { response = promise; },
  });
  return response ? { intercepted: true, response: await response } : { intercepted: false };
}
for (const path of ['/api/state', '/api/auth/entry', '/api/subscribers/account/panel', '/api']) {
  assert.equal((await request(path)).intercepted, false, `API must bypass worker: ${path}`);
}
assert.equal((await request('/assets/index.js', { method: 'POST' })).intercepted, false);
assert.equal((await request('/assets/index.js', { headers: new Headers({ Authorization: 'test-only' }) })).intercepted, false);
assert.equal((await request('https://external.example/assets/script.js')).intercepted, false);
assert.equal((await request('/private-control', { mode: 'navigate' })).intercepted, false);
assert.equal((await request('/private-control/users', { mode: 'navigate' })).intercepted, false);
assert.equal((await request('/src/main.tsx')).intercepted, false);

await request('/dashboard', { mode: 'navigate' });
assert.equal(navigationCacheMode, 'no-store', 'Navigation must not reuse HTTP-cache HTML while offline');
assert.equal(saved.has(`${origin}/dashboard`), false, 'Never cache page HTML');
await request('/assets/index-hashed.js');
assert.equal(saved.has(`${origin}/assets/index-hashed.js`), true, 'Cache public production assets');
const before = networkCalls;
await request('/assets/index-hashed.js');
assert.equal(networkCalls, before, 'Immutable asset should be served from static cache');
clientUrl = `${origin}/private-control`;
await request('/assets/admin-hashed.js');
assert.equal(saved.has(`${origin}/assets/admin-hashed.js`), false, 'Private-page assets must pass through without caching');
clientUrl = null;
await request('/assets/unknown-client.js');
assert.equal(saved.has(`${origin}/assets/unknown-client.js`), false, 'Unknown clients must not populate subscriber cache');
clientUrl = `${origin}/dashboard`;
online = false;
const offline = await request('/m/customers', { mode: 'navigate' });
assert.equal(await offline.response.text(), 'public offline fallback');
assert([...saved.keys()].every(url => !url.includes('/api/') && !url.includes('/private-control')));
console.log('PWA worker checks passed: API/private-route bypass, no account/page caching, public asset cache, offline fallback.');