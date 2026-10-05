import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { PoolClient } from "@workspace/db";
import { pool } from "@workspace/db";

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters.");
const sessionSecret = secret;
export const COOKIE = "bhru_session";
export const ADMIN_COOKIE = "bhru_admin_session";
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
export type AuthUser =
  | { id: string; subscriber_id: string; full_name: string; admin: false }
  | { id: string; subscriber_id: null; full_name: string; admin: true };
declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser; subscriberAuth?: AuthUser; adminAuth?: AuthUser;
      sessionHash?: string; adminSessionHash?: string;
    }
  }
}
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const requireUser = (req: Request): AuthUser => {
  if (!req.auth) throw new HttpError(401, "Sign in to continue.");
  return req.auth;
};
export const requireAdmin = (req: Request): AuthUser => {
  if (!req.adminAuth) throw new HttpError(req.subscriberAuth ? 403 : 401, "Platform administrator access required.");
  return req.adminAuth;
};
export function authorizeTenant(req: Request, id: string): AuthUser {
  const user = requireUser(req);
  if (!user.admin && user.subscriber_id !== id) throw new HttpError(403, "Access denied.");
  return user;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const sign = (value: string, admin = false) => createHmac("sha256", sessionSecret).update(`${admin ? "admin" : "subscriber"}:${value}`).digest("hex");
export function cookieOptions(req: Request) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" || req.secure, path: "/", maxAge: MAX_AGE };
}
export async function createSession(client: PoolClient, user: AuthUser, previous?: string): Promise<string> {
  if (previous) await client.query(user.admin ? "DELETE FROM platform_admin_sessions WHERE token_hash=$1" : "DELETE FROM sessions WHERE token_hash=$1", [previous]);
  const token = randomBytes(32).toString("hex");
  await client.query(user.admin
    ? "INSERT INTO platform_admin_sessions(token_hash,admin_id,expires_at) VALUES($1,$2,now()+interval '7 days')"
    : "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [digest(token), user.id]);
  return token + "." + sign(token, user.admin);
}
export async function loadSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    for (const admin of [false, true]) {
      const raw = req.cookies?.[admin ? ADMIN_COOKIE : COOKIE];
      if (typeof raw === "string" && /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(raw)) {
        const [token, signature] = raw.split(".");
        if (timingSafeEqual(Buffer.from(sign(token!, admin), "hex"), Buffer.from(signature!, "hex"))) {
          const hash = digest(token!);
          const result = await pool.query(admin
            ? `SELECT u.id,NULL AS subscriber_id,u.full_name,true AS admin
               FROM platform_admin_sessions s JOIN platform_admin_users u ON u.id=s.admin_id
               WHERE s.token_hash=$1 AND s.expires_at>now() AND u.enabled AND u.password_hash IS NOT NULL`
            : `SELECT u.id,u.subscriber_id,u.full_name,false AS admin
               FROM sessions s JOIN account_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, [hash]);
          if (admin) { req.adminSessionHash = hash; req.adminAuth = result.rows[0]; }
          else { req.sessionHash = hash; req.subscriberAuth = result.rows[0]; }
        }
      }
    }
    // The header selects a realm, never privileges. Each realm must supply
    // its own valid signed cookie backed by its own session/account tables.
    req.auth = req.get("X-BHRU-Auth") === "admin" ? req.adminAuth : req.subscriberAuth;
    next();
  } catch (error) { next(error); }
}
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.get("origin");
    const expected = `${req.protocol}://${req.get("host")}`;
    // Required custom header + no cross-origin CORS also protects login CSRF
    // and API clients with no Origin. Cookies alone cannot mutate anything.
    if (req.get("X-BHRU-Request") !== "1" || (origin && origin !== expected) ||
        req.get("sec-fetch-site") === "cross-site") {
      next(new HttpError(403, "Cross-site request rejected."));
      return;
    }
  }
  next();
}
export async function rateLimit(key: string, limit: number): Promise<void> {
  const result = await pool.query(`INSERT INTO auth_rate_limits(key_hash,attempts,window_until)
    VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key_hash) DO UPDATE SET
    attempts=CASE WHEN auth_rate_limits.window_until<now() THEN 1 ELSE auth_rate_limits.attempts+1 END,
    window_until=CASE WHEN auth_rate_limits.window_until<now() THEN now()+interval '15 minutes' ELSE auth_rate_limits.window_until END
    RETURNING attempts`, [sign(key)]);
  if (result.rows[0].attempts > limit) throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
}