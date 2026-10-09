import type { Request, Response, NextFunction } from 'express';
import { pool } from '@workspace/db';
import { HttpError } from '../auth';
import { classifyPublicPath, resolvePublicDocument } from '../public-site';
import { domainConfig, normalizeDomain } from '../domains/config';
import { requestHost } from '../domains/gateway';
import { domainActive } from '../domains/service';
import type { DomainRow } from '../domains/evidence';
import type { CustomerDB, CustomerTenant } from './types';
import { loadCustomerSession } from './session';

const SLUG = '[a-z0-9]+(?:-[a-z0-9]+)*';
const CUSTOMER_API = new RegExp(`^/api/public/customer/(${SLUG})/(login|register|logout|forgot-password|reset-password|session|options|challenge|panel(?:/(?:services|orders|statement|quote|announcements)(?:/[a-f0-9-]{36})?|/security(?:/password|/sessions/(?:revoke-others|[a-f0-9-]{36}/revoke))?|/funding(?:/gateways|/quote|/initiate|/[a-f0-9-]{36}(?:/cancel)?)?)?)$`);
const CUSTOMER_COMMERCE_API = new RegExp(`^/api/public/commerce/(${SLUG})/orders$`);
const SLUG_PAGE = new RegExp(`^/(${SLUG})(?:/(customer/(?:login|register|forgot-password|reset-password|account|dashboard|services|orders|wallet|transactions|announcements|profile|security)|product/${SLUG}|cart|checkout|confirmation))?$`);
const ROOT_PAGE = new RegExp(`^/(?:customer/(?:login|register|forgot-password|reset-password|account|dashboard|services|orders|wallet|transactions|announcements|profile|security)|product/${SLUG}|cart|checkout|confirmation)?$`);
export type CustomerPageMode='login'|'register'|'forgot-password'|'reset-password'|'account'|'dashboard'|'services'|'orders'|'wallet'|'transactions'|'announcements'|'profile'|'security';
export function customerPageMode(path: unknown): CustomerPageMode | null {
  if (typeof path !== 'string') return null;
  const mode = /\/customer\/(login|register|forgot-password|reset-password|account|dashboard|services|orders|wallet|transactions|announcements|profile|security)$/.exec(path)?.[1] as CustomerPageMode | undefined;
  return mode && path.endsWith(`/customer/${mode}`) ? mode : null;
}
export function isCustomerApi(path: string): boolean { return CUSTOMER_API.exec(path)?.[0] === path; }
function sharedHost(host: string): boolean {
  if (domainConfig().hosts.includes(host)) return true;
  return process.env.NODE_ENV !== 'production' && [
    'localhost', '127.0.0.1', '[::1]', process.env.REPLIT_DEV_DOMAIN, ...(process.env.REPLIT_DOMAINS || '').split(','),
  ].includes(host);
}
/** Reuses verified host mapping and existing public-site eligibility. No client tenant IDs. */
export async function resolveCustomerTenant(req: Request, path: unknown, db: CustomerDB = pool): Promise<CustomerTenant | null> {
  if (typeof path !== 'string') return null;
  const apiMatch = CUSTOMER_API.exec(path) ?? CUSTOMER_COMMERCE_API.exec(path), pageMatch = SLUG_PAGE.exec(path);
  const api = apiMatch?.[0] === path ? apiMatch : null, page = pageMatch?.[0] === path ? pageMatch : null;
  const rootPage = ROOT_PAGE.exec(path)?.[0] === path;
  // Do not load customer sessions or business data for owner/admin/private namespaces.
  if (!api && !page && !rootPage) return null;
  if (req.rawHeaders.filter((value, i) => i % 2 === 0 && value.toLowerCase() === 'host').length !== 1) throw new HttpError(400, 'Invalid host.');
  const host = requestHost(req.headers.host);
  if (!host) throw new HttpError(400, 'Invalid host.');
  let slug: string, customRoot = false;
  if (sharedHost(host)) {
    if (!api && !page) return null;
    slug = (api || page)![1]!;
    if (classifyPublicPath(`/${slug}`).kind !== 'slug') return null;
  } else {
    if (!api && !rootPage) return null;
    const config = domainConfig();
    if (!config.enabled) throw new HttpError(404, 'Public website not found.');
    try { if (normalizeDomain(host) !== host) throw new Error('Invalid host'); }
    catch { throw new HttpError(404, 'Public website not found.'); }
    const domain = (await db.query(`SELECT d.*,s.public_slug FROM subscriber_custom_domains d
      JOIN subscribers s ON s.id=d.subscriber_id WHERE d.hostname=$1`, [host])).rows[0] as (DomainRow & { public_slug: string }) | undefined;
    if (!domain || !domainActive(domain)) throw new HttpError(404, 'Public website not found.');
    slug = domain.public_slug;
    // A slug in a custom-host API URL is a consistency check, not tenant selection.
    if (api && api[1] !== slug) throw new HttpError(404, 'Public website not found.');
    customRoot = true;
  }
  const document = await resolvePublicDocument(`/${slug}`, db);
  if (document.kind === 'unavailable') throw new HttpError(503, 'Public website temporarily unavailable.');
  if (document.kind !== 'site') throw new HttpError(404, 'Public website not found.');
  const subscriber = (await db.query('SELECT id FROM subscribers WHERE public_slug=$1', [slug])).rows[0];
  if (!subscriber) throw new HttpError(404, 'Public website not found.');
  return { id: subscriber.id, slug, customRoot, model: document.site };
}
export async function customerPublicContext(req: Request, _res: Response, next: NextFunction) {
  const path = req.path === '/api/public/site-document' ? req.query.path : req.path;
  try {
    const tenant = await resolveCustomerTenant(req, path);
    if (tenant) {
      req.customerPublic = { tenant, customer: null };
      Object.assign(req.customerPublic, await loadCustomerSession(req, tenant));
    }
    next();
  } catch (error) {
    // Existing non-auth public routing keeps its own generic unavailable/missing UI.
    if (!isCustomerApi(req.path) && !customerPageMode(path) && !req.customerPublic) { next(); return; }
    next(error);
  }
}
