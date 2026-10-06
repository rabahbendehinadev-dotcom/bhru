import { Router, type Request } from "express";
import { requireUser, authorizeTenant, HttpError } from "../lib/auth";
import { transaction, getSubscriber, audit } from "../lib/platform";
import { serializeGeneralSettings, settingsFields, validateGeneralSettings } from "../lib/general-settings";

const router = Router();

function currentSubscriber(req: Request) {
  const user = requireUser(req);
  if (user.admin) throw new HttpError(403, "General Settings requires a subscriber account. Administrator preview cannot save these settings.");
  authorizeTenant(req, user.subscriber_id);
  if (Object.keys(req.query).length) throw new HttpError(400, "General Settings does not accept subscriber identifiers or query parameters.");
  return user;
}

router.get("/settings/general", async (req, res) => {
  const user = currentSubscriber(req);
  const settings = await transaction(async client => {
    // Hold eligibility stable until the settings read completes. Uses the same
    // allowed calculation as the existing panel, on this transaction's client.
    await client.query("SELECT id FROM subscriptions WHERE subscriber_id=$1 FOR SHARE", [user.subscriber_id]);
    const subscriber = await getSubscriber(user.subscriber_id, client);
    if (!subscriber) throw new HttpError(404, "Subscriber not found.");
    if (!subscriber.allowed) throw new HttpError(403, subscriber.accessReason);
    const result = await client.query("SELECT * FROM subscriber_general_settings WHERE subscriber_id=$1", [user.subscriber_id]);
    if (!result.rows[0]) throw new HttpError(500, "General Settings is not initialized. Contact the BHRU team.");
    return serializeGeneralSettings(result.rows[0]);
  });
  res.json(settings);
});

router.put("/settings/general", async (req, res) => {
  const user = currentSubscriber(req);
  const values = validateGeneralSettings(req.body);
  const settings = await transaction(async client => {
    await client.query("SELECT id FROM subscriptions WHERE subscriber_id=$1 FOR SHARE", [user.subscriber_id]);
    const subscriber = await getSubscriber(user.subscriber_id, client);
    if (!subscriber) throw new HttpError(404, "Subscriber not found.");
    if (!subscriber.allowed) throw new HttpError(403, subscriber.accessReason);
    const assignments = settingsFields.map((field, index) => `${field}=$${index + 2}`).join(",");
    const result = await client.query(
      `UPDATE subscriber_general_settings SET ${assignments},updated_at=now() WHERE subscriber_id=$1 RETURNING *`,
      [user.subscriber_id, ...settingsFields.map(field => values[field])],
    );
    if (!result.rows[0]) throw new HttpError(500, "General Settings is not initialized. Contact the BHRU team.");
    await audit(client, user, "General Settings updated", "subscriber", user.subscriber_id, "General Settings");
    return serializeGeneralSettings(result.rows[0]);
  });
  res.json(settings);
});

export default router;
