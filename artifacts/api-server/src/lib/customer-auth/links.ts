import type { Request } from 'express';
import type { PublicCustomerAccess, PublicSiteModel } from '../public-site/model';

export function customerLinks(slug: string, customRoot = false, firstName?: string): PublicCustomerAccess {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 63) throw new Error('Invalid customer site slug');
  const base = customRoot ? '' : `/${slug}`;
  return {
    homeHref: customRoot ? '/' : base,
    loginHref: `${base}/customer/login`,
    registerHref: `${base}/customer/register`,
    accountHref: `${base}/customer/dashboard`,
    apiBase: `/api/public/customer/${slug}`,
    authenticated: firstName !== undefined,
    ...(firstName !== undefined ? { firstName } : {}),
  };
}
export function withCustomerAccess(model: PublicSiteModel, access: PublicCustomerAccess): PublicSiteModel {
  const href = (value: string) => value === '#customer-access' ? (access.authenticated ? access.accountHref : access.loginHref) : value;
  return {
    ...model, customerAccess: access,
    navigation: model.navigation.map(link => ({ ...link, href: href(link.href) })),
    primaryCTA: { ...model.primaryCTA, href: href(model.primaryCTA.href) },
    secondaryCTA: { ...model.secondaryCTA, href: href(model.secondaryCTA.href) },
    footer: { ...model.footer, links: model.footer.links.map(link => ({ ...link, href: href(link.href) })) },
  };
}
export function withRequestCustomer(model: PublicSiteModel, req: Request): PublicSiteModel {
  const context = req.customerPublic;
  return context ? withCustomerAccess(model, customerLinks(context.tenant.slug, context.tenant.customRoot, context.customer?.firstName)) : model;
}
