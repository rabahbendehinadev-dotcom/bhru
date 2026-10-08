import { randomUUID, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, dummyHash } from '@workspace/db/security';
import { RegisterPublicCustomerBody, LoginPublicCustomerBody, LogoutPublicCustomerBody } from '@workspace/api-zod';
import type { Request } from 'express';
import { HttpError, rateLimit } from '../auth';
import { transaction } from '../platform';
import { customerLinks } from './links';
import { createCustomerSession } from './session';
import { type CustomerContext, type CustomerIdentity } from './types';
import { CUSTOMER_PROFILE_SELECT, normalizePhone, USERNAME, validatePreferences, effectiveCustomerProfile } from './profile';
import { consumeRegistrationChallenge } from './challenge';

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
  if (!input.termsAccepted) throw new HttpError(400, 'You must accept the Terms of Service.');
  if (input.username && !USERNAME.test(input.username.trim())) throw new HttpError(400,'Username must be 3–32 letters, digits, hyphens or underscores.');
  for (const [key,value] of Object.entries(input)) {
    if (!['password','confirmPassword'].includes(key) && typeof value === 'string' && /[\u0000-\u001f\u007f]/.test(value)) {
      throw new HttpError(400,'Enter valid profile information.');
    }
  }
  input.whatsappPhone = normalizePhone(input.whatsappPhone);
  input.countryCode = input.countryCode.toUpperCase();
  input.preferredCurrency = input.preferredCurrency.toUpperCase();
  input.username = input.username?.trim();
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
  await consumeRegistrationChallenge(req, input.challengeId, input.challengeAnswer);
  // Always derive a hash, even for an existing address. Never return email conflicts.
  const passwordHash = await hashPassword(input.password);
  await transaction(async db => {
    // Serialize allocation per tenant. Database unique indexes are the final guard.
    await db.query('SELECT id FROM subscribers WHERE id=$1 FOR UPDATE',[tenant.id]);
    await validatePreferences(tenant.id,input.preferredLanguage,input.preferredCurrency,input.countryCode,db);
    if ((await db.query('SELECT id FROM public_customer_accounts WHERE subscriber_id=$1 AND email=$2',[tenant.id,input.email])).rowCount) return;
    if (input.username && (await db.query(`SELECT id FROM public_customer_accounts
      WHERE subscriber_id=$1 AND (lower(username)=lower($2) OR lower(client_code)=lower($2))`,[tenant.id,input.username])).rowCount) {
      throw new HttpError(400,'Choose another username.');
    }
    let code = '';
    for(let attempt=0;attempt<32;attempt++) {
      code = randomBytes(4).toString('hex').toUpperCase();
      if (!(await db.query(`SELECT id FROM public_customer_accounts
        WHERE subscriber_id=$1 AND (client_code=$2 OR lower(username)=lower($2))`,[tenant.id,code])).rowCount) break;
      code = '';
    }
    if (!code) throw new HttpError(503,'Client code allocation is busy. Please retry.');
    const customerId = randomUUID();
    await db.query(`INSERT INTO public_customer_accounts(id,subscriber_id,first_name,last_name,email,password_hash,
      client_code,username,whatsapp_phone,preferred_language,preferred_currency,newsletter_opt_in,
      address_line_1,address_line_2,country_code,state,city,postal_code,terms_accepted_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())`,
    [customerId,tenant.id,input.firstName,input.lastName,input.email,passwordHash,code,input.username||code,
      input.whatsappPhone,input.preferredLanguage,input.preferredCurrency,input.newsletterOptIn,
      input.addressLine1,input.addressLine2,input.countryCode,input.state,input.city,input.postalCode]);
    await db.query(`INSERT INTO public_customer_activity(id,subscriber_id,customer_id,action) VALUES($1,$2,$3,'registered')`,
      [randomUUID(),tenant.id,customerId]);
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
    const row = (await db.query(`SELECT ${CUSTOMER_PROFILE_SELECT},c.password_hash,c.enabled
      FROM public_customer_accounts c WHERE c.subscriber_id=$1 AND
        (c.email=$2 OR lower(c.username)=$2 OR lower(c.client_code)=$2) FOR UPDATE OF c`, [tenant.id, input.email])).rows[0] as (CustomerIdentity & { password_hash: string; enabled: boolean }) | undefined;
    const valid = await verifyPassword(input.password, row?.password_hash || dummyHash);
    if (!row || !valid || !row.enabled) throw new HttpError(401, 'Invalid email or password.');
    const token = await createCustomerSession(db, tenant, row, sessionHash);
    const changed = await db.query(`UPDATE public_customer_accounts SET last_login_at=now()
      WHERE subscriber_id=$1 AND id=$2 RETURNING last_login_at AS "lastLoginAt"`,[tenant.id,row.id]);
    row.lastLoginAt = changed.rows[0]?.lastLoginAt ?? row.lastLoginAt;
    await db.query(`INSERT INTO public_customer_activity(id,subscriber_id,customer_id,action) VALUES($1,$2,$3,'login')`,
      [randomUUID(),tenant.id,row.id]);
    return { token, customer: await effectiveCustomerProfile(row,db), next: customerLinks(tenant.slug, tenant.customRoot).accountHref };
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
