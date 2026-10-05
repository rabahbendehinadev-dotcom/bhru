import type { ReactNode } from 'react';
import {
  LayoutDashboard, Users, Boxes, ShoppingCart, ShoppingBag, Package, Newspaper, BarChart3, Wrench, LifeBuoy,
  MessageCircle, Settings, Store, HelpCircle, UserCheck,
} from 'lucide-react';

export interface CatalogItem { label: string; desc: string; href?: string }
export interface CatalogEntry { label: string; href: string; icon: ReactNode; items: CatalogItem[] }

export const slugify = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const itemHref = (it: CatalogItem) => it.href ?? `/m/${slugify(it.label)}`;
const s = 16;
const e = (label: string, icon: ReactNode, items: CatalogItem[], href?: string): CatalogEntry => ({ label, icon, items, href: href ?? `/m/${slugify(label)}` });

export const CATALOG: CatalogEntry[] = [
  e('Dashboard', <LayoutDashboard size={s} />, [
    { label: 'Dashboard', desc: 'Main overview', href: '/' },
    { label: 'System Summary', desc: 'Server statistics' },
    { label: 'Credit Summary', desc: 'Account balance' },
    { label: 'Pending Collections', desc: 'Unpaid invoices' },
    { label: 'Income Summary', desc: 'Revenue overview' },
    { label: 'Login Log', desc: 'Login history' },
    { label: 'Customer Reviews', desc: 'Reviews and feedback' },
    { label: 'Users Waiting For Activation', desc: 'Pending activations' },
    { label: 'Find Discounted Users', desc: 'Discounted accounts' },
    { label: 'IP Search', desc: 'Search by IP' },
    { label: 'Price Check', desc: 'Check service price' },
    { label: 'API Status', desc: 'Supplier API status' },
  ], '/'),
  e('Clients / Suppliers', <Users size={s} />, [
    { label: 'Customers', desc: 'All customer accounts' },
    { label: 'Customer Groups', desc: 'Group and discount tiers' },
    { label: 'Suppliers / APIs', desc: 'Supplier connections' },
    { label: 'Credit Requests', desc: 'Balance top-ups' },
  ]),
  e('Products / Services', <Boxes size={s} />, [
    { label: 'Services', desc: 'Manage service catalogue' },
    { label: 'Categories', desc: 'Organise services' },
    { label: 'Pricing', desc: 'Base prices' },
    { label: 'Group Pricing', desc: 'Prices per group' },
    { label: 'Sync Services', desc: 'Import from suppliers' },
  ]),
  e('Orders', <ShoppingCart size={s} />, [
    { label: 'All Orders', desc: 'Every incoming order' },
    { label: 'IMEI Orders', desc: 'Unlock by IMEI' },
    { label: 'Server Orders', desc: 'Server services' },
    { label: 'Remote Orders', desc: 'Remote services' },
    { label: 'Order History', desc: 'Completed and closed' },
  ]),
  e('Retail Orders (Cart)', <ShoppingBag size={s} />, [
    { label: 'Retail Orders', desc: 'Storefront cart orders' },
    { label: 'Retail Payments', desc: 'Payment confirmations' },
  ]),
  e('Inventory', <Package size={s} />, [
    { label: 'Stock Items', desc: 'Available stock' },
    { label: 'Credits Stock', desc: 'Supplier credit stock' },
  ]),
  e('CMS / Blog', <Newspaper size={s} />, [
    { label: 'Pages', desc: 'Static pages' },
    { label: 'Blog Posts', desc: 'News and articles' },
    { label: 'Announcements', desc: 'Notices to customers' },
  ]),
  e('Reports / Graphs', <BarChart3 size={s} />, [
    { label: 'Reports / Graphs', desc: 'Overview reports' },
    { label: 'Transactions', desc: 'Money movements' },
    { label: 'Profit / Margin', desc: 'Margins per service' },
  ]),
  e('Utilities', <Wrench size={s} />, [
    { label: 'IMEI Checker', desc: 'Validate an IMEI' },
    { label: 'Logs / Activity', desc: 'System activity' },
    { label: 'Bulk Tools', desc: 'Batch operations' },
  ]),
  e('Support', <LifeBuoy size={s} />, [
    { label: 'Support Tickets', desc: 'Customer requests' },
    { label: 'Canned Replies', desc: 'Saved answers' },
  ]),
  e('Online Users / Live Chat', <MessageCircle size={s} />, [
    { label: 'Online Users', desc: 'Who is connected' },
    { label: 'Live Chat', desc: 'Talk to customers' },
  ]),
  e('Settings', <Settings size={s} />, [
    { label: 'Settings', desc: 'Business and account', href: '/settings' },
    { label: 'Users / Staff', desc: 'Team access' },
    { label: 'Payment Methods', desc: 'Accepted payments' },
    { label: 'Notifications', desc: 'Alerts and emails' },
  ], '/settings'),
  e('Store', <Store size={s} />, [
    { label: 'Reseller Store', desc: 'Available modules' },
    { label: 'Store Appearance', desc: 'Branding and layout' },
  ]),
  e('Help', <HelpCircle size={s} />, [
    { label: 'Help', desc: 'Guides and answers' },
    { label: 'Contact BHRU', desc: 'Reach the platform team' },
  ]),
  e('Online Staff', <UserCheck size={s} />, [
    { label: 'Staff Online', desc: 'Team members connected' },
    { label: 'Staff Activity', desc: 'Recent staff actions' },
  ]),
];

/** slug -> label for every deferred destination, merged into MODULES by shells.tsx */
export const CATALOG_LABELS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  CATALOG.forEach((c) => {
    if (c.href.startsWith('/m/')) out[slugify(c.label)] = c.label;
    c.items.forEach((it) => { if (!it.href) out[slugify(it.label)] = it.label; });
  });
  return out;
})();
