import type { ReactNode } from 'react';
import {
  LayoutDashboard, Users, Boxes, ShoppingCart, ShoppingBag, Package, Newspaper, BarChart3, Wrench, LifeBuoy,
  MessageCircle, Settings, Store, HelpCircle, UserCheck,
} from 'lucide-react';
import { NAV_DATA, type NavColumn } from './nav-data';

export interface NavChild { id: string; label: string; href: string; group?: string; column?: NavColumn; parentId: string }
export interface NavEntry { id: string; label: string; href: string; icon: ReactNode; items: NavChild[]; badge?: 'online-staff' }

export const slugify = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const s = 16;
const ICONS: Record<string, ReactNode> = {
  dashboard: <LayoutDashboard size={s} />, 'clients-suppliers': <Users size={s} />, 'products-services': <Boxes size={s} />,
  orders: <ShoppingCart size={s} />, 'retail-orders-cart': <ShoppingBag size={s} />, inventory: <Package size={s} />,
  'cms-blog': <Newspaper size={s} />, 'reports-graphs': <BarChart3 size={s} />, utilities: <Wrench size={s} />,
  support: <LifeBuoy size={s} />, 'online-user-live-chat': <MessageCircle size={s} />, settings: <Settings size={s} />,
  store: <Store size={s} />, help: <HelpCircle size={s} />, 'online-staff': <UserCheck size={s} />,
};

/** Central nav config: single source for sidebar, flyouts, drawer, search, titles, breadcrumbs and route resolution. */
export const NAV: NavEntry[] = NAV_DATA.map((e) => ({
  id: e.id, label: e.label, badge: e.badge, icon: ICONS[e.id],
  href: e.href ?? `/m/${e.slug ?? e.id}`,
  items: e.children.map((c) => {
    const slug = c.slug ?? slugify(c.label);
    return { id: `${e.id}.${slug}`, label: c.label, group: c.group, column: c.column, parentId: e.id, href: c.href ?? `/m/${slug}` };
  }),
}));

/** Back-compat alias for older imports. */
export const CATALOG = NAV;
export type CatalogEntry = NavEntry;

export const hasFlyout = (e: NavEntry) => e.items.length > 0;
export const isTwoColumn = (e: NavEntry) => e.items.some((i) => i.column === 2);

export interface ResolvedRoute { slug: string; entry: NavEntry; child?: NavChild; title: string; crumbs: string[] }

/** slug -> resolved destination for every /m/:slug route. Collisions must never silently replace pages. */
export const ROUTES: Map<string, ResolvedRoute> = (() => {
  const m = new Map<string, ResolvedRoute>();
  const add = (href: string, r: Omit<ResolvedRoute, 'slug'>) => {
    if (!href.startsWith('/m/')) return;
    const slug = href.slice(3);
    if (m.has(slug)) throw new Error(`[nav] duplicate route /m/${slug}`);
    m.set(slug, { slug, ...r });
  };
  NAV.forEach((entry) => {
    add(entry.href, { entry, title: entry.label, crumbs: ['Dashboard', entry.label] });
    entry.items.forEach((child) => add(child.href, {
      entry, child, title: child.label, crumbs: ['Dashboard', entry.label, ...(child.group ? [child.group] : []), child.label],
    }));
  });
  return m;
})();

export const resolveSlug = (slug: string) => ROUTES.get(slug);

/** Title for a location (mobile header). */
export function titleForLocation(loc: string): string {
  if (loc === '/' || loc === '/dashboard') return 'Dashboard';
  if (loc === '/settings') return 'Settings';
  return loc.startsWith('/m/') ? ROUTES.get(loc.slice(3))?.title ?? '' : '';
}

export function entryIsActive(e: NavEntry, loc: string) {
  if (e.href === '/') return loc === '/' || loc === '/dashboard' || e.items.some((i) => i.href !== '/' && i.href === loc);
  if (e.id === 'settings' && loc === '/settings') return true;
  return loc === e.href || e.items.some((i) => i.href === loc);
}

export interface SearchItem { id: string; label: string; context: string; href: string }
export const SEARCH_INDEX: SearchItem[] = NAV.flatMap((e) => [
  { id: e.id, label: e.label, context: 'Main menu', href: e.href },
  ...e.items.filter((i) => !(e.id === 'dashboard' && i.href === '/')).map((i) => ({ id: i.id, label: i.label, context: i.group ? `${e.label} › ${i.group}` : e.label, href: i.href })),
]);

/** Split items into explicit columns (or one column) preserving per-column order. */
export const columnsOf = (e: NavEntry): NavChild[][] =>
  isTwoColumn(e) ? [e.items.filter((i) => i.column !== 2), e.items.filter((i) => i.column === 2)] : [e.items];

/** slug -> label for every /m/ destination; consumed by shared shells (legacy MODULES merge). */
export const CATALOG_LABELS: Record<string, string> = Object.fromEntries(Array.from(ROUTES.values()).map((r) => [r.slug, r.title]));

/** Desktop hover navigation is only for wide, fine-pointer devices. */
export const DESKTOP_NAV_QUERY = '(min-width: 1024px) and (hover: hover) and (pointer: fine)';
export const isDesktopNav = () => window.matchMedia(DESKTOP_NAV_QUERY).matches;
