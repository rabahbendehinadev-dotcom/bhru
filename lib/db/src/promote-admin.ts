import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { pool, type PoolClient } from "./index";
import { hashPassword } from "./security";

// This filename is retained for Docker/operator compatibility. It now
// bootstraps an independent administrator; it NEVER promotes a subscriber.
const args = process.argv.slice(2).filter(arg => arg !== "--");
const usage = "Usage: node admin-promote.mjs --email ADMIN_EMAIL (--password PASSWORD | --password-stdin)\n";
let client: PoolClient | undefined;
try {
  const values = new Map<string, string>();
  let stdin = false;
  for (let i = 0; i < args.length; i++) {
    const flag = args[i]!;
    if (flag === "--password-stdin" && !stdin) { stdin = true; continue; }
    if (!["--email", "--password"].includes(flag) || values.has(flag) || !args[i + 1] || args[i + 1]!.startsWith("--"))
      throw new Error(usage);
    values.set(flag, args[++i]!);
  }
  const email = values.get("--email")?.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(usage);
  if (stdin === values.has("--password")) throw new Error(usage);
  const password = stdin ? readFileSync(0, "utf8").replace(/\r?\n$/, "") : values.get("--password")!;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9\s]/].filter(re => re.test(password)).length;
  if (password.trim().length < 16 || password.length > 128 || classes < 3 ||
      new Set(password).size < 8 || /(.)\1{7}/.test(password) ||
      /^(password|admin|bhru|qwerty|letmein|welcome|123456)/i.test(password) ||
      password.toLowerCase().includes(email))
    throw new Error("Unsafe password: use 16–128 characters and at least three of lowercase, uppercase, digits and symbols. Avoid common or repeated passwords.");
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(72419062)");
  const found = await client.query("SELECT enabled FROM platform_admin_users WHERE email=$1", [email]);
  if (found.rows.length) {
    if (!found.rows[0].enabled) throw new Error("This administrator is disabled. Bootstrap cannot reactivate an account.");
    await client.query("COMMIT");
    process.stdout.write("Platform administrator already exists. No account or password was changed.\n");
  } else {
    const existing = await client.query("SELECT id FROM platform_admin_users WHERE enabled LIMIT 1");
    if (existing.rows.length) throw new Error("The first administrator already exists. Bootstrap cannot create additional administrators.");
    const passwordHash = await hashPassword(password);
    await client.query(`INSERT INTO platform_admin_users(id,email,password_hash) VALUES($1,$2,$3)`,
      [randomUUID(), email, passwordHash]);
    await client.query("COMMIT");
    process.stdout.write("Independent platform administrator created. Sign in at your private administrator entry.\n");
  }
} catch (error) {
  if (client) await client.query("ROLLBACK");
  // Database errors may include parameter values; never print their detail.
  const message = error instanceof Error && !("code" in error) ? error.message : "Administrator bootstrap failed. Check the database and migrations.";
  process.stderr.write(message + "\n");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}