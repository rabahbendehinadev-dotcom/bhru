// Development-only Phase 1 verification. Fixtures are uniquely owned by this
// run; cleanup never deletes pre-existing subscriber/business data.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { readFile, writeFile, unlink } from 'node:fs/promises';

assert(process.env.NODE_ENV !== 'production', 'Development verification only.');
assert(process.env.REPLIT_DEV_DOMAIN, 'Development workspace required.');
assert(process.env.PLATFORM_ADMIN_PATH, 'Existing private entry required.');
const require = createRequire(new URL('../lib/db/package.json', import.meta.url));
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const path = '/tmp/bhru-public-slug-verification.json';
const privateSegment = process.env.PLATFORM_ADMIN_PATH;
const tables = ['subscribers', 'account_users', 'subscriptions', 'subscriber_general_settings', 'plans', 'platform_admin_users'];
let fixtures;
let passed = 0;
const pass = label => console.log(`PASS ${++passed}: ${label}`);
const fingerprint = async ids => {
  const result = {};
  for (const table of tables) {
    // Identifiers are from the constant allowlist above, never user input.
    const columns = table === 'subscribers' ? 'id,business,notes,domain,created_at' : '*';
    const excluded = table === 'platform_admin_users' ? [fixtures?.adminId].filter(Boolean) : ids;
    result[table] = (await pool.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(row_to_json(t)::text,'|' ORDER BY id),'')) AS hash
      FROM (SELECT ${columns} FROM ${table} WHERE id <> ALL($1::uuid[])) t`, [excluded])).rows[0];
  }
  return result;
};
let pendingSave = Promise.resolve();
const save = () => {
  const data = JSON.stringify(fixtures);
  pendingSave = pendingSave.then(() => writeFile(path, data, { mode: 0o600 }));
  return pendingSave;
};
const baseline = async () => {
  // Related fixture records have independent IDs; exclude via subscriber FK.
  const result = {};
  for (const table of tables) {
    const columns = table === 'subscribers' ? 'id,business,notes,domain,created_at' : '*';
    const key = ['account_users', 'subscriptions', 'subscriber_general_settings'].includes(table) ? 'subscriber_id' : 'id';
    const ids = table === 'platform_admin_users' ? [fixtures?.adminId].filter(Boolean) : fixtures.ids;
    result[table] = (await pool.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(row_to_json(t)::text,'|' ORDER BY id),'')) AS hash
      FROM (SELECT ${columns} FROM ${table} WHERE ${key} <> ALL($1::uuid[])) t`, [ids])).rows[0];
  }
  return result;
};
async function cleanup() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Verify marker ownership before deleting any identities from this run.
    const owned = (await client.query(`SELECT id FROM subscribers WHERE id=ANY($1::uuid[])
      AND (notes=$2 OR id IN (SELECT subscriber_id FROM account_users WHERE username LIKE $3))`,
      [fixtures.ids, `slugverify:${fixtures.tag}`, `slugverify_${fixtures.tag}_%`])).rows.map(row => row.id);
    await client.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM account_users WHERE subscriber_id=ANY($1::uuid[]))', [owned]);
    await client.query('DELETE FROM audit_logs WHERE target_id::text=ANY($1::text[])', [owned]);
    await client.query('DELETE FROM subscriber_general_settings WHERE subscriber_id=ANY($1::uuid[])', [owned]);
    await client.query('DELETE FROM activations WHERE subscription_id IN (SELECT id FROM subscriptions WHERE subscriber_id=ANY($1::uuid[]))', [owned]);
    await client.query('DELETE FROM subscriptions WHERE subscriber_id=ANY($1::uuid[])', [owned]);
    await client.query('DELETE FROM account_users WHERE subscriber_id=ANY($1::uuid[])', [owned]);
    await client.query('DELETE FROM subscribers WHERE id=ANY($1::uuid[])', [owned]);
    if (fixtures.adminId) {
      await client.query('DELETE FROM platform_admin_sessions WHERE admin_id=$1', [fixtures.adminId]);
      await client.query('DELETE FROM platform_admin_users WHERE id=$1 AND email=$2',
        [fixtures.adminId, `slugadmin_${fixtures.tag}@example.invalid`]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function call(actor, endpoint, method = 'GET', body) {
  const res = await fetch(`https://${process.env.REPLIT_DEV_DOMAIN}/api${endpoint}`, {
    method, redirect: 'manual', headers: { 'Content-Type': 'application/json', 'X-BHRU-Request': '1',
      'X-BHRU-Auth': actor.admin ? 'admin' : 'subscriber', ...(actor.jar ? { Cookie: actor.jar } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (res.headers.get('set-cookie')) actor.jar = res.headers.get('set-cookie').split(';')[0];
  return { status: res.status, data: await res.json() };
}
async function rejectedSQL(sql, params, code) {
  await assert.rejects(pool.query(sql, params), error => error.code === code);
}
try {
  if (process.argv.includes('--seed')) {
    assert.equal((await pool.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscribers' AND column_name='public_slug'")).rowCount, 0,
      'Legacy fixture seeding must precede the Phase 1 migration.');
    fixtures = { tag: randomBytes(6).toString('hex'), ids: [], legacy: [] };
    fixtures.original = await fingerprint([]);
    const duplicate = `Slug Legacy ${fixtures.tag}`;
    for (const business of [duplicate, duplicate, duplicate, 'LOGIN', 'مركز فتح الأجهزة', '!!!', '']) {
      const id = randomUUID();
      fixtures.ids.push(id);
      fixtures.legacy.push({ id, business });
    }
    await save();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < fixtures.legacy.length; i++) {
        const row = fixtures.legacy[i];
        await client.query(`INSERT INTO subscribers(id,business,notes,created_at)
          VALUES($1,$2,$3,now()+$4::int*interval '1 millisecond')`,
          [row.id, row.business, `slugverify:${fixtures.tag}`, i]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    pass('Seeded seven isolated legacy rows for real migration/backfill coverage');
  } else {
    try { fixtures = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT' || process.argv.includes('--cleanup')) throw error;
      fixtures = { tag: randomBytes(6).toString('hex'), ids: [], legacy: [] };
      fixtures.original = await fingerprint([]);
      await save();
    }
    if (process.argv.includes('--cleanup')) {
      await cleanup();
      assert.deepEqual(await baseline(), fixtures.original);
      await unlink(path);
      pass('Fixture cleanup; all pre-existing account/settings/licence data unchanged');
    } else {
      const rows = (await pool.query('SELECT id,public_slug FROM subscribers WHERE id=ANY($1::uuid[])', [fixtures.ids])).rows;
      const slugs = new Map(rows.map(row => [row.id, row.public_slug]));
      const expectedBase = `sluglegacy${fixtures.tag}`;
      if (fixtures.legacy.length) {
        assert.deepEqual(fixtures.legacy.slice(0, 3).map(row => slugs.get(row.id)), [expectedBase, `${expectedBase}-2`, `${expectedBase}-3`]);
        for (const row of fixtures.legacy.slice(3)) assert.match(slugs.get(row.id), /^business-[a-f0-9]{12}$/);
      }
      assert.deepEqual(await baseline(), fixtures.original);
      const coverage = (await pool.query(`SELECT count(*)::int AS total,count(public_slug)::int AS assigned,
        count(DISTINCT public_slug)::int AS unique FROM subscribers`)).rows[0];
      assert.equal(coverage.total, coverage.assigned); assert.equal(coverage.total, coverage.unique);
      pass(fixtures.legacy.length
        ? 'Real backfill: deterministic duplicates, reserved/Arabic/empty names; original data preserved'
        : 'Every current subscriber has a unique non-null slug; original data preserved');
      const again = await pool.query('SELECT public.bhru_backfill_public_slugs($1) AS count', [privateSegment]);
      assert.equal(again.rows[0].count, 0);
      assert.deepEqual((await pool.query('SELECT id,public_slug FROM subscribers WHERE id=ANY($1::uuid[]) ORDER BY id', [fixtures.ids])).rows,
        [...rows].sort((a, b) => a.id.localeCompare(b.id)));
      pass('Backfill is idempotent and does not rename assigned slugs');

      for (const [name, expected] of [
        ['Unlock Fast', 'unlockfast'], ['GAB Server', 'gabserver'], ['My Unlock 24', 'myunlock24'],
        ['Unlock-Fast', 'unlockfast'], ['Déblocage Télécom', 'deblocagetelecom'], ['Straße Æ Ø Þ', 'strasseaeoth'],
      ]) {
        assert.equal((await pool.query('SELECT public.bhru_slug_base($1,$2,$3) AS base', [name, randomUUID(), privateSegment])).rows[0].base, expected);
      }
      pass('Required examples, punctuation, accents and explicit Latin mappings');
      for (const reserved of ['LOGIN','register','dashboard','settings','m','api','admin','assets','brand','pwa','healthz','src', privateSegment.toUpperCase()]) {
        assert.equal((await pool.query('SELECT public.bhru_slug_reserved($1,$2) AS reserved', [reserved, privateSegment])).rows[0].reserved, true);
      }
      pass('Current route names and runtime private entry reserved case-insensitively');
      const suffixBase = `slugreservedsuffix${fixtures.tag}`;
      const suffixIds = [randomUUID(), randomUUID()];
      fixtures.ids.push(...suffixIds); await save();
      const suffixSlugs = [];
      for (const id of suffixIds) {
        suffixSlugs.push((await pool.query('SELECT public.bhru_create_subscriber($1,$2,$3) AS slug',
          [id, suffixBase, `${suffixBase}-2`])).rows[0].slug);
        await pool.query('UPDATE subscribers SET notes=$2 WHERE id=$1', [id, `slugverify:${fixtures.tag}`]);
      }
      assert.deepEqual(suffixSlugs, [suffixBase, `${suffixBase}-3`]);
      pass('Allocation also skips a reserved private-entry candidate in duplicate suffixes');
      const long = (await pool.query("SELECT public.bhru_slug_candidate(public.bhru_slug_base($1,$2,$3),200) AS slug",
        ['X'.repeat(300), randomUUID(), privateSegment])).rows[0].slug;
      assert.equal(long.length, 63); assert.match(long, /-200$/);
      for (const bad of [null, 'UPPER', 'api', 'assets', '../escape', 'a/b', '%2f', 'a_underscore', 'a'.repeat(64)]) {
        await rejectedSQL('INSERT INTO subscribers(id,business,public_slug) VALUES($1,$2,$3)',
          [randomUUID(), 'Invalid fixture', bad], bad === null ? '23502' : '23514');
      }
      pass('Database rejects missing, reserved, unsafe, uppercase and oversized slugs');

      const concurrentName = `Slug Concurrent ${fixtures.tag}`;
      const concurrentIds = Array.from({ length: 8 }, () => randomUUID());
      fixtures.ids.push(...concurrentIds); await save();
      const allocated = await Promise.all(concurrentIds.map(async id => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const slug = (await client.query('SELECT public.bhru_create_subscriber($1,$2,$3) AS slug', [id, concurrentName, privateSegment])).rows[0].slug;
          await client.query('UPDATE subscribers SET notes=$2 WHERE id=$1', [id, `slugverify:${fixtures.tag}`]);
          await new Promise(resolve => setTimeout(resolve, 25));
          await client.query('COMMIT');
          return slug;
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      }));
      const concurrentBase = `slugconcurrent${fixtures.tag}`;
      assert.deepEqual(new Set(allocated), new Set([concurrentBase, ...Array.from({ length: 7 }, (_, i) => `${concurrentBase}-${i + 2}`)]));
      pass('Eight competing transactions allocate base and suffixes 2–8 uniquely');

      const password = `SlV8!${randomBytes(24).toString('base64url')}`;
      const account = suffix => ({ owner: 'Slug Verification', business: `Slug Registration ${fixtures.tag}`,
        username: `slugverify_${fixtures.tag}_${suffix}`, email: `slugverify_${fixtures.tag}_${suffix}@example.invalid`,
        phone: '0000000000', country: 'Other', password });
      const actors = [{ jar: '' }, { jar: '' }];
      const register = async index => {
        const result = await call(actors[index], '/auth/register', 'POST', account(String(index)));
        assert.equal(result.status, 201);
        const id = result.data.session.subscriberId;
        fixtures.ids.push(id); await save();
        const atomic = await pool.query(`SELECT s.xmin=u.xmin AND s.xmin=l.xmin AND s.xmin=g.xmin AS atomic
          FROM subscribers s JOIN account_users u ON u.subscriber_id=s.id
          JOIN subscriptions l ON l.subscriber_id=s.id JOIN subscriber_general_settings g ON g.subscriber_id=s.id
          WHERE s.id=$1`, [id]);
        assert.equal(atomic.rows[0]?.atomic, true, 'All four registration records must share one transaction');
        await pool.query('UPDATE subscribers SET notes=$2 WHERE id=$1', [id, `slugverify:${fixtures.tag}`]);
        assert.equal(result.data.session.role, 'subscriber');
        assert.equal(result.data.subscribers[0].status, 'PENDING');
        return id;
      };
      // The unchanged password service allows two simultaneous derivations.
      const ids = await Promise.all([register(0), register(1)]); await save();
      const actual = (await pool.query('SELECT public_slug FROM subscribers WHERE id=ANY($1::uuid[])', [ids])).rows.map(row => row.public_slug);
      assert.deepEqual(new Set(actual), new Set([`slugregistration${fixtures.tag}`, `slugregistration${fixtures.tag}-2`]));
      pass('Two concurrent real registrations succeed atomically with unique slugs and PENDING subscriptions');
      assert.equal((await call(actors[0], '/state')).status, 200);
      assert.equal((await call(actors[0], `/subscribers/${ids[1]}`)).status, 403);
      assert.equal((await call(actors[0], `/subscribers/${ids[0]}/panel`)).status, 403);
      assert.equal((await call({ jar: '' }, '/settings/general')).status, 401);
      assert.equal((await call(actors[0], '/admin/plans', 'POST', { name: 'Denied' })).status, 403);
      assert.equal((await call({ jar: '' }, '/auth/register', 'POST', { ...account('forged'), public_slug: 'chosen-slug' })).status, 400);
      pass('Ownership, PENDING panel blocking, admin isolation and server-owned slug input preserved');
      const reservedRegistration = await call({ jar: '' }, '/auth/register', 'POST', { ...account('reserved'), business: 'LOGIN' });
      assert.equal(reservedRegistration.status, 201);
      const reservedId = reservedRegistration.data.session.subscriberId;
      fixtures.ids.push(reservedId); await save();
      await pool.query('UPDATE subscribers SET notes=$2 WHERE id=$1', [reservedId, `slugverify:${fixtures.tag}`]);
      assert.match((await pool.query('SELECT public_slug FROM subscribers WHERE id=$1', [reservedId])).rows[0].public_slug,
        /^business-[a-f0-9]{12}$/);
      pass('Real registration for a reserved business name receives a safe fallback, not an app route');

      const beforeFailure = await baseline();
      assert.equal((await call({ jar: '' }, '/auth/register', 'POST', { ...account('0'), business: `Slug Rollback ${fixtures.tag}` })).status, 409);
      assert.deepEqual(await baseline(), beforeFailure);
      assert.equal((await pool.query('SELECT 1 FROM subscribers WHERE business=$1', [`Slug Rollback ${fixtures.tag}`])).rowCount, 0);
      pass('Failure after slug insertion rolls back subscriber, account, subscription and settings');
      const retry = await call({ jar: '' }, '/auth/register', 'POST', { ...account('retry'), business: `Slug Rollback ${fixtures.tag}` });
      assert.equal(retry.status, 201);
      fixtures.ids.push(retry.data.session.subscriberId); await save();
      await pool.query('UPDATE subscribers SET notes=$2 WHERE id=$1',
        [retry.data.session.subscriberId, `slugverify:${fixtures.tag}`]);
      assert.equal((await pool.query('SELECT public_slug FROM subscribers WHERE id=$1',
        [retry.data.session.subscriberId])).rows[0].public_slug, `slugrollback${fixtures.tag}`);
      pass('A later successful registration can claim the base slug freed by rollback');
      const initialSlug = actual.find(value => value.endsWith('-2')) || actual[0];
      const targetId = (await pool.query('SELECT id FROM subscribers WHERE public_slug=$1', [initialSlug])).rows[0].id;
      await pool.query('UPDATE subscribers SET business=$2 WHERE id=$1', [targetId, 'Changed Business Name']);
      await pool.query('UPDATE subscriber_general_settings SET company_name=$2 WHERE subscriber_id=$1', [targetId, 'Changed Company Name']);
      assert.equal((await pool.query('SELECT public_slug FROM subscribers WHERE id=$1', [targetId])).rows[0].public_slug, initialSlug);
      await rejectedSQL('UPDATE subscribers SET public_slug=$2 WHERE id=$1', [targetId, `changed-${fixtures.tag}`], '23514');
      await rejectedSQL('UPDATE subscribers SET public_slug=NULL WHERE id=$1', [targetId], '23514');
      pass('Business/company rename preserves slug; database rejects slug mutation/removal');

      fixtures.adminId = randomUUID(); await save();
      const salt = randomBytes(32).toString('hex');
      const key = await promisify(scrypt)(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
      await pool.query('INSERT INTO platform_admin_users(id,email,password_hash,full_name,enabled) VALUES($1,$2,$3,$4,true)',
        [fixtures.adminId, `slugadmin_${fixtures.tag}@example.invalid`, `scrypt$131072$8$1$${salt}$${key.toString('hex')}`, 'Slug Verification Admin']);
      const admin = { jar: '', admin: true };
      assert.equal((await call(admin, '/auth/admin-login', 'POST', { email: `slugadmin_${fixtures.tag}@example.invalid`, password, entryPath: `/${privateSegment}` })).status, 200);
      assert.equal((await call(admin, '/state')).data.session.role, 'admin');
      assert.equal((await call(actors[0], `/auth/entry?path=${encodeURIComponent('/' + privateSegment)}`)).status, 403);
      pass('Independent private Platform Admin login/state work; subscriber entry remains forbidden');
      assert.equal((await call(actors[0], '/auth/logout', 'POST', {})).status, 200);
      assert.equal((await call(actors[0], '/state')).status, 401);
      assert.equal((await call(actors[0], '/auth/login', 'POST', { identifier: account('0').username, password })).status, 200);
      pass('Existing subscriber logout/login/session behavior works');
      for (const route of ['/', '/dashboard', '/login', '/register', '/settings', '/m/general-settings', '/m/services', '/robots.txt', '/manifest.webmanifest', '/sw.js', '/brand/bhru-icon.png', '/pwa/offline.html']) {
        const response = await fetch(`https://${process.env.REPLIT_DEV_DOMAIN}${route}`);
        assert.equal(response.status, 200, `Existing route ${route}`);
      }
      assert.equal((await call({ jar: '' }, '/healthz')).status, 200);
      assert.equal((await call({ jar: '' }, '/nonexistent-slug-endpoint')).status, 404);
      pass('Existing app/module/static/health/API-404 routes remain reachable');
      await cleanup();
      assert.deepEqual(await baseline(), fixtures.original);
      await unlink(path);
      pass('All newly created fixtures removed; pre-existing accounts, settings, subscriptions and admins unchanged');
    }
  }
} finally { await pool.end(); }
