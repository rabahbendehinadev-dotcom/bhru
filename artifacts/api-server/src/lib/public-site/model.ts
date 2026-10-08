import type { PublicStripSettings, PublicTickerSettings } from '@workspace/api-zod';
/** Public rendering contract. No account IDs, sessions or licence fields. */
export interface PublicSiteNames { businessName: string; companyName: string }
export interface PublicLink { label: string; href: string }
/** Visitor-specific customer navigation; never contains tenant/account IDs or tokens. */
export interface PublicCustomerAccess {
  homeHref: string;
  loginHref: string;
  registerHref: string;
  accountHref: string;
  apiBase: string;
  authenticated: boolean;
  firstName?: string;
}
export interface PublicService {
  title: string;
  description: string;
  icon: 'device' | 'server' | 'support';
  state: 'placeholder' | 'published';
  href: string | null;
  image?: string | null;
  category?: string;
  statusLabel?: string;
  ctaLabel?: string;
}
export interface PublicSiteModel extends PublicSiteNames {
  customerAccess?: PublicCustomerAccess;
  presentation?: {
    logoSettings?: PublicStripSettings;
    tickerSettings?: PublicTickerSettings;
    logos: {src:string;label:string;href:string;newTab:boolean;width?:number;height?:number}[];
    announcements: {text:string;icon?:string;href:string;background:string;color:string;movement:'static'|'scrolling';direction:'left'|'right';speed:'slow'|'normal'|'fast'}[];
    customHTML:string;
    heroMode:'classic'|'banner';
    banners: {src:string;alt:string;href:string;width?:number;height?:number}[];
    autoplay:boolean;interval:number;
  };
  siteName: string;
  logo: string | null;
  heroTitle: string;
  heroBadge?: string;
  heroDescription: string;
  heroImage: string | null;
  primaryCTA: PublicLink;
  secondaryCTA: PublicLink;
  theme: { accent: string; ink: string; background: string };
  navigation: PublicLink[];
  services: PublicService[];
  sections: {
    servicesTitle: string;
    servicesDescription: string;
    whyTitle: string;
    whyDescription: string;
    reasons: { title: string; description: string }[];
    statistics: { value: string; label: string; note: string }[];
    ctaTitle: string;
    ctaDescription: string;
    cta?: PublicLink;
    customerAccessTitle: string;
    customerAccessDescription: string;
  };
  footer: {
    description: string; links: PublicLink[]; copyrightYear: number;
    serviceLinks?: PublicLink[];
    contact?: { label: string; value: string; href?: string }[];
    socialLinks?: PublicLink[];
  };
}

/** Generic, truthful defaults; no subscriber-specific demo catalogue or metrics. */
export function normalizePublicSite(identity: PublicSiteNames): PublicSiteModel {
  const siteName = identity.companyName || identity.businessName || 'Public website';
  const navigation = [
    { label: 'Home', href: '#home' }, { label: 'Services', href: '#services' },
    { label: 'About', href: '#about' }, { label: 'Contact', href: '#contact' },
  ];
  return {
    businessName: identity.businessName, companyName: identity.companyName,
    siteName, logo: null, heroImage: null,
    heroTitle: 'Your next phone service starts here.',
    heroDescription: `Welcome to ${siteName}. Explore our service catalogue and find the information you need for your device.`,
    primaryCTA: { label: 'Explore Services', href: '#services' },
    secondaryCTA: { label: 'Learn More', href: '#about' },
    theme: { accent: '#2563eb', ink: '#152238', background: '#f7f9fc' },
    navigation,
    services: [
      { title: 'Service catalogue', description: 'Service listings will appear here when available.', icon: 'device', state: 'placeholder', href: null },
      { title: 'Service details', description: 'Explore requirements and availability when services are listed.', icon: 'server', state: 'placeholder', href: null },
      { title: 'Customer services', description: 'Discover the next steps for your device when available.', icon: 'support', state: 'placeholder', href: null },
    ],
    sections: {
      servicesTitle: 'Explore our services.',
      servicesDescription: 'Find service information, availability and next steps in one place.',
      whyTitle: 'Why choose us',
      whyDescription: '',
      reasons: [],
      statistics: [],
      ctaTitle: 'Find the right service for your device.',
      ctaDescription: 'Start with the service catalogue and explore your options.',
      customerAccessTitle: 'Customer access coming soon',
      customerAccessDescription: 'Customer login is not available yet. Please check back soon.',
    },
    footer: {
      description: `Service information from ${identity.businessName || siteName}.`,
      links: [...navigation.filter(link => link.href !== '#home'), { label: 'Customer access', href: '#customer-access' }],
      copyrightYear: new Date().getUTCFullYear(),
    },
  };
}

/** Future page-path convention only; Phase 2 does not serve these subpages yet. */
export function publicPagePath(slug: string, page: 'home' | 'services' | 'about' | 'contact' = 'home'): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 63 || slug.trim() !== slug) {
    throw new Error('Invalid canonical public slug');
  }
  return `/${slug}${page === 'home' ? '' : `/${page}`}`;
}
