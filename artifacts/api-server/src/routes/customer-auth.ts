import { Router, json, type Request, type Response, type NextFunction } from 'express';
import { customerPageMode } from '../lib/customer-auth/context';
import { customerContext, registerCustomer, loginCustomer, logoutCustomer } from '../lib/customer-auth/service';
import { customerCookieName, customerCookieOptions } from '../lib/customer-auth/session';
import { customerProfile } from '../lib/customer-auth/types';
import { customerLinks, withCustomerAccess } from '../lib/customer-auth/links';
import { renderCustomerDocument, CUSTOMER_DOCUMENT_SCRIPT_HASHES } from '../lib/customer-auth/ui';

const router = Router();
router.use('/api/public/customer', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Host, Cookie');
  next();
});
router.post('/api/public/customer/:slug/register', json({ limit: '8kb' }), async (req, res) => {
  res.status(201).json(await registerCustomer(req));
});
router.post('/api/public/customer/:slug/login', json({ limit: '8kb' }), async (req, res) => {
  const { token, ...result } = await loginCustomer(req);
  const { tenant } = customerContext(req);
  res.cookie(customerCookieName(tenant.slug), token, customerCookieOptions(req));
  res.json(result);
});
router.post('/api/public/customer/:slug/logout', json({ limit: '8kb' }), async (req, res) => {
  const result = await logoutCustomer(req);
  const { tenant } = customerContext(req);
  const { maxAge: _maxAge, ...options } = customerCookieOptions(req);
  res.clearCookie(customerCookieName(tenant.slug), options);
  res.json(result);
});
router.get('/api/public/customer/:slug/session', (req, res) => {
  const { customer } = customerContext(req);
  res.json({ customer: customer ? customerProfile(customer) : null });
});
// Unsupported customer methods/actions never fall through to owner/admin auth.
router.all('/api/public/customer/{*path}', (_req, res) => {
  res.status(404).json({ error: 'Customer endpoint not found.' });
});

/** Runs before the custom-host firewall, without changing domain infrastructure. */
router.use((req: Request, res: Response, next: NextFunction) => {
  if (!['GET', 'HEAD'].includes(req.method)) { next(); return; }
  const path = req.path === '/api/public/site-document' ? req.query.path : req.path;
  const mode = customerPageMode(path);
  if (!mode) { next(); return; }
  const { tenant, customer } = customerContext(req);
  const links = customerLinks(tenant.slug, tenant.customRoot, customer?.firstName);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Host, Cookie');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (mode === 'account' && !customer) { res.redirect(303, links.loginHref); return; }
  if (mode !== 'account' && customer) { res.redirect(303, links.accountHref); return; }
  res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; script-src ${CUSTOMER_DOCUMENT_SCRIPT_HASHES.map(hash => `'sha256-${hash}'`).join(' ')}; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`);
  res.type('html').send(renderCustomerDocument(withCustomerAccess(tenant.model, links), mode, customer ? customerProfile(customer) : undefined));
});
export default router;
