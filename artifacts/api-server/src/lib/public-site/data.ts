import { normalizePublicSite, type PublicSiteModel, type PublicSiteNames } from './model';

/** Internal server context. Never serialize this object into a public response. */
export interface ResolvedPublicSubscriber extends PublicSiteNames {
  subscriberId: string;
}

export function loadSubscriberPublicSiteData(resolved: ResolvedPublicSubscriber): PublicSiteModel {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(resolved.subscriberId)) {
    throw new Error('Invalid resolved subscriber');
  }
  // Current public identity was loaded atomically by the resolver:
  // g.subscriber_id=s.id, WHERE s.public_slug=$1, with existing eligibility.
  // Future CMS reads must bind resolved.subscriberId in WHERE subscriber_id=$1.
  // No session or client-supplied ownership is accepted by this loader.
  return normalizePublicSite({
    businessName: resolved.businessName, companyName: resolved.companyName,
  });
}
