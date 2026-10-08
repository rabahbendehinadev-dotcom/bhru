import type { PoolClient } from '@workspace/db';
import type { PublicSiteModel } from '../public-site/model';

export type CustomerDB = Pick<PoolClient, 'query'>;
export interface CustomerProfile {
  firstName: string;
  lastName: string;
  email: string;
  clientCode?: string | null;
  username?: string | null;
  whatsappPhone?: string | null;
  preferredLanguage?: string | null;
  preferredCurrency?: string | null;
  effectiveCurrency?: string | null;
  newsletterOptIn?: boolean;
  addressLine1?: string | null;
  addressLine2?: string | null;
  countryCode?: string | null;
  state?: string | null;
  city?: string | null;
  postalCode?: string | null;
  createdAt?: string | Date | null;
  lastLoginAt?: string | Date | null;
  termsAcceptedAt?: string | Date | null;
}
/** Internal only. Never serialize customer or subscriber IDs into public HTML. */
export interface CustomerIdentity extends CustomerProfile {
  id: string;
  subscriber_id: string;
}
export interface CustomerTenant {
  id: string;
  slug: string;
  customRoot: boolean;
  model: PublicSiteModel;
}
export interface CustomerContext {
  tenant: CustomerTenant;
  customer: CustomerIdentity | null;
  sessionHash?: string;
}
declare global {
  namespace Express {
    interface Request { customerPublic?: CustomerContext }
  }
}
export function customerProfile(customer: CustomerIdentity): CustomerProfile {
  const { id: _id, subscriber_id: _subscriber, ...profile } = customer;
  // Explicit allowlist; SQL rows may also contain a password hash or enabled flag.
  return Object.fromEntries(['firstName','lastName','email','clientCode','username','whatsappPhone',
    'preferredLanguage','preferredCurrency','newsletterOptIn','addressLine1','addressLine2','countryCode',
    'state','city','postalCode','createdAt','lastLoginAt','termsAcceptedAt'].map(key =>
      [key, (profile as unknown as Record<string, unknown>)[key] ?? (key === 'newsletterOptIn' ? false : null)])) as unknown as CustomerProfile;
}
