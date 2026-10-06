import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { resolve } from "node:path";
import { pool } from "@workspace/db";
import { loadSession, csrfProtection, HttpError } from "./lib/auth";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { adminPath, isAdminEntry } from "./lib/admin-entry";
import { publicSiteNavigation, resolvePublicDocument, writePublicDocument } from "./lib/public-site";
import { publicMediaRouter } from "./routes/public-website";

const app: Express = express();
app.disable("x-powered-by");
// Exactly one trusted reverse proxy (Traefik on VPS, shared proxy in dev).
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  next();
});
// Public documents deliberately finish before session/account middleware.
// The 204 response means "existing application namespace", never public data.
app.get("/api/public/site-document", async (req, res) => {
  writePublicDocument(req, res, await resolvePublicDocument(req.query.path));
});
if (process.env.NODE_ENV === "production") app.use(publicSiteNavigation);
app.use(publicMediaRouter);
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());
app.get("/healthz", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});
app.use(loadSession);
app.use("/api", csrfProtection, router);
app.use("/api", (_req, res) => { res.status(404).json({ error: "Endpoint not found." }); });

if (process.env.NODE_ENV === "production") {
  const root = resolve(import.meta.dirname, "public");
  app.use((req, res, next) => {
    if (req.path === "/admin" || req.path.startsWith("/admin/")) {
      res.status(404).send("Page not found."); return;
    }
    if (!isAdminEntry(req.path)) { next(); return; }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (!req.adminAuth) {
      if (req.subscriberAuth) { res.status(403).send("Access denied."); return; }
      if (req.path !== adminPath) { res.redirect(adminPath); return; }
      next(); return; // Independent administrator login, never public /login.
    }
    next();
  });
  app.use(express.static(root, { index: false, dotfiles: "deny", setHeaders(res, file) {
    res.setHeader("Cache-Control", file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
  } }));
  app.get("/{*splat}", (req, res) => {
    res.setHeader("Cache-Control", isAdminEntry(req.path) ? "no-store" : "no-cache");
    res.sendFile(resolve(root, "index.html"));
  });
}
app.use((error: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
  if (error.name === "ZodError") {
    const fields = Object.fromEntries(error.issues.map((i: any) => [
      (req.path.startsWith('/api/cms/public-website') && i.path[0] === 'values' ? i.path.slice(1) : i.path).join("."), i.message,
    ]));
    res.status(400).json({ error: "Check the entered values.", fields });
    return;
  }
  if (error.message === "AUTH_BUSY") { res.status(429).json({ error: "Authentication is busy. Please try again shortly." }); return; }
  if (error.code === "23505") { res.status(409).json({ error: "Username, email or plan name is already in use." }); return; }
  if (["23514", "22007", "22003"].includes(error.code)) { res.status(400).json({ error: "Invalid subscription, date or price." }); return; }
  if (error.status === 400 || error.status === 413) { res.status(error.status).json({ error: "Invalid or oversized request." }); return; }
  req.log.error({ code: error.code || "INTERNAL" }, "Request failed");
  res.status(500).json({ error: "Server request failed. Please try again." });
});

export default app;
