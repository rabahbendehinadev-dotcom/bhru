import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { hashPassword, verifyPassword, dummyHash } from "@workspace/db/security";
import { RegisterAccountBody, LoginAccountBody, LoginAdministratorBody } from "@workspace/api-zod";
import { COOKIE, ADMIN_COOKIE, cookieOptions, createSession, HttpError, rateLimit, requireUser, type AuthUser } from "../lib/auth";
import { transaction, audit, platformState } from "../lib/platform";
import { adminPath, isAdminEntry } from "../lib/admin-entry";

const router = Router();
router.get("/auth/entry", (req, res) => {
  const path = req.query.path;
  if (typeof path !== "string" || path.length > 512) throw new HttpError(400, "Invalid entry path.");
  const privateEntry = isAdminEntry(path);
  if (privateEntry && req.subscriberAuth && !req.adminAuth) throw new HttpError(403, "Platform administrator access required.");
  res.json({ adminPath: privateEntry || req.auth?.admin ? adminPath : null, isAdminEntry: privateEntry });
});
router.post("/auth/register", async (req, res) => {
  const input = RegisterAccountBody.strict().parse(req.body);
  for (const [key, value] of Object.entries(input)) {
    if (key !== "password" && value.trim().length === 0) throw new HttpError(400, "Complete all account fields.");
  }
  await rateLimit(`register:${req.ip}`, 20);
  const passwordHash = await hashPassword(input.password);
  const subscriberId = randomUUID(), userId = randomUUID();
  const cookie = await transaction(async client => {
    await client.query("INSERT INTO subscribers(id,business) VALUES($1,$2)", [subscriberId, input.business.trim()]);
    await client.query(`INSERT INTO account_users(id,subscriber_id,full_name,username,email,phone,country,password_hash)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [userId, subscriberId, input.owner.trim(), input.username.toLowerCase(),
      input.email.trim().toLowerCase(), input.phone.trim(), input.country.trim(), passwordHash]);
    await client.query("INSERT INTO subscriptions(id,subscriber_id) VALUES($1,$2)", [randomUUID(), subscriberId]);
    await client.query("INSERT INTO subscriber_general_settings(id,subscriber_id) VALUES($1,$2)", [randomUUID(), subscriberId]);
    await audit(client, userId, "Subscriber registered", "subscriber", subscriberId, input.business.trim());
    return createSession(client, { id: userId, subscriber_id: subscriberId, full_name: input.owner.trim(), admin: false }, req.sessionHash);
  });
  res.cookie(COOKIE, cookie, cookieOptions(req));
  res.status(201).json(await platformState({ id: userId, subscriber_id: subscriberId, full_name: input.owner.trim(), admin: false }));
});
router.post("/auth/login", async (req, res) => {
  const input = LoginAccountBody.strict().parse(req.body);
  const identifier = input.identifier.trim().toLowerCase();
  await rateLimit(`subscriber-login-ip:${req.ip}`, 60);
  await rateLimit(`subscriber-login-account:${identifier}`, 15);
  const result = await pool.query("SELECT id,subscriber_id,full_name,password_hash FROM account_users WHERE username=$1 OR email=$1", [identifier]);
  const row = result.rows[0];
  const matches = await verifyPassword(input.password, row?.password_hash || dummyHash);
  if (!row || !matches) throw new HttpError(401, "Invalid email/username or password.");
  const user: AuthUser = { id: row.id, subscriber_id: row.subscriber_id, full_name: row.full_name, admin: false };
  await finishSignIn(req, res, user);
});
router.post("/auth/admin-login", async (req, res) => {
  const input = LoginAdministratorBody.strict().parse(req.body);
  if (input.entryPath !== adminPath) throw new HttpError(404, "Entry not found.");
  const email = input.email.trim().toLowerCase();
  await rateLimit(`admin-login-ip:${req.ip}`, 30);
  await rateLimit(`admin-login-account:${email}`, 10);
  const result = await pool.query("SELECT id,full_name,password_hash,enabled FROM platform_admin_users WHERE email=$1", [email]);
  const row = result.rows[0];
  const matches = await verifyPassword(input.password, row?.password_hash || dummyHash);
  if (!row || !matches || !row.enabled) throw new HttpError(401, "Invalid admin email or password.");
  const user: AuthUser = { id: row.id, subscriber_id: null, full_name: row.full_name, admin: true };
  await finishSignIn(req, res, user);
});
async function finishSignIn(req: Request, res: Response, user: AuthUser) {
  const cookie = await transaction(async client => {
    await client.query(user.admin ? "UPDATE platform_admin_users SET last_login=now() WHERE id=$1" : "UPDATE account_users SET last_login=now() WHERE id=$1", [user.id]);
    return createSession(client, user, user.admin ? req.adminSessionHash : req.sessionHash);
  });
  res.cookie(user.admin ? ADMIN_COOKIE : COOKIE, cookie, cookieOptions(req));
  res.json(await platformState(user));
}
router.post("/auth/logout", async (req, res) => {
  const admin = req.get("X-BHRU-Auth") === "admin";
  const hash = admin ? req.adminSessionHash : req.sessionHash;
  if (hash) await pool.query(admin ? "DELETE FROM platform_admin_sessions WHERE token_hash=$1" : "DELETE FROM sessions WHERE token_hash=$1", [hash]);
  res.clearCookie(admin ? ADMIN_COOKIE : COOKIE, { ...cookieOptions(req), maxAge: undefined });
  res.json({ ok: true });
});
router.get("/state", async (req, res) => {
  res.json(await platformState(requireUser(req)));
});
export default router;