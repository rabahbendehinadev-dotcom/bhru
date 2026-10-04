import { cp, mkdir } from "node:fs/promises";
const destination = new URL("../artifacts/api-server/dist/public/", import.meta.url);
await mkdir(destination, { recursive: true });
await cp(new URL("../artifacts/bhru/dist/public/", import.meta.url), destination, { recursive: true });
console.log("BHRU frontend + API runtime prepared in artifacts/api-server/dist.");