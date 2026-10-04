import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 131072, r = 8, p = 1, length = 64;
let running = 0;
function derive(password: string, salt: string): Promise<Buffer> {
  if (running >= 2) return Promise.reject(new Error("AUTH_BUSY"));
  running++;
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, { N, r, p, maxmem: 256 * 1024 * 1024 }, (err, key) => {
      running--;
      if (err) reject(err); else resolve(key);
    });
  });
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32).toString("hex");
  return `scrypt$${N}$${r}$${p}$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt" || parts[1] !== String(N) ||
      parts[2] !== String(r) || parts[3] !== String(p) ||
      !/^[a-f0-9]{64}$/.test(parts[4]!) || !/^[a-f0-9]{128}$/.test(parts[5]!)) return false;
  const actual = await derive(password, parts[4]!);
  return timingSafeEqual(actual, Buffer.from(parts[5]!, "hex"));
}
// Unknown accounts take the same password derivation path to avoid timing leaks.
export const dummyHash = `scrypt$${N}$${r}$${p}$${"0".repeat(64)}$${"0".repeat(128)}`;