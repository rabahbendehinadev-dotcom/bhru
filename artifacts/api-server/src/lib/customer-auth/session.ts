import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { pool } from '@workspace/db';
import type { CustomerDB, CustomerIdentity, CustomerTenant } from './types';
import { CUSTOMER_PROFILE_SELECT } from './profile';
import { securityRequest } from './security-request';

const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
function signature(token: string, subscriber: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Customer session signing is not configured.');
  // Separate cryptographic realm AND tenant binding; owner/admin tokens cannot verify.
  return createHmac('sha256', secret).update(`public-customer:${subscriber}:${token}`).digest('hex');
}
export const customerCookieName = (slug: string) => `bhru_customer_${slug}`;
export function customerCookieOptions(req: Request) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production' || req.secure,
    sameSite: 'lax' as const, path: '/', maxAge: MAX_AGE };
}
export function customerTokenHash(req: Request, tenant: Pick<CustomerTenant, 'id' | 'slug'>): string | undefined {
  // Read only this tenant's customer cookie. Do not parse/select owner/admin realms.
  const name = customerCookieName(tenant.slug);
  const value = req.headers.cookie?.split(';').map(piece => piece.trim()).find(piece => piece.startsWith(`${name}=`))?.slice(name.length + 1);
  if (!value || !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)) return;
  const [token, mac] = value.split('.');
  if (!timingSafeEqual(Buffer.from(mac!, 'hex'), Buffer.from(signature(token!, tenant.id), 'hex'))) return;
  return digest(token!);
}
export async function loadCustomerSession(req: Request, tenant: CustomerTenant, db: CustomerDB = pool) {
  const hash = customerTokenHash(req, tenant);
  if (!hash) return { customer: null };
  const result = await db.query(`SELECT ${CUSTOMER_PROFILE_SELECT}
    FROM public_customer_sessions s JOIN public_customer_accounts c
      ON c.id=s.customer_id AND c.subscriber_id=s.subscriber_id
    WHERE s.token_hash=$1 AND s.subscriber_id=$2 AND s.expires_at>now() AND s.revoked_at IS NULL AND c.enabled`, [hash, tenant.id]);
  const customer = result.rows[0] as CustomerIdentity | undefined;
  if(customer)await db.query(`UPDATE public_customer_sessions SET last_seen_at=now() WHERE token_hash=$1 AND subscriber_id=$2
    AND revoked_at IS NULL AND (last_seen_at IS NULL OR last_seen_at<now()-interval '5 minutes')`,[hash,tenant.id]);
  return customer ? { customer, sessionHash: hash } : { customer: null };
}
export async function createCustomerSession(db: CustomerDB, tenant: CustomerTenant, customer: CustomerIdentity, previous?: string,req?:Request) {
  if (customer.subscriber_id !== tenant.id) throw new Error('Customer session tenant mismatch');
  if (previous) await db.query('DELETE FROM public_customer_sessions WHERE token_hash=$1 AND subscriber_id=$2', [previous, tenant.id]);
  // Bounded lazy cleanup touches only expired sessions of this customer/tenant.
  await db.query('DELETE FROM public_customer_sessions WHERE subscriber_id=$1 AND customer_id=$2 AND expires_at<=now()', [tenant.id, customer.id]);
  const token = randomBytes(32).toString('hex');
  const info=securityRequest(req);
  await db.query(`INSERT INTO public_customer_sessions(token_hash,subscriber_id,customer_id,expires_at,last_seen_at,ip_address,user_agent,device_label)
    VALUES($1,$2,$3,now()+interval '7 days',now(),$4,$5,$6)`, [digest(token), tenant.id, customer.id,info.ip,info.ua,info.device]);
  return `${token}.${signature(token, tenant.id)}`;
}
