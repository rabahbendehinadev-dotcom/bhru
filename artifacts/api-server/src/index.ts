import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { adminPath } from "./lib/admin-entry";
import { initializePublicMedia } from "./lib/public-site/media";
import { startDomainController } from "./lib/domains/controller";

const rawPort = process.env["PORT"] || "3000";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

try {
  await pool.query("SELECT name FROM schema_migrations LIMIT 1");
  await pool.query("SELECT amount_account_units,account_currency_snapshot FROM customer_wallet_ledger LIMIT 0");
  await pool.query("SELECT price_account_units,account_currency_snapshot FROM service_orders LIMIT 0");
  await pool.query("SELECT subscriber_id FROM subscriber_public_sites LIMIT 0");
  await pool.query("SELECT subscriber_id,client_code,username,last_login_at FROM public_customer_accounts LIMIT 0");
  await pool.query("SELECT subscriber_id FROM public_customer_sessions LIMIT 0");
  await pool.query("SELECT id FROM public_customer_registration_challenges LIMIT 0");
  await pool.query("SELECT id FROM reseller_client_notes LIMIT 0");
  await pool.query("SELECT id FROM public_customer_activity LIMIT 0");
  await pool.query("SELECT subscriber_id,customer_id,available_balance FROM customer_wallets LIMIT 0");
  await pool.query("SELECT id FROM customer_wallet_ledger LIMIT 0");
  await pool.query("SELECT id FROM manual_services LIMIT 0");
  await pool.query("SELECT id,wallet_debit_reference FROM service_orders LIMIT 0");
  await pool.query("SELECT hostname,check_generation,dns_checked_at FROM subscriber_custom_domains LIMIT 0");
  await pool.query("SELECT subscriber_id,logo_strip_settings,announcement_ticker_settings FROM public_site_presentation LIMIT 0");
  await pool.query("SELECT icon_text FROM public_site_announcements LIMIT 0");
  await pool.query("SELECT subscriber_id FROM subscriber_modules LIMIT 0");
  await pool.query("SELECT id,money_model_version,total_usd_units,customer_id FROM store_orders LIMIT 0");
  await pool.query("SELECT price_usd_units,provider_cost_usd_units FROM store_products LIMIT 0");
  await pool.query("SELECT panel_display_currency FROM account_users LIMIT 0");
  const collision = await pool.query(
    "SELECT 1 FROM subscribers WHERE public_slug=lower($1) LIMIT 1", [adminPath.slice(1)],
  );
  if (collision.rowCount) throw new Error("Private entry conflicts with an assigned public slug.");
} catch {
  logger.error("Database is unavailable or migrations have not been applied. Run db:migrate before starting.");
  await pool.end();
  process.exit(1);
}
await initializePublicMedia();
const server = app.listen(port, "0.0.0.0", (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startDomainController();
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  server.close(() => { pool.end().then(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10000).unref();
});
