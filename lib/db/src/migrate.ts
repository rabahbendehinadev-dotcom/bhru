import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { pool } from "./index";

const client = await pool.connect();
try {
  // Serialize concurrent deployments. Applied files are never silently changed.
  await client.query("SELECT pg_advisory_lock(72419061)");
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations
    (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = resolve(import.meta.dirname, "migrations");
  for (const file of (await readdir(dir)).filter(n => /^\d+_.+\.sql$/.test(n)).sort()) {
    const sql = await readFile(resolve(dir, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const applied = await client.query("SELECT checksum FROM schema_migrations WHERE name=$1", [file]);
    if (applied.rows.length) {
      if (applied.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${file}`);
      process.stdout.write(`Already applied: ${file}\n`);
      continue;
    }
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)", [file, checksum]);
      await client.query("COMMIT");
      process.stdout.write(`Applied: ${file}\n`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(72419061)");
  client.release();
  await pool.end();
}