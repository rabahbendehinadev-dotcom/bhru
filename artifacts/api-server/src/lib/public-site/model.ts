/** Public rendering contract. No account IDs, sessions or licence fields. */
export interface PublicSiteNames { businessName: string; companyName: string }
export interface PublicLink { label: string; href: string }
export interface PublicService {
  title: string;
  description: string;
  icon: 'device' | 'server' | 'support';
  state: 'placeholder' | 'published';
  href: string | null;
}
export interface PublicSiteModel extends PublicSiteNames {
  siteName: string;
  logo: string | null;
  heroTitle: string;
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
    customerAccessTitle: string;
    customerAccessDescription: string;
  };
  footer: { description: string; links: PublicLink[]; copyrightYear: number };
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
    heroTitle: 'Your next service starts here.',
    heroDescription: `Welcome to ${siteName}. Explore this website for service information as it becomes available.`,
    primaryCTA: { label: 'Explore services', href: '#services' },
    secondaryCTA: { label: 'Discover more', href: '#about' },
    theme: { accent: '#bbf451', ink: '#17251e', background: '#f7f9f6' },
    navigation,
    services: [
      { title: 'Service information', description: 'Published service descriptions will appear here.', icon: 'device', state: 'placeholder', href: null },
      { title: 'Availability & details', description: 'Availability, requirements and service details are not published yet.', icon: 'server', state: 'placeholder', href: null },
      { title: 'Getting started', description: 'Ordering guidance will appear when customer services are connected.', icon: 'support', state: 'placeholder', href: null },
    ],
    sections: {
      servicesTitle: 'Find your next service.',
      servicesDescription: 'This space is ready for the service catalogue. Listings have not been published yet.',
      whyTitle: 'A clearer way to explore.',
      whyDescription: 'One place for service information, requirements and the next steps.',
      reasons: [
        { title: 'Details in one place', description: 'Service descriptions and requirements will be presented together when published.' },
        { title: 'Know what comes next', description: 'Clear guidance will help you understand the next steps before getting started.' },
        { title: 'Easy to explore', description: 'Browse this website comfortably from your phone, tablet or desktop.' },
      ],
      statistics: [
        { value: '—', label: 'Published services', note: 'Catalogue coming soon' },
        { value: '—', label: 'Service statistics', note: 'No statistics published yet' },
        { value: '—', label: 'Customer feedback', note: 'No feedback published yet' },
      ],
      ctaTitle: 'Discover what comes next.',
      ctaDescription: 'Explore the service area. Contact information and customer access will appear here when published.',
      customerAccessTitle: 'Customer access is coming soon.',
      customerAccessDescription: 'Customer login is not connected yet. This public website is separate from the business owner’s Subscriber Panel.',
    },
    footer: {
      description: `The public website of ${identity.businessName || siteName}.`,
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
