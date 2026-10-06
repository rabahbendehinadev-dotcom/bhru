// Development-only real API/database checks; no existing identities modified.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, unlink } from 'node:fs/promises';

if (process.env.NODE_ENV === 'production') throw new Error('Development verification only.');
assert(process.env.REPLIT_DEV_DOMAIN, 'Development preview domain is required.');
const require = createRequire(new URL('../lib/db/package.json', import.meta.url));
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const fixturePath = '/tmp/bhru-general-settings-verification.json';
let fixtures;
let passed = 0;
const pass = label => { passed++; console.log(`PASS ${passed}: ${label}`); };
const check = (result, expected) => assert.equal(result.status, expected, `Expected HTTP ${expected}; got ${result.status}`);

async function call(actor, path, method = 'GET', body, extra = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'X-BHRU-Request': '1',
      'X-BHRU-Auth': actor.admin ? 'admin' : 'subscriber', ...(actor.jar ? { Cookie: actor.jar } : {}), ...extra },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const cookie = response.headers.get('set-cookie');
  if (cookie) actor.jar = cookie.split(';')[0];
  return { status: response.status, data: await response.json() };
}

async function cleanup(data) {
  // Restrict cleanup to this run's reserved verification identities.
  const ids = data.subscribers.map(s => s.id);
  await pool.query(`UPDATE subscriptions SET status='SUSPENDED',updated_at=now()
    WHERE subscriber_id=ANY($1::uuid[]) AND subscriber_id IN
    (SELECT subscriber_id FROM account_users WHERE username LIKE $2)`, [ids, `gsverify_${data.tag}_%`]);
  await pool.query(`DELETE FROM sessions WHERE user_id IN
    (SELECT id FROM account_users WHERE subscriber_id=ANY($1::uuid[]) AND username LIKE $2)`, [ids, `gsverify_${data.tag}_%`]);
  await pool.query('UPDATE plans SET enabled=false WHERE id=$1 AND name=$2', [data.planId, `Settings Verification ${data.tag}`]);
  await pool.query('UPDATE platform_admin_users SET enabled=false WHERE id=$1 AND email=$2', [data.admin.id, data.admin.email]);
  await pool.query('DELETE FROM platform_admin_sessions WHERE admin_id=$1', [data.admin.id]);
  await unlink(fixturePath).catch(() => {});
}

try {
  if (process.argv.includes('--cleanup')) {
    fixtures = JSON.parse(await readFile(fixturePath, 'utf8'));
    await cleanup(fixtures);
    console.log('Verification-only accounts suspended, plan/admin disabled, sessions revoked; subscriber/settings data retained.');
  } else {
    const tag = randomBytes(6).toString('hex');
    const password = `GsV8!${randomBytes(24).toString('base64url')}`;
    const adminEmail = `gsadmin_${tag}@example.invalid`;
    const admin = { jar: '', admin: true };
    const anonymous = { jar: '' };
    const actors = [{ jar: '' }, { jar: '' }];
    const accounts = ['A', 'B'].map(letter => ({
      owner: `Settings Verification ${letter}`, business: `Settings Verification ${tag} ${letter}`,
      username: `gsverify_${tag}_${letter.toLowerCase()}`, email: `gsverify_${tag}_${letter.toLowerCase()}@example.invalid`,
      phone: '0000000000', country: 'Other', password,
    }));
    check(await call(anonymous, '/settings/general'), 401);
    pass('Anonymous General Settings read rejected');
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const result = await call(actors[i], '/auth/register', 'POST', accounts[i]);
      check(result, 201); ids.push(result.data.session.subscriberId);
      check(await call(actors[i], '/settings/general'), 403);
    }
    pass('Real registration creates two independent subscribers with one settings record each; PENDING blocks settings');
    const bootstrap = spawnSync(process.execPath,
      ['artifacts/api-server/dist/admin-promote.mjs', '--email', adminEmail, '--password-stdin'],
      { encoding: 'utf8', input: password });
    assert.equal(bootstrap.status, 0, 'Verification administrator bootstrap must succeed');
    const adminId = (await pool.query('SELECT id FROM platform_admin_users WHERE email=$1', [adminEmail])).rows[0].id;
    const entryPath = `/${process.env.PLATFORM_ADMIN_PATH}`;
    check(await call(admin, '/auth/admin-login', 'POST', { email: adminEmail, password, entryPath }), 200);
    check(await call(admin, '/state'), 200);
    check(await call(admin, '/settings/general'), 403);
    pass('Existing independent administrator login/state works; subscriber settings rejects administrator realm');
    const planResult = await call(admin, '/admin/plans', 'POST', {
      name: `Settings Verification ${tag}`, price: 0, description: 'Development verification only', highlights: '', enabled: true,
    });
    check(planResult, 200);
    const planId = planResult.data.plans.find(p => p.name === `Settings Verification ${tag}`).id;
    fixtures = { tag, planId, admin: { id: adminId, email: adminEmail, password, entryPath },
      subscribers: accounts.map((account, i) => ({ ...account, id: ids[i] })) };
    for (let i = 0; i < 2; i++) {
      check(await call(admin, `/admin/subscribers/${ids[i]}/actions`, 'POST', { action: 'approve', planId }), 200);
      check(await call({ jar: '' }, '/auth/login', 'POST', { identifier: accounts[i].username, password: 'incorrect' }), 401);
      check(await call(actors[i], '/auth/login', 'POST', { identifier: accounts[i].username, password }), 200);
      check(await call(actors[i], `/subscribers/${ids[i]}/panel`), 200);
    }
    pass('Existing subscriber login, plan assignment, licences and panel checks work for both test subscribers');
    const missing = await pool.query(`SELECT count(*)::int AS count FROM subscribers s
      LEFT JOIN subscriber_general_settings g ON g.subscriber_id=s.id WHERE g.id IS NULL`);
    assert.equal(missing.rows[0].count, 0);
    pass('All existing and newly registered subscribers have a settings record');
    const reads = await Promise.all(actors.map(actor => call(actor, '/settings/general')));
    reads.forEach((read, i) => { check(read, 200); assert.equal(read.data.subscriber_id, ids[i]); });
    const defaults = reads[0].data.values;
    assert.equal(Object.keys(defaults).length, 35);
    for (const value of Object.values(defaults)) assert(value === '' || value === false || value === null);
    assert.notEqual(reads[0].data.id, reads[1].data.id);
    pass('A reads A; B reads B; blank/false/null defaults are real, complete and independent');
    const identitySnapshot = async () => (await pool.query(`SELECT s.id,s.business,s.domain,u.id AS user_id,u.subscriber_id,
      md5(row_to_json(l)::text) AS subscription_integrity FROM subscribers s JOIN account_users u ON u.subscriber_id=s.id
      JOIN subscriptions l ON l.subscriber_id=s.id WHERE s.id=ANY($1::uuid[]) ORDER BY s.id`, [ids])).rows;
    const before = await identitySnapshot();
    const valueA = { ...defaults, company_name: 'Persisted Website A', site_name: 'A Site',
      logo_url: 'https://example.invalid/a.png', favicon_url: 'https://example.invalid/a-icon.png',
      site_link: 'http://example.invalid/a', site_ssl_link: 'https://example.invalid/a',
      page_title_format: 'Default', site_description: 'A description', site_keywords: 'A keywords',
      index_redirect: 'main.php', logout_redirect: 'logout.php',
      minimum_add_fund: '0.10', maximum_add_fund: '0.30', maximum_balance: '9007199254740993.01' };
    for (const [key, value] of Object.entries(defaults)) if (typeof value === 'boolean') valueA[key] = true;
    const valueB = { ...defaults, company_name: 'Persisted Website B', site_name: 'B Site',
      minimum_add_fund: '10.25', maximum_add_fund: '500.75', maximum_balance: '5000.00', blog: true, show_service_icon: true };
    check(await call(anonymous, '/settings/general', 'PUT', valueA), 401);
    check(await call(admin, '/settings/general', 'PUT', valueA), 403);
    check(await call(actors[0], '/settings/general', 'PUT', valueA), 200);
    check(await call(actors[1], '/settings/general', 'PUT', valueB), 200);
    const savedA = (await call(actors[0], '/settings/general')).data;
    const savedB = (await call(actors[1], '/settings/general')).data;
    assert.deepEqual(savedA.values, valueA); assert.deepEqual(savedB.values, valueB);
    assert.deepEqual(await identitySnapshot(), before);
    pass('All 35 fields persist independently; decimals beyond JS safe integers remain exact; business/domain/ownership/licence rows are unchanged');
    for (let i = 0; i < 2; i++) {
      const other = ids[1 - i];
      for (const key of ['subscriber_id', 'subscriberId', 'tenant_id', 'server_id', 'id']) {
        check(await call(actors[i], `/settings/general?${key}=${other}`), 400);
        check(await call(actors[i], `/settings/general?${key}=${other}`, 'PUT', i ? valueB : valueA), 400);
        check(await call(actors[i], '/settings/general', 'PUT', { ...(i ? valueB : valueA), [key]: other }), 400);
      }
      for (const path of [`/settings/general/${other}`, `/settings/${other}`, `/subscribers/${other}/settings/general`]) {
        check(await call(actors[i], path), 404);
        check(await call(actors[i], path, 'PUT', i ? valueB : valueA), 404);
      }
      check(await call(actors[i], `/subscribers/${other}`), 403);
      const header = await call(actors[i], '/settings/general', 'GET', undefined, { 'X-Subscriber-ID': other });
      check(header, 200); assert.equal(header.data.subscriber_id, ids[i]);
      check(await call(actors[i], '/settings/general', 'PUT', i ? valueB : valueA, { 'X-Subscriber-ID': other }), 200);
    }
    assert.deepEqual((await call(actors[0], '/settings/general')).data.values, valueA);
    assert.deepEqual((await call(actors[1], '/settings/general')).data.values, valueB);
    pass('Bidirectional isolation: manipulated query/body/path IDs rejected; forged headers cannot choose another owner or alter the other record');
    const invalid = [
      { company_name: 'x'.repeat(201) }, { site_name: null }, { logo_url: 'javascript:alert(1)' },
      { favicon_url: 'data:image/png;base64,invalid' }, { site_ssl_link: 'http://example.invalid' },
      { site_link: 'https://user:password@example.invalid' }, { blog: 'true' }, { seo_friendly_url: 1 },
      { minimum_add_fund: 1.25 }, { minimum_add_fund: '-1.00' }, { minimum_add_fund: '1.001' },
      { maximum_balance: '10000000000000000.00' }, { maximum_balance: '1e3' },
      { minimum_add_fund: '100.00', maximum_add_fund: '99.99' },
      { page_title_format: 'invented' }, { index_redirect: 'main.php\nbad' }, { extra_setting: true },
      { company_name: 'x'.repeat(33000) },
    ];
    for (const patch of invalid) {
      const result = await call(actors[0], '/settings/general', 'PUT', { ...valueA, ...patch });
      assert([400, 413].includes(result.status), `Invalid input returned ${result.status}`);
    }
    check(await call(actors[0], '/settings/general', 'PUT', {}), 400);
    check(await call(actors[0], '/settings/general', 'PUT', valueA, { 'X-BHRU-Request': '' }), 403);
    check(await call(actors[0], '/settings/general', 'PUT', valueA, { Origin: 'https://attacker.invalid' }), 403);
    assert.deepEqual((await call(actors[0], '/settings/general')).data.values, valueA);
    pass('Strict server validation and existing CSRF reject malformed strings, URLs, money, booleans, nulls, omissions and extra fields without modifying saved values');
    // Only this run's test subscription is changed for eligibility checks.
    for (const status of ['PENDING', 'SUSPENDED', 'EXPIRED', 'REVOKED']) {
      await pool.query('UPDATE subscriptions SET status=$2 WHERE subscriber_id=$1', [ids[0], status]);
      check(await call(actors[0], '/settings/general'), 403);
      check(await call(actors[0], '/settings/general', 'PUT', valueA), 403);
    }
    await pool.query("UPDATE subscriptions SET status='ACTIVE',expires_at=now()-interval '1 second' WHERE subscriber_id=$1", [ids[0]]);
    check(await call(actors[0], '/settings/general'), 403);
    check(await call(actors[0], '/settings/general', 'PUT', valueA), 403);
    await pool.query("UPDATE subscriptions SET status='ACTIVE',expires_at=now()+interval '30 days' WHERE subscriber_id=$1", [ids[0]]);
    assert.deepEqual((await call(actors[0], '/settings/general')).data.values, valueA);
    pass('PENDING/SUSPENDED/EXPIRED/REVOKED and elapsed ACTIVE licences block reads and writes while preserving settings');
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      for (const query of [
        ['INSERT INTO subscriber_general_settings(id,subscriber_id) VALUES(gen_random_uuid(),$1)', [ids[0]]],
        ['INSERT INTO subscriber_general_settings(id,subscriber_id) VALUES(gen_random_uuid(),gen_random_uuid())', []],
        ['UPDATE subscriber_general_settings SET minimum_add_fund=-1 WHERE subscriber_id=$1', [ids[0]]],
        ['UPDATE subscriber_general_settings SET minimum_add_fund=50,maximum_add_fund=1 WHERE subscriber_id=$1', [ids[0]]],
      ]) {
        await db.query('SAVEPOINT invalid_setting');
        await assert.rejects(() => db.query(...query), error => ['23505', '23503', '23514'].includes(error.code));
        await db.query('ROLLBACK TO SAVEPOINT invalid_setting');
      }
      await db.query('ROLLBACK');
    } finally { db.release(); }
    pass('Database UNIQUE/FK and nonnegative/min-max constraints independently protect settings storage');
    await writeFile(fixturePath, JSON.stringify(fixtures), { mode: 0o600 });
    console.log(`Complete: ${passed} verification groups passed. Private Development-only browser fixture saved in /tmp; credentials were not printed.`);
    if (!process.argv.includes('--keep-for-browser')) await cleanup(fixtures);
  }
} catch (error) {
  if (fixtures) await cleanup(fixtures).catch(() => {});
  throw error;
} finally {
  await pool.end();
}
