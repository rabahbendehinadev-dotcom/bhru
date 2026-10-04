import { randomUUID } from "node:crypto";
import { pool } from "./index";

const emailIndex = process.argv.indexOf("--email");
const email = process.argv[emailIndex + 1]?.trim().toLowerCase();
if (emailIndex < 0 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  process.stderr.write("Usage: admin:promote --email EXISTING_ACCOUNT_EMAIL\n");
  await pool.end();
  process.exit(1);
}
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const found = await client.query("SELECT id,full_name FROM account_users WHERE email=$1 FOR UPDATE", [email]);
  if (!found.rows[0]) throw new Error("Register your own account first; no account matches this email.");
  const user = found.rows[0];
  const added = await client.query(`INSERT INTO platform_admin_users(user_id) VALUES($1)
    ON CONFLICT(user_id) DO NOTHING RETURNING user_id`, [user.id]);
  if (added.rowCount) {
    // Invalidate pre-promotion sessions; a fresh authenticated login is required.
    await client.query("DELETE FROM sessions WHERE user_id=$1", [user.id]);
    await client.query(`INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,target_label)
      VALUES($1,$2,'Platform admin promoted via trusted CLI','account',$4,$3)`,
      [randomUUID(), user.id, user.full_name, user.id]);
  }
  await client.query("COMMIT");
  process.stdout.write("Platform admin promotion complete. Sign in again using your existing password.\n");
} catch (error) {
  await client.query("ROLLBACK");
  process.stderr.write(error instanceof Error ? error.message + "\n" : "Promotion failed.\n");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}