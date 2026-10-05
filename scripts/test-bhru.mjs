// Development-only integration verification. No real/default credentials.
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
const require = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Pool } = require("pg");
if (process.env.NODE_ENV === "production") throw new Error("Run verification in Development only.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const base = "http://localhost:80";
const adminEntry = `/${process.env.PLATFORM_ADMIN_PATH}`;
assert(process.env.PLATFORM_ADMIN_PATH, "Set PLATFORM_ADMIN_PATH for Development verification.");
const tag = randomBytes(6).toString("hex");
const password = "vA8!" + randomBytes(24).toString("base64url");
const actors = [{ jar: "" }, { jar: "" }, { jar: "" }];
const adminActor = { jar: "", admin: true };
const adminEmail = `independent_${tag}@example.invalid`;
let adminId, createdPlan;
let passed = 0;
function pass(label) { passed++; console.log(`PASS ${passed}: ${label}`); }
async function call(actor, path, method = "GET", body, extra = {}) {
  const res = await fetch(base + "/api" + path, {
    method, headers: { "Content-Type": "application/json", "X-BHRU-Request": "1", "X-BHRU-Auth": actor.admin ? "admin" : "subscriber", ...(actor.jar ? { Cookie: actor.jar } : {}), ...extra },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) actor.jar = setCookie.split(";")[0];
  const data = await res.json();
  return { status: res.status, data };
}
const account = n => ({ owner: `Verification ${n}`, business: `Verification ${tag} ${n}`, username: `verify_${tag}_${n}`,
  email: `verify_${tag}_${n}@example.invalid`, phone: "0000000000", country: "Other", password });
const check = (result, expected) => assert.equal(result.status, expected, `Expected ${expected}, got ${result.status}: ${JSON.stringify(result.data)}`);
try {
  const unauthorized = await call({ jar: "" }, "/state"); check(unauthorized, 401); pass("Anonymous data blocked");
  check(await call({ jar: "" }, "/auth/register", "POST", { ...account("forged"), role: "admin" }), 400);
  pass("Role-injection registration rejected");
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const result = await call(actors[i], "/auth/register", "POST", account(String(i)));
    check(result, 201); assert.equal(result.data.session.role, "subscriber"); assert.equal(result.data.subscribers[0].status, "PENDING");
    ids.push(result.data.subscribers[0].id);
  }
  pass("Real registration creates PENDING subscribers, never admin");
  const saved = await pool.query(`SELECT count(*)::int AS count,bool_and(password_hash LIKE 'scrypt$131072$8$1$%') AS hashed
    FROM account_users WHERE subscriber_id=ANY($1::uuid[])`, [ids]);
  assert.equal(saved.rows[0].count, 3); assert.equal(saved.rows[0].hashed, true); pass("Accounts persisted in PostgreSQL with scrypt hashes");
  check(await call({ jar: "" }, "/auth/login", "POST", { identifier: account("1").username, password: "wrong-password" }), 401);
  pass("Wrong password rejected");
  const oldCookie = actors[1].jar;
  check(await call(actors[1], "/auth/login", "POST", { identifier: account("1").email.toUpperCase(), password }), 200);
  check(await call({ jar: oldCookie }, "/state"), 401); pass("Correct login works; old session rotated and invalidated");
  check(await call(actors[1], `/subscribers/${ids[2]}`), 403);
  check(await call(actors[1], `/subscribers/${ids[2]}/panel`), 403); pass("Subscriber A cannot read subscriber B or B's panel");
  const own = await call(actors[1], "/state"); check(own, 200);
  assert.equal(own.data.subscribers.length, 1); assert.equal(own.data.logs.length, 0); assert.equal(own.data.admins.length, 0);
  pass("Subscriber state contains own account only; no admin logs/accounts");
  check(await call(actors[1], "/admin/plans", "POST", { name: "Attack", price: 1, description: "", highlights: "", enabled: true }), 403);
  check(await call(actors[1], `/admin/subscribers/${ids[1]}/actions`, "POST", { action: "reactivate" }), 403);
  pass("Subscriber cannot perform administrative actions");
  check(await call(actors[1], `/subscribers/${ids[1]}/panel`), 403); pass("PENDING licence blocks panel");
  const counts = async () => (await pool.query(`SELECT
    (SELECT count(*)::int FROM account_users) AS accounts,
    (SELECT count(*)::int FROM subscribers) AS subscribers,
    (SELECT count(*)::int FROM subscriptions) AS subscriptions,
    (SELECT count(*)::int FROM activations) AS activations`)).rows[0];
  const before = await counts();
  const bootstrap = input => spawnSync(process.execPath,
    ["artifacts/api-server/dist/admin-promote.mjs", "--email", adminEmail, "--password-stdin"],
    { encoding: "utf8", input });
  const unsafe = bootstrap("short");
  assert.notEqual(unsafe.status, 0); assert(!unsafe.stdout.includes("short") && !unsafe.stderr.includes("short"));
  pass("Unsafe bootstrap password rejected without disclosure");
  const bootstrapped = bootstrap(password);
  assert.equal(bootstrapped.status, 0, `Independent administrator bootstrap failed: ${bootstrapped.stderr}`);
  assert(!bootstrapped.stdout.includes(password) && !bootstrapped.stderr.includes(password));
  assert.deepEqual(await counts(), before);
  const savedAdmin = (await pool.query("SELECT id,password_hash FROM platform_admin_users WHERE email=$1", [adminEmail])).rows[0];
  adminId = savedAdmin.id;
  assert(savedAdmin.password_hash.startsWith("scrypt$131072$8$1$"));
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM account_users WHERE email=$1", [adminEmail])).rows[0].n, 0);
  assert.equal(bootstrap("vA8!" + randomBytes(24).toString("base64url")).status, 0);
  assert.equal((await pool.query("SELECT password_hash FROM platform_admin_users WHERE id=$1", [adminId])).rows[0].password_hash, savedAdmin.password_hash);
  pass("Bootstrap creates only an independent hashed administrator; repeat never changes the password");
  check(await call(actors[0], "/state"), 200);
  assert.equal((await call(actors[0], "/state")).data.session.role, "subscriber");
  check(await call({ jar: "" }, "/auth/login", "POST", { identifier: adminEmail, password }), 401);
  check(await call({ jar: "" }, "/auth/admin-login", "POST", { email: account("0").email, password, entryPath: adminEntry }), 401);
  check(await call({ jar: "" }, "/auth/admin-login", "POST", { email: adminEmail, password, entryPath: "/wrong-entry" }), 404);
  pass("Subscriber credentials cannot authenticate an administrator, and admin credentials cannot authenticate a subscriber");
  const adminLogin = await call(adminActor, "/auth/admin-login", "POST", { email: adminEmail, password, entryPath: adminEntry });
  check(adminLogin, 200); assert.equal(adminLogin.data.session.role, "admin");
  assert.equal(adminLogin.data.session.subscriberId, null);
  assert(!adminLogin.data.subscribers.some(sub => sub.email === adminEmail));
  assert(adminActor.jar.startsWith("bhru_admin_session="));
  check(await call({ jar: adminActor.jar.replace("bhru_admin_session=", "bhru_session=") }, "/state"), 401);
  check(await call({ jar: actors[0].jar.replace("bhru_session=", "bhru_admin_session="), admin: true }, "/state"), 401);
  check(await call({ jar: actors[0].jar, admin: true }, "/state"), 401);
  pass("Separate cookie signatures, account/session tables and realm checks prevent cross-realm replay");
  const both = `${actors[0].jar}; ${adminActor.jar}`;
  assert.equal((await call({ jar: both }, "/state")).data.session.role, "subscriber");
  assert.equal((await call({ jar: both, admin: true }, "/state")).data.session.role, "admin");
  pass("Concurrent subscriber and administrator cookies resolve independently");
  assert(ids.every(id => adminLogin.data.subscribers.some(s => s.id === id))); pass("Admin sees registered subscribers across independent sessions");
  const plan = { name: `Verification ${tag}`, price: 17.25, description: "Verification only", highlights: "No business limits enabled", enabled: true };
  const created = await call(adminActor, "/admin/plans", "POST", plan); check(created, 200);
  createdPlan = created.data.plans.find(p => p.name === plan.name).id;
  check(await call(adminActor, `/admin/plans/${createdPlan}`, "PATCH", { ...plan, price: 18.5 }), 200);
  pass("Plan create/edit persists real non-hardcoded price");
  const action = (id, data) => call(adminActor, `/admin/subscribers/${id}/actions`, "POST", data);
  const future = new Date(Date.now() + 365 * 86400000).toISOString();
  check(await action(ids[1], { action: "activate", planId: createdPlan, expiresAt: future }), 200);
  check(await call(actors[1], `/subscribers/${ids[1]}/panel`), 200); pass("Admin activation allows active owner panel");
  check(await action(ids[1], { action: "suspend" }), 200);
  check(await call(actors[1], `/subscribers/${ids[1]}/panel`), 403); pass("Suspension blocks an already-open session");
  check(await action(ids[1], { action: "reactivate" }), 200);
  check(await call(actors[1], `/subscribers/${ids[1]}/panel`), 200); pass("Reactivation restores panel access");
  check(await call(adminActor, `/admin/subscribers/${ids[1]}`, "PATCH", { expiresAt: new Date(Date.now() - 86400000).toISOString() }), 200);
  check(await call(actors[1], `/subscribers/${ids[1]}/panel`), 403);
  assert.equal((await call(actors[1], "/state")).data.subscribers[0].status, "EXPIRED"); pass("Past expiry blocks access server-side immediately");
  check(await action(ids[1], { action: "extend", expiresAt: future }), 200);
  check(await call(actors[1], `/subscribers/${ids[1]}/panel`), 200); pass("Extending an expired licence restores access");
  check(await action(ids[1], { action: "revoke" }), 200);
  check(await call(actors[1], `/subscribers/${ids[1]}/panel`), 403); pass("Revocation blocks access");
  const kept = await pool.query("SELECT count(*)::int AS count FROM account_users WHERE subscriber_id=ANY($1::uuid[])", [ids]);
  assert.equal(kept.rows[0].count, 3); pass("Suspend/expire/revoke preserve account data");
  check(await action(ids[2], { action: "approve", planId: createdPlan }), 200);
  check(await call(actors[2], `/subscribers/${ids[2]}/panel`), 200); pass("Approved TRIAL licence grants access with future expiry");
  check(await call(adminActor, `/admin/plans/${createdPlan}`, "PATCH", { ...plan, enabled: false }), 200);
  check(await action(ids[1], { action: "activate", planId: createdPlan, expiresAt: future }), 400);
  check(await call(actors[2], `/subscribers/${ids[2]}/panel`), 200); pass("Disabled plan cannot be assigned; existing licence retained");
  check(await call(adminActor, `/admin/plans/${createdPlan}`, "PATCH", { ...plan, enabled: true }), 200);
  const history = (await call(adminActor, "/state")).data.logs.filter(l => l.target.includes(tag));
  for (const action of ["Subscriber registered", "Subscriber activated", "Subscriber suspended", "Subscriber reactivated", "Subscription extended", "Licence revoked"])
    assert(history.some(l => l.action === action && l.actor && l.at && l.target), `Missing audit ${action}`);
  const activations = await pool.query("SELECT count(*)::int AS count FROM activations WHERE admin_actor_id=$1 AND actor_id IS NULL", [adminId]);
  assert(activations.rows[0].count >= 3); pass("Audit actor/action/target/timestamp and activation records persisted");
  check(await call(adminActor, "/admin/plans", "POST", plan, { "X-BHRU-Request": "" }), 403);
  check(await call(adminActor, "/admin/plans", "POST", plan, { Origin: "https://attacker.invalid" }), 403);
  pass("Mutation CSRF header and same-origin protections enforced");
  check(await call({ jar: adminActor.jar.replace(/.$/, "x"), admin: true }, "/state"), 401); pass("Tampered signed cookie rejected");
  await pool.query("UPDATE platform_admin_users SET enabled=false WHERE id=$1", [adminId]);
  check(await call(adminActor, "/state"), 401);
  check(await call(adminActor, "/admin/plans", "POST", plan), 401);
  await pool.query("UPDATE platform_admin_users SET enabled=true WHERE id=$1", [adminId]);
  pass("Disabling an administrator immediately revokes server authorization");
  const adminCookie = adminActor.jar;
  check(await call(adminActor, "/auth/logout", "POST"), 200);
  check(await call({ jar: adminCookie, admin: true }, "/state"), 401);
  check(await call(actors[0], "/state"), 200);
  pass("Admin logout revokes only the independent admin session, preserving subscriber sessions");
  const logoutCookie = actors[1].jar;
  check(await call(actors[1], "/auth/logout", "POST"), 200);
  check(await call({ jar: logoutCookie }, "/state"), 401); pass("Logout deletes session; replay rejected");
  check(await call({ jar: "" }, "/auth/register", "POST", account("1")), 409); pass("Duplicate username/email rejected");
  for (let i = 0; i < 15; i++) await call({ jar: "" }, "/auth/login", "POST", { identifier: `absent_${tag}`, password: "wrong" });
  check(await call({ jar: "" }, "/auth/login", "POST", { identifier: `absent_${tag}`, password: "wrong" }), 429);
  pass("PostgreSQL-backed login throttling enforced");
  console.log(`Complete: ${passed} API/database checks passed. Verification records retained; temporary test admin is disabled below.`);
} finally {
  for (const actor of [...actors, adminActor]) if (actor.jar) await call(actor, "/auth/logout", "POST").catch(() => {});
  if (adminId) await pool.query("UPDATE platform_admin_users SET enabled=false WHERE id=$1", [adminId]);
  if (createdPlan) await pool.query("UPDATE plans SET enabled=false WHERE id=$1", [createdPlan]);
  await pool.end();
}