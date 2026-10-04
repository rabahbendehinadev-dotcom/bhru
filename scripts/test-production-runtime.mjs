// Runs the compiled production-mode server against DEVELOPMENT PostgreSQL.
// Never point this verification script at a production database.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
if (process.env.NODE_ENV === "production") throw new Error("Invoke from the Development environment only.");
const port = "3010";
const child = spawn(process.execPath, ["artifacts/api-server/dist/index.mjs"], {
  env: { ...process.env, NODE_ENV: "production", PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", data => { output += data; });
child.stderr.on("data", data => { output += data; });
const base = `http://127.0.0.1:${port}`;
let cookie = "";
try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    if (child.exitCode !== null) throw new Error("Compiled server exited before readiness.");
    try { if ((await fetch(base + "/healthz")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, "Compiled server must become ready.");
  console.log("PASS: Compiled Express/PostgreSQL runtime starts with NODE_ENV=production and PORT.");
  const page = await fetch(base + "/login");
  assert.equal(page.status, 200);
  const html = await page.text();
  const asset = html.match(/src="([^"]+\.js)"/)?.[1];
  assert(asset); assert.equal((await fetch(base + asset)).status, 200);
  assert.equal((await fetch(base + "/register")).status, 200);
  console.log("PASS: Static frontend, hashed assets and SPA deep links served.");
  const anon = await fetch(base + "/admin/subscribers", { redirect: "manual" });
  assert.equal(anon.status, 302); assert.equal(anon.headers.get("location"), "/login");
  console.log("PASS: Anonymous admin page redirects server-side.");
  const tag = randomBytes(6).toString("hex");
  const registered = await fetch(base + "/api/auth/register", { method: "POST",
    headers: { "Content-Type": "application/json", "X-BHRU-Request": "1", Origin: base },
    body: JSON.stringify({ owner: "Runtime Verification", business: `Runtime verification ${tag}`, username: `runtime_${tag}`,
      email: `runtime_${tag}@example.invalid`, phone: "0000000000", country: "Other", password: randomBytes(24).toString("base64url") }),
  });
  assert.equal(registered.status, 201);
  const header = registered.headers.get("set-cookie") || "";
  assert(/HttpOnly/i.test(header)); assert(/SameSite=Lax/i.test(header)); assert(/;\s*Secure/i.test(header));
  cookie = header.split(";")[0];
  console.log("PASS: Production cookies are HttpOnly, Secure, SameSite=Lax.");
  assert.equal((await fetch(base + "/admin/subscribers", { headers: { Cookie: cookie }, redirect: "manual" })).status, 403);
  console.log("PASS: Authenticated ordinary subscriber gets HTTP 403 on admin page.");
  const unknown = await fetch(base + "/api/nonexistent");
  assert.equal(unknown.status, 404); assert((unknown.headers.get("content-type") || "").includes("application/json"));
  console.log("PASS: Unknown API route returns JSON 404, not SPA HTML.");
} finally {
  if (cookie) await fetch(base + "/api/auth/logout", { method: "POST", headers: { Cookie: cookie, "X-BHRU-Request": "1" } }).catch(() => {});
  child.kill("SIGTERM");
  await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once("exit", resolve); });
}