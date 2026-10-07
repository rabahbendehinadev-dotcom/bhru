import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from '../artifacts/api-server/node_modules/esbuild/lib/main.js';

// Pure request-context checks: no accounts, sessions or database connections.
const built = await build({
  entryPoints: ['artifacts/api-server/src/lib/commerce/currency-context.ts'],
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{
    name: 'no-database',
    setup(builder) {
      builder.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: 'db', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({
        contents: 'export const pool={query(){throw new Error("Database access is forbidden in this test")}};',
        loader: 'js',
      }));
    },
  }],
});
const { currencyReadContext } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const subscriber = { id: 'subscriber-user', subscriber_id: a, full_name: 'Subscriber', admin: false };
const admin = { id: 'admin-user', subscriber_id: null, full_name: 'Administrator', admin: true };
const request = (auth, preview, adminAuth) => ({
  auth, adminAuth,
  get: name => name.toLowerCase() === 'x-bhru-preview-subscriber' ? preview : undefined,
});
const denied = (req, status) => assert.throws(() => currencyReadContext(req), e => e.status === status);
assert.deepEqual(currencyReadContext(request(subscriber)), { subscriber_id: a, user_id: subscriber.id });
denied(request(subscriber, b), 403);
denied(request(subscriber, a, admin), 403);
assert.deepEqual(currencyReadContext(request(admin, a, admin)), { subscriber_id: a, user_id: undefined });
assert.deepEqual(currencyReadContext(request(admin, b, admin)), { subscriber_id: b, user_id: undefined });
denied(request(admin, undefined, admin), 403);
denied(request(admin, a), 401);
denied(request(undefined, a), 401);
denied(request(undefined, a, admin), 401);
assert.throws(() => currencyReadContext(request(admin, 'not-a-uuid', admin)));

const routes = fs.readFileSync('artifacts/api-server/src/routes/commerce.ts', 'utf8');
assert.match(routes, /router\.post\('\/commerce\/:resource'[\s\S]*?const user=subscriberContext\(req\)/);
assert.match(routes, /router\.delete\('\/commerce\/:resource\/:id'[\s\S]*?subscriberContext\(req\)/);
const page = fs.readFileSync('artifacts/bhru/src/pages/currencies.tsx', 'utf8');
assert.doesNotMatch(page, /260|270/);
assert.match(page, /rate: '', enabled: true, client_default: false/);
const defaults = fs.readFileSync('lib/db/src/migrations/011_new_subscriber_usd_currency.sql', 'utf8');
assert.match(defaults, /VALUES\(NEW\.id,'USD','US Dollar'[\s\S]*?1\.00000,2,true,true,true\)/);
assert.doesNotMatch(defaults.match(/CREATE OR REPLACE FUNCTION[\s\S]*/)[0], /'DZD'|'EUR'|'GBP'/);
console.log('Currency context: own-tenant subscriber, admin preview targets, forged/absent/expired context rejection, unchanged write guards, neutral help and USD-only new defaults: PASS');
