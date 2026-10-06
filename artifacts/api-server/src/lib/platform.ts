import { randomUUID } from "node:crypto";
import type { PoolClient } from "@workspace/db";
import { pool } from "@workspace/db";
import { GetPlatformStateResponse } from "@workspace/api-zod";
import type { AuthUser } from "./auth";

export const subscriberSelect = `SELECT s.id,s.business,u.full_name AS owner,u.email,u.username,u.phone,u.country,
  COALESCE(p.name,'Unassigned') AS plan,l.plan_id AS "planId",
  CASE WHEN l.status IN ('ACTIVE','TRIAL') AND (l.expires_at IS NULL OR l.expires_at<=now())
    THEN 'EXPIRED' ELSE l.status END AS status,
  s.created_at AS "registeredAt",l.expires_at AS "expiresAt",u.last_login AS "lastLogin",
  s.domain,'Not configured' AS "domainStatus",'Not verified' AS verification,s.notes,
  l.licence_key AS "licenceKey",l.activated_at AS "activatedAt",
  (l.status IN ('ACTIVE','TRIAL') AND l.expires_at>now() AND l.licence_key IS NOT NULL AND l.plan_id IS NOT NULL) AS allowed
  FROM subscribers s JOIN account_users u ON u.subscriber_id=s.id
  JOIN subscriptions l ON l.subscriber_id=s.id LEFT JOIN plans p ON p.id=l.plan_id`;
export function serializeSubscriber(row: Record<string, any>) {
  const reasons: Record<string, string> = {
    PENDING: "Your registration is awaiting approval by the BHRU team.",
    SUSPENDED: "Your subscription has been suspended. Your data is kept safely.",
    EXPIRED: "Your subscription has expired. Your data is kept safely.",
    REVOKED: "Your licence has been revoked. Your data is kept safely.",
  };
  for (const key of ["registeredAt", "expiresAt", "lastLogin", "activatedAt"]) {
    row[key] = row[key] instanceof Date ? row[key].toISOString() : row[key];
  }
  return { ...row, allowed: !!row.allowed, accessReason: row.allowed ? "" : reasons[row.status] || "Your licence is awaiting activation." };
}
export async function getSubscriber(id: string, client: Pick<PoolClient, "query"> = pool) {
  const result = await client.query(subscriberSelect + " WHERE s.id=$1", [id]);
  return result.rows[0] ? serializeSubscriber(result.rows[0]) : undefined;
}
export async function platformState(user: AuthUser) {
  const subscribers = await pool.query(subscriberSelect +
    (user.admin ? " ORDER BY s.created_at DESC" : " WHERE s.id=$1"), user.admin ? [] : [user.subscriber_id]);
  const plans = await pool.query(`SELECT id,name,price::float8 AS price,description,highlights,enabled FROM plans
    ${user.admin ? "" : "WHERE enabled OR id IN(SELECT plan_id FROM subscriptions WHERE subscriber_id=$1)"} ORDER BY price,name`,
    user.admin ? [] : [user.subscriber_id]);
  const logs = user.admin ? (await pool.query(`SELECT l.id,l.created_at AS at,COALESCE(a.full_name,u.full_name) AS actor,l.action,l.target_label AS target
    FROM audit_logs l LEFT JOIN account_users u ON u.id=l.actor_id
    LEFT JOIN platform_admin_users a ON a.id=l.admin_actor_id ORDER BY l.created_at DESC LIMIT 500`)).rows : [];
  const admins = user.admin ? (await pool.query(`SELECT id,full_name AS name,email FROM platform_admin_users
    WHERE enabled AND email IS NOT NULL ORDER BY created_at`)).rows : [];
  return GetPlatformStateResponse.parse({
    session: { role: user.admin ? "admin" : "subscriber", subscriberId: user.admin ? null : user.subscriber_id, origin: "login", name: user.full_name },
    subscribers: subscribers.rows.map(serializeSubscriber), plans: plans.rows,
    logs: logs.map(l => ({ ...l, at: l.at.toISOString() })), admins,
  });
}
export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
export async function audit(client: PoolClient, actor: AuthUser | string, action: string, targetType: string, id: string, label: string) {
  const subscriberActor = typeof actor === "string" ? actor : actor.admin ? null : actor.id;
  const adminActor = typeof actor !== "string" && actor.admin ? actor.id : null;
  await client.query(`INSERT INTO audit_logs(id,actor_id,admin_actor_id,action,target_type,target_id,target_label)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), subscriberActor, adminActor, action, targetType, id, label]);
}