import { randomBytes, randomUUID, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import assert from 'node:assert/strict';

assert(process.env.NODE_ENV !== 'production', 'Development tests only.');
assert(process.env.REPLIT_DEV_DOMAIN && process.env.PLATFORM_ADMIN_PATH, 'Development configuration required.');
const require = createRequire(new URL('../../lib/db/package.json', import.meta.url));
const { Pool } = require('pg');
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const fixtureFile = '/tmp/bhru-public-site-verification.json';
export const base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const tables = ['subscribers', 'account_users', 'subscriptions', 'subscriber_general_settings', 'plans', 'platform_admin_users'];
export const load = async () => JSON.parse(await readFile(fixtureFile, 'utf8'));

export async function fingerprint(fixtures) {
  const result = {};
  for (const table of tables) {
    const key = ['account_users', 'subscriptions', 'subscriber_general_settings'].includes(table) ? 'subscriber_id' : 'id';
    const ids = table === 'plans' ? [fixtures.planId] : fixtures.sites.map(site => site.id);
    result[table] = (await pool.query(`SELECT count(*)::int AS count,
      md5(coalesce(string_agg(row_to_json(t)::text,'|' ORDER BY id),'')) AS hash
      FROM (SELECT * FROM ${table} WHERE ${key} <> ALL($1::uuid[])) t`, [ids])).rows[0];
  }
  return result;
}

export async function prepare() {
  const existing = await readFile(fixtureFile, 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  assert(!existing, 'An interrupted fixture run exists; clean it up first.');
  const tag = randomBytes(6).toString('hex');
  const password = `PsV9!${randomBytes(24).toString('base64url')}`;
  const fixtures = {
    tag, password, planId: randomUUID(), sites: [], adminPath: `/${process.env.PLATFORM_ADMIN_PATH}`,
  };
  fixtures.original = await fingerprint(fixtures);
  const salt = randomBytes(32).toString('hex');
  const key = await promisify(scrypt)(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
  const hash = `scrypt$131072$8$1$${salt}$${key.toString('hex')}`;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO plans(id,name,price) VALUES($1,$2,1)', [fixtures.planId, `Public Site Verification ${tag}`]);
    for (const [label, status, expired] of [
      ['Alpha', 'ACTIVE', false], ['Beta', 'TRIAL', false], ['Pending', 'PENDING', false],
      ['Suspended', 'SUSPENDED', false], ['Expired', 'EXPIRED', false], ['Revoked', 'REVOKED', false],
      ['Elapsed', 'ACTIVE', true],
    ]) {
      const id = randomUUID();
      const business = `Public Preview ${label} ${tag}`;
      const slug = (await client.query('SELECT public.bhru_create_subscriber($1,$2,$3) AS slug',
        [id, business, process.env.PLATFORM_ADMIN_PATH])).rows[0].slug;
      const username = `pubverify_${tag}_${label.toLowerCase()}`;
      const email = `${username}@example.invalid`;
      const owner = `PRIVATE_OWNER_${tag}_${label}`;
      const licence = `PRIVATE_LICENCE_${tag}_${label}`;
      fixtures.sites.push({ id, slug, username, email, owner, licence, business, company: `${label} Public Company`, status, expired });
      await client.query('UPDATE subscribers SET notes=$2 WHERE id=$1', [id, `pubverify:${tag}`]);
      await client.query(`INSERT INTO account_users(id,subscriber_id,full_name,username,email,phone,country,password_hash)
        VALUES($1,$2,$3,$4,$5,$6,'Other',$7)`, [randomUUID(), id, owner, username, email, 'PRIVATE_PHONE', hash]);
      const eligibleState = ['ACTIVE', 'TRIAL'].includes(status);
      await client.query(`INSERT INTO subscriptions(id,subscriber_id,status,plan_id,licence_key,expires_at)
        VALUES($1,$2,$3,$4,$5,CASE WHEN $6::boolean THEN now()-interval '1 day' ELSE now()+interval '7 days' END)`,
        [randomUUID(), id, status, eligibleState ? fixtures.planId : null, eligibleState ? licence : null, expired]);
      await client.query('INSERT INTO subscriber_general_settings(id,subscriber_id,company_name) VALUES($1,$2,$3)',
        [randomUUID(), id, `${label} Public Company`]);
    }
    await writeFile(fixtureFile, JSON.stringify(fixtures), { mode: 0o600 });
    await client.query('COMMIT');
    return fixtures;
  } catch (error) {
    await client.query('ROLLBACK');
    await unlink(fixtureFile).catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function cleanup(fixtures) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = (await client.query('SELECT id FROM subscribers WHERE id=ANY($1::uuid[]) AND notes=$2',
      [fixtures.sites.map(site => site.id), `pubverify:${fixtures.tag}`])).rows.map(row => row.id);
    await client.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM account_users WHERE subscriber_id=ANY($1::uuid[]))', [ids]);
    await client.query(`DELETE FROM audit_logs WHERE target_id=ANY($1::text[])
      OR actor_id IN (SELECT id FROM account_users WHERE subscriber_id=ANY($1::uuid[]))`, [ids]);
    await client.query('DELETE FROM activations WHERE subscription_id IN (SELECT id FROM subscriptions WHERE subscriber_id=ANY($1::uuid[]))', [ids]);
    await client.query('DELETE FROM subscriber_general_settings WHERE subscriber_id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM subscriptions WHERE subscriber_id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM account_users WHERE subscriber_id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM subscribers WHERE id=ANY($1::uuid[])', [ids]);
    await client.query('DELETE FROM plans WHERE id=$1 AND name=$2', [fixtures.planId, `Public Site Verification ${fixtures.tag}`]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  assert.deepEqual(await fingerprint(fixtures), fixtures.original, 'Pre-existing data, including every public slug, must remain unchanged');
  await unlink(fixtureFile);
}

export async function api(actor, path, method = 'GET', body) {
  const response = await fetch(`${base}/api${path}`, {
    method, redirect: 'manual',
    headers: { 'Content-Type': 'application/json', 'X-BHRU-Request': '1',
      'X-BHRU-Auth': 'subscriber', ...(actor.cookie ? { Cookie: actor.cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.headers.get('set-cookie')) actor.cookie = response.headers.get('set-cookie').split(';')[0];
  return { status: response.status, data: await response.json() };
}
