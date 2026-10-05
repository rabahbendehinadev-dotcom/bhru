import { Router } from "express";
import { randomUUID, randomBytes } from "node:crypto";
import { EditSubscriberBody, ManageSubscriptionBody, CreatePlanBody, EditPlanBody, GetSubscriberResponse } from "@workspace/api-zod";
import { requireAdmin, authorizeTenant, HttpError } from "../lib/auth";
import { transaction, audit, getSubscriber, platformState } from "../lib/platform";

const router = Router();
function idParam(raw: unknown): string {
  if (typeof raw !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) throw new HttpError(400, "Invalid identifier.");
  return raw;
}
function validateDateInput(value: unknown, nullable = false) {
  if (value === undefined || (nullable && value === null)) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(+new Date(value)))
    throw new HttpError(400, "Expiration must be a valid ISO timestamp.");
}
router.get("/subscribers/:id", async (req, res) => {
  const id = idParam(req.params.id);
  authorizeTenant(req, id);
  const sub = await getSubscriber(id);
  if (!sub) throw new HttpError(404, "Subscriber not found.");
  res.json(GetSubscriberResponse.parse(sub));
});
router.get("/subscribers/:id/panel", async (req, res) => {
  const id = idParam(req.params.id);
  authorizeTenant(req, id);
  const sub = await getSubscriber(id);
  if (!sub) throw new HttpError(404, "Subscriber not found.");
  if (!sub.allowed) throw new HttpError(403, sub.accessReason);
  res.json({ subscriberId: id, allowed: true });
});
router.post("/admin/plans", async (req, res) => {
  const user = requireAdmin(req);
  const input = CreatePlanBody.strict().parse(req.body);
  if (!input.name.trim()) throw new HttpError(400, "Plan name is required.");
  const id = randomUUID();
  await transaction(async client => {
    await client.query(`INSERT INTO plans(id,name,price,description,highlights,enabled) VALUES($1,$2,$3,$4,$5,$6)`,
      [id, input.name.trim(), input.price, input.description, input.highlights, input.enabled]);
    await audit(client, user, "Plan created", "plan", id, input.name.trim());
  });
  res.json(await platformState(user));
});
router.patch("/admin/plans/:id", async (req, res) => {
  const user = requireAdmin(req), id = idParam(req.params.id);
  const input = EditPlanBody.strict().parse(req.body);
  if (!input.name.trim()) throw new HttpError(400, "Plan name is required.");
  await transaction(async client => {
    const updated = await client.query(`UPDATE plans SET name=$2,price=$3,description=$4,highlights=$5,enabled=$6 WHERE id=$1 RETURNING id`,
      [id, input.name.trim(), input.price, input.description, input.highlights, input.enabled]);
    if (!updated.rowCount) throw new HttpError(404, "Plan not found.");
    await audit(client, user, input.enabled ? "Plan updated/enabled" : "Plan disabled", "plan", id, input.name.trim());
  });
  res.json(await platformState(user));
});
router.post("/admin/subscribers/:id/actions", async (req, res) => {
  const user = requireAdmin(req), id = idParam(req.params.id);
  validateDateInput(req.body?.expiresAt);
  const input = ManageSubscriptionBody.strict().parse(req.body);
  await transaction(async client => {
    const found = await client.query(`SELECT l.*,s.business FROM subscriptions l JOIN subscribers s ON s.id=l.subscriber_id
      WHERE l.subscriber_id=$1 FOR UPDATE OF l`, [id]);
    const old = found.rows[0];
    if (!old) throw new HttpError(404, "Subscriber not found.");
    let status = old.status, planId = old.plan_id, expiry = old.expires_at;
    let key = old.licence_key, activatedAt = old.activated_at, approvedAt = old.approved_at;
    const expired = !expiry || new Date(expiry).getTime() <= Date.now();
    const effective = ["ACTIVE", "TRIAL"].includes(status) && expired ? "EXPIRED" : status;
    const can: Record<string, string[]> = {
      approve: ["PENDING"], activate: ["PENDING", "TRIAL", "EXPIRED", "REVOKED"],
      plan: ["ACTIVE", "TRIAL", "SUSPENDED"], extend: ["ACTIVE", "TRIAL", "SUSPENDED", "EXPIRED"],
      suspend: ["ACTIVE", "TRIAL"], reactivate: ["SUSPENDED", "EXPIRED"], revoke: ["ACTIVE", "TRIAL", "SUSPENDED", "EXPIRED"],
    };
    if (!can[input.action]!.includes(effective)) throw new HttpError(409, `Cannot ${input.action} a ${effective.toLowerCase()} subscription.`);
    if (["approve", "activate", "plan"].includes(input.action)) {
      if (!input.planId) throw new HttpError(400, "Select an enabled plan first.");
      const plan = await client.query("SELECT id FROM plans WHERE id=$1 AND enabled FOR SHARE", [input.planId]);
      if (!plan.rowCount) throw new HttpError(400, "Plan is unavailable for assignment.");
      planId = input.planId;
    }
    if (["activate", "extend"].includes(input.action)) {
      if (!input.expiresAt || !Number.isFinite(+new Date(input.expiresAt)) || +new Date(input.expiresAt) <= Date.now()) throw new HttpError(400, "Choose an expiration date in the future.");
      expiry = input.expiresAt;
      if (input.action === "extend" && old.expires_at && +new Date(input.expiresAt) <= +new Date(old.expires_at)) throw new HttpError(400, "An extension must be later than the existing expiration.");
    }
    if (input.action === "approve") { status = "TRIAL"; expiry = new Date(Date.now() + 14 * 86400000); approvedAt = new Date(); }
    if (input.action === "activate") { status = "ACTIVE"; approvedAt ||= new Date(); }
    if (input.action === "extend" && effective === "EXPIRED") status = "ACTIVE";
    if (input.action === "suspend") status = "SUSPENDED";
    if (input.action === "revoke") status = "REVOKED";
    if (input.action === "reactivate") {
      if (!planId) throw new HttpError(400, "Assign a plan before reactivation.");
      status = "ACTIVE";
      if (expired) expiry = new Date(Date.now() + 30 * 86400000);
    }
    if (["approve", "activate", "reactivate"].includes(input.action)) {
      key ||= "BHRU-" + randomBytes(24).toString("hex").toUpperCase();
      activatedAt ||= new Date();
      await client.query(`INSERT INTO activations(id,subscription_id,admin_actor_id,action) VALUES($1,$2,$3,$4)`,
        [randomUUID(), old.id, user.id, input.action]);
    }
    await client.query(`UPDATE subscriptions SET status=$2,plan_id=$3,expires_at=$4,licence_key=$5,activated_at=$6,
      approved_at=$7,updated_at=now() WHERE subscriber_id=$1`, [id, status, planId, expiry, key, activatedAt, approvedAt]);
    const actions: Record<string, string> = { approve: "Subscriber approved as trial", activate: "Subscriber activated", plan: "Plan changed",
      extend: "Subscription extended", suspend: "Subscriber suspended", reactivate: "Subscriber reactivated", revoke: "Licence revoked" };
    await audit(client, user, actions[input.action]!, "subscriber", id, old.business);
  });
  res.json(await platformState(user));
});
router.patch("/admin/subscribers/:id", async (req, res) => {
  const user = requireAdmin(req), id = idParam(req.params.id);
  validateDateInput(req.body?.expiresAt, true);
  const input = EditSubscriberBody.strict().parse(req.body);
  await transaction(async client => {
    const current = await client.query(`SELECT s.business,u.full_name AS owner,u.email,u.username,u.phone,u.country,s.notes
      FROM subscribers s JOIN account_users u ON u.subscriber_id=s.id WHERE s.id=$1 FOR UPDATE`, [id]);
    if (!current.rows[0]) throw new HttpError(404, "Subscriber not found.");
    const next = { ...current.rows[0], ...input };
    for (const key of ["business", "owner", "email", "username", "phone", "country"]) if (!next[key].trim()) throw new HttpError(400, "Required fields cannot be blank.");
    await client.query("UPDATE subscribers SET business=$2,notes=$3 WHERE id=$1", [id, next.business.trim(), next.notes]);
    await client.query(`UPDATE account_users SET full_name=$2,email=$3,username=$4,phone=$5,country=$6 WHERE subscriber_id=$1`,
      [id, next.owner.trim(), next.email.trim().toLowerCase(), next.username.toLowerCase(), next.phone.trim(), next.country.trim()]);
    if (Object.hasOwn(input, "expiresAt")) {
      await client.query("UPDATE subscriptions SET expires_at=$2,updated_at=now() WHERE subscriber_id=$1", [id, input.expiresAt]);
    }
    await audit(client, user, Object.hasOwn(input, "expiresAt") ? "Subscriber updated / expiration changed" : "Subscriber details updated",
      "subscriber", id, next.business);
  });
  res.json(await platformState(user));
});
export default router;