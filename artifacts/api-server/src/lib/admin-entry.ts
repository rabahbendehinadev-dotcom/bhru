// Runtime-only configuration: changing the entry does not require a frontend rebuild.
const segment = process.env.PLATFORM_ADMIN_PATH;
if (!segment || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(segment) ||
    ["api", "assets", "login", "register", "admin", "dashboard", "settings", "m", "healthz"].includes(segment.toLowerCase())) {
  throw new Error("Set PLATFORM_ADMIN_PATH to a unique URL segment (letters, digits, hyphens or underscores).");
}
export const adminPath = `/${segment}`;
export const isAdminEntry = (path: string) => path === adminPath || path.startsWith(`${adminPath}/`);