import { randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword, dummyHash } from '@workspace/db/security';
import { RegisterPublicCustomerBody, LoginPublicCustomerBody, LogoutPublicCustomerBody } from '@workspace/api-zod';
import type { Request } from 'express';
import { HttpError, rateLimit } from '../auth';
import { transaction } from '../platform';
import { customerLinks } from './links';
import { createCustomerSession } from './session';
import { customerProfile, type CustomerContext, type CustomerIdentity } from './types';

export function customerContext(req: Request): CustomerContext {
  if (!req.customerPublic) throw new HttpError(404, 'Public website not found.');
  return req.customerPublic;
}
export function customerCsrf(req: Request): void {
  const origin = req.get('origin');
  const expected = `${req.protocol}://${req.get('host')}`;
  if (req.get('X-BHRU-Customer-Request') !== '1' || (origin && origin !== expected) ||
      req.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Cross-site request rejected.');
}
function normalizedEmail(value: string): string { return value.trim().toLowerCase(); }
export function registrationInput(body: unknown) {
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const input = RegisterPublicCustomerBody.strict().parse({
    ...raw,
    ...(typeof raw.firstName === 'string' ? { firstName: raw.firstName.trim() } : {}),
    ...(typeof raw.lastName === 'string' ? { lastName: raw.lastName.trim() } : {}),
    ...(typeof raw.email === 'string' ? { email: normalizedEmail(raw.email) } : {}),
  });
  if (/[\u0000-\u001f\u007f]/.test(input.firstName + input.lastName)) throw new HttpError(400, 'Enter valid first and last names.');
  if (input.password !== input.confirmPassword) throw new HttpError(400, 'Passwords do not match.');
  return input;
}
export function loginInput(body: unknown) {
  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  return LoginPublicCustomerBody.strict().parse({
    ...raw, ...(typeof raw.email === 'string' ? { email: normalizedEmail(raw.email) } : {}),
  });
}
export async function registerCustomer(req: Request) {
  const { tenant } = customerContext(req);
  customerCsrf(req);
  await rateLimit(`public-customer:register:${req.ip}`, 20);
  await rateLimit(`public-customer:register:${tenant.id}:${req.ip}`, 10);
  const input = registrationInput(req.body);
  // Always derive a hash, even for an existing address. Never return email conflicts.
  const passwordHash = await hashPassword(input.password);
  await transaction(async db => {
    await db.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(subscriber_id,email) DO NOTHING`,
    [randomUUID(), tenant.id, input.firstName, input.lastName, input.email, passwordHash]);
  });
  return {
    message: 'Registration processed. You can now sign in with your email and password.',
    next: `${customerLinks(tenant.slug, tenant.customRoot).loginHref}?registered=1`,
  };
}
export async function loginCustomer(req: Request) {
  const { tenant, sessionHash } = customerContext(req);
  customerCsrf(req);
  await rateLimit(`public-customer:login:${req.ip}`, 60);
  const input = loginInput(req.body);
  await rateLimit(`public-customer:login:${tenant.id}:${input.email}`, 10);
  return transaction(async db => {
    const row = (await db.query(`SELECT id,subscriber_id,first_name AS "firstName",last_name AS "lastName",email,password_hash,enabled
      FROM public_customer_accounts WHERE subscriber_id=$1 AND email=$2`, [tenant.id, input.email])).rows[0] as (CustomerIdentity & { password_hash: string; enabled: boolean }) | undefined;
    const valid = await verifyPassword(input.password, row?.password_hash || dummyHash);
    if (!row || !valid || !row.enabled) throw new HttpError(401, 'Invalid email or password.');
    const token = await createCustomerSession(db, tenant, row, sessionHash);
    return { token, customer: customerProfile(row), next: customerLinks(tenant.slug, tenant.customRoot).accountHref };
  });
}
export async function logoutCustomer(req: Request) {
  const { tenant, sessionHash } = customerContext(req);
  customerCsrf(req);
  LogoutPublicCustomerBody.strict().parse(req.body);
  await transaction(async db => {
    if (sessionHash) await db.query('DELETE FROM public_customer_sessions WHERE token_hash=$1 AND subscriber_id=$2', [sessionHash, tenant.id]);
  });
  return { next: customerLinks(tenant.slug, tenant.customRoot).homeHref };
}
