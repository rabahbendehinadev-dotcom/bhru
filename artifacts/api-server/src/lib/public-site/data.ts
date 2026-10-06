import { normalizePublicSite, type PublicSiteModel, type PublicSiteNames } from './model';
import { pool, type PoolClient } from '@workspace/db';
import { configuredPublicModel, rowWebsiteValues, ownedImages } from './configuration';

/** Internal server context. Never serialize this object into a public response. */
export interface ResolvedPublicSubscriber extends PublicSiteNames {
  subscriberId: string;
}

export async function loadSubscriberPublicSiteData(resolved: ResolvedPublicSubscriber, database: Pick<PoolClient,'query'> = pool): Promise<PublicSiteModel> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(resolved.subscriberId)) {
    throw new Error('Invalid resolved subscriber');
  }
  // Current public identity was loaded atomically by the resolver:
  // g.subscriber_id=s.id, WHERE s.public_slug=$1, with existing eligibility.
  // Future CMS reads must bind resolved.subscriberId in WHERE subscriber_id=$1.
  // No session or client-supplied ownership is accepted by this loader.
  const names = {
    businessName: resolved.businessName, companyName: resolved.companyName,
  };
  const row = (await database.query('SELECT * FROM subscriber_public_sites WHERE subscriber_id=$1', [resolved.subscriberId])).rows[0];
  if (!row) return normalizePublicSite(names);
  const values = rowWebsiteValues(row);
  return configuredPublicModel(names, values, await ownedImages(resolved.subscriberId, values, database));
}
