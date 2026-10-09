import { Router, json, type Request, type Response, type NextFunction } from 'express';
import { customerPageMode } from '../lib/customer-auth/context';
import { customerContext, customerCsrf, registerCustomer, loginCustomer, logoutCustomer } from '../lib/customer-auth/service';
import { customerCookieName, customerCookieOptions } from '../lib/customer-auth/session';
import { customerLinks, withCustomerAccess } from '../lib/customer-auth/links';
import { renderCustomerDocument, CUSTOMER_DOCUMENT_SCRIPT_HASHES } from '../lib/customer-auth/ui';
import { pool } from '@workspace/db';
import { z } from '@workspace/api-zod';
import { registrationOptions, effectiveCustomerProfile } from '../lib/customer-auth/profile';
import { issueRegistrationChallenge } from '../lib/customer-auth/challenge';
import customerPanelRouter from './customer-panel';
import {forgotPassword,resetPassword} from '../lib/customer-auth/security';

const router = Router();
router.use('/api/public/customer', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Host, Cookie');
  next();
});
router.get('/api/public/customer/:slug/options', async(req,res) => {
  res.json(await registrationOptions(customerContext(req).tenant.id,pool));
});
router.post('/api/public/customer/:slug/challenge',json({limit:'1kb'}),async(req,res) => {
  customerCsrf(req);
  z.object({}).strict().parse(req.body);
  res.json(await issueRegistrationChallenge(req,res));
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
router.post('/api/public/customer/:slug/forgot-password',json({limit:'8kb'}),async(req,res)=>res.json(await forgotPassword(req)));
router.post('/api/public/customer/:slug/reset-password',json({limit:'8kb'}),async(req,res)=>res.json(await resetPassword(req)));
router.get('/api/public/customer/:slug/session', async(req, res) => {
  const { customer } = customerContext(req);
  res.json({ customer: customer ? await effectiveCustomerProfile(customer,pool) : null });
});
router.use('/api/public/customer/:slug/panel',customerPanelRouter);
// Unsupported customer methods/actions never fall through to owner/admin auth.
router.all('/api/public/customer/{*path}', (_req, res) => {
  res.status(404).json({ error: 'Customer endpoint not found.' });
});

/** Runs before the custom-host firewall, without changing domain infrastructure. */
router.use(async(req: Request, res: Response, next: NextFunction) => {
  if (!['GET', 'HEAD'].includes(req.method)) { next(); return; }
  const path = req.path === '/api/public/site-document' ? req.query.path : req.path;
  const mode = customerPageMode(path);
  if (!mode) { next(); return; }
  const { tenant, customer } = customerContext(req);
  const links = customerLinks(tenant.slug, tenant.customRoot, customer?.firstName);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Host, Cookie');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const authPage=mode==='login'||mode==='register'||mode==='forgot-password'||mode==='reset-password';
  if (!authPage && !customer) { res.redirect(303, links.loginHref); return; }
  if ((mode==='login'||mode==='register') && customer) { res.redirect(303, links.accountHref); return; }
  res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; script-src ${CUSTOMER_DOCUMENT_SCRIPT_HASHES.map(hash => `'sha256-${hash}'`).join(' ')}; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`);
  res.type('html').send(renderCustomerDocument(withCustomerAccess(tenant.model, links), mode, customer ? await effectiveCustomerProfile(customer,pool) : undefined));
});
export default router;
