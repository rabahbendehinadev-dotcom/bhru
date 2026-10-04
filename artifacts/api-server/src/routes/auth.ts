import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { hashPassword, verifyPassword, dummyHash } from "@workspace/db/security";
import { RegisterAccountBody, LoginAccountBody } from "@workspace/api-zod";
import { COOKIE, cookieOptions, createSession, HttpError, rateLimit, requireUser } from "../lib/auth";
import { transaction, audit, platformState } from "../lib/platform";

const router = Router();
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
    await audit(client, userId, "Subscriber registered", "subscriber", subscriberId, input.business.trim());
    return createSession(client, userId, req.sessionHash);
  });
  res.cookie(COOKIE, cookie, cookieOptions(req));
  res.status(201).json(await platformState({ id: userId, subscriber_id: subscriberId, full_name: input.owner.trim(), admin: false }));
});
router.post("/auth/login", async (req, res) => {
  const input = LoginAccountBody.strict().parse(req.body);
  const identifier = input.identifier.trim().toLowerCase();
  await rateLimit(`login-ip:${req.ip}`, 60);
  await rateLimit(`login-account:${identifier}`, 15);
  const result = await pool.query(`SELECT u.*,EXISTS(SELECT 1 FROM platform_admin_users a WHERE a.user_id=u.id AND a.enabled) AS admin
    FROM account_users u WHERE username=$1 OR email=$1`, [identifier]);
  const user = result.rows[0];
  const matches = await verifyPassword(input.password, user?.password_hash || dummyHash);
  if (!user || !matches) throw new HttpError(401, "Invalid email/username or password.");
  const cookie = await transaction(async client => {
    await client.query("UPDATE account_users SET last_login=now() WHERE id=$1", [user.id]);
    return createSession(client, user.id, req.sessionHash);
  });
  res.cookie(COOKIE, cookie, cookieOptions(req));
  res.json(await platformState(user));
});
router.post("/auth/logout", async (req, res) => {
  if (req.sessionHash) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [req.sessionHash]);
  res.clearCookie(COOKIE, { ...cookieOptions(req), maxAge: undefined });
  res.json({ ok: true });
});
router.get("/state", async (req, res) => {
  res.json(await platformState(requireUser(req)));
});
export default router;