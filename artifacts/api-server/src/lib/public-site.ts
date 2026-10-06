import type { Request, Response, NextFunction } from "express";
import { pool, type PoolClient } from "@workspace/db";
import { adminPath } from "./admin-entry";
import { publicSiteHTML, type PublicSiteNames } from "./public-site-html";

const APPLICATION_ROOTS = new Set([
  'login', 'register', 'dashboard', 'settings', 'm', 'api', 'admin',
  'assets', 'brand', 'pwa', 'healthz', 'src', 'node_modules', '.well-known',
]);
const STATIC_FILES = new Set(['index.html', 'robots.txt', 'manifest.webmanifest', 'sw.js', 'favicon.ico', 'sitemap.xml']);
type Classification = { kind: 'application' } | { kind: 'invalid' } | { kind: 'slug'; slug: string };

export function classifyPublicPath(path: unknown): Classification {
  if (typeof path !== 'string' || !path.startsWith('/')) return { kind: 'invalid' };
  const root = path.slice(1).split('/')[0]!.toLowerCase();
  // Protect the complete existing namespaces, not just individual leaf routes.
  if (path === '/' || APPLICATION_ROOTS.has(root) || STATIC_FILES.has(root) ||
      root === adminPath.slice(1).toLowerCase() || root.startsWith('@')) return { kind: 'application' };
  // No decoding, trimming, transliteration or aliases in URL resolution.
  // Full-match comparison also excludes terminal newlines accepted by JS `$`.
  const matched = /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.exec(path)?.[0];
  if (matched !== path || path.length > 64) return { kind: 'invalid' };
  return { kind: 'slug', slug: path.slice(1) };
}

type DocumentResult =
  | { kind: 'application'; status: 204 }
  | { kind: 'missing'; status: 404 }
  | { kind: 'site'; status: 200; site: PublicSiteNames }
  | { kind: 'unavailable'; status: 503; errorCode: string };

export async function resolvePublicDocument(
  path: unknown, database: Pick<PoolClient, 'query'> = pool,
): Promise<DocumentResult> {
  const classification = classifyPublicPath(path);
  if (classification.kind === 'application') return { kind: 'application', status: 204 };
  if (classification.kind === 'invalid') return { kind: 'missing', status: 404 };
  try {
    // Deliberately select no IDs, account/contact fields, licence keys or status.
    // Eligibility matches the existing panel predicate; plan.enabled is not an
    // access condition for an already-issued licence.
    const result = await database.query(`SELECT s.business AS "businessName",
      coalesce(nullif(btrim(g.company_name),''),s.business) AS "companyName"
      FROM subscribers s JOIN subscriptions l ON l.subscriber_id=s.id
      LEFT JOIN subscriber_general_settings g ON g.subscriber_id=s.id
      WHERE s.public_slug=$1 AND NOT public.bhru_slug_reserved($1,$2)
        AND l.status IN ('ACTIVE','TRIAL') AND l.expires_at>now()
        AND l.licence_key IS NOT NULL AND l.plan_id IS NOT NULL`,
      [classification.slug, adminPath.slice(1)]);
    const row = result.rows[0];
    if (!row) return { kind: 'missing', status: 404 };
    if (typeof row.businessName !== 'string' || typeof row.companyName !== 'string') {
      throw new Error('Invalid public names');
    }
    return { kind: 'site', status: 200, site: { businessName: row.businessName, companyName: row.companyName } };
  } catch (error) {
    const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
    return { kind: 'unavailable', status: 503, errorCode: typeof code === 'string' ? code : 'INTERNAL' };
  }
}

export function writePublicDocument(req: Request, res: Response, result: DocumentResult): void {
  res.setHeader('Cache-Control', 'no-store');
  if (result.kind === 'application') { res.status(204).end(); return; }
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
  if (result.kind === 'unavailable') {
    req.log.error({ code: result.errorCode }, 'Public site unavailable');
    res.setHeader('Retry-After', '60');
  }
  res.status(result.status).type('html').end(publicSiteHTML(
    result.kind === 'site' ? result.site : undefined, result.kind === 'unavailable',
  ));
}

export async function publicSiteNavigation(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!['GET', 'HEAD'].includes(req.method)) { next(); return; }
  const path = req.originalUrl.split('?')[0];
  if (classifyPublicPath(path).kind === 'application') { next(); return; }
  writePublicDocument(req, res, await resolvePublicDocument(path));
}
