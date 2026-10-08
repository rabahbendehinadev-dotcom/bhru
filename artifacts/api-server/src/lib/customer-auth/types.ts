import type { PoolClient } from '@workspace/db';
import type { PublicSiteModel } from '../public-site/model';

export type CustomerDB = Pick<PoolClient, 'query'>;
export interface CustomerProfile {
  firstName: string;
  lastName: string;
  email: string;
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
  return { firstName: customer.firstName, lastName: customer.lastName, email: customer.email };
}
