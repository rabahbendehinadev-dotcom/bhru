import { type ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import {
  LayoutDashboard, ShoppingCart, Smartphone, Server, Monitor, ShoppingBag, History, Users, UsersRound, Plug, Boxes, Tags, BadgeDollarSign,
  Layers, Package, BarChart3, Receipt, TrendingUp, LifeBuoy, Megaphone, UserCog, Settings, ScrollText, HelpCircle, ArrowLeftRight,
} from 'lucide-react';
import { Btn, Badge } from './ui';
import { accessCheck, returnToAdmin, useStore, verifyPanelAccess, refreshState, errorMessage } from '@/lib/store';
import AccountStatus from '@/pages/account-status';
import { useAdminPath } from '@/lib/admin-entry';
export { AdminShell } from '@/components/platform-admin/AdminShell';
import { SubscriberLayout } from '@/components/subscriber/SubscriberLayout';
import { SubscriberThemeProvider } from '@/components/subscriber/theme';
import { CATALOG_LABELS } from '@/components/subscriber/nav-catalog';

export const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

interface NavItem { label: string; href: string; icon: ReactNode }
interface NavGroup { title?: string; items: NavItem[] }
const i = 15;
export const MODULES: Record<string, string> = {};
const mod = (label: string, icon: ReactNode): NavItem => {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  MODULES[slug] = label;
  return { label, href: `/m/${slug}`, icon };
};
const SUB_NAV: NavGroup[] = [
  { items: [{ label: 'Dashboard', href: '/', icon: <LayoutDashboard size={i} /> }] },
  { title: 'ORDERS', items: [mod('Orders', <ShoppingCart size={i} />), mod('IMEI Orders', <Smartphone size={i} />), mod('Server Orders', <Server size={i} />), mod('Remote Orders', <Monitor size={i} />), mod('Retail Orders', <ShoppingBag size={i} />), mod('Order History', <History size={i} />)] },
  { title: 'MANAGEMENT', items: [mod('Customers', <Users size={i} />), mod('Customer Groups', <UsersRound size={i} />), mod('Suppliers / APIs', <Plug size={i} />), mod('Services', <Boxes size={i} />), mod('Categories', <Layers size={i} />), mod('Pricing', <Tags size={i} />), mod('Group Pricing', <BadgeDollarSign size={i} />), mod('Inventory', <Package size={i} />)] },
  { title: 'REPORTS', items: [mod('Reports / Graphs', <BarChart3 size={i} />), mod('Transactions', <Receipt size={i} />), mod('Profit / Margin', <TrendingUp size={i} />)] },
  { title: 'COMMUNICATION', items: [mod('Support Tickets', <LifeBuoy size={i} />), mod('Announcements', <Megaphone size={i} />)] },
  { title: 'SYSTEM', items: [mod('Users / Staff', <UserCog size={i} />), { label: 'Settings', href: '/settings', icon: <Settings size={i} /> }, mod('Logs / Activity', <ScrollText size={i} />), mod('Help', <HelpCircle size={i} />)] },
];
// Deferred labels from the subscriber catalog (old names/slugs kept)
Object.entries(CATALOG_LABELS).forEach(([k, v]) => { if (!(k in MODULES)) MODULES[k] = v; });
/** Legacy subscriber nav, retained only so existing module slugs stay registered. */
export const LEGACY_SUB_NAV = SUB_NAV;
// extra quick-action modules
['Add Customer', 'Manage Services', 'Manage APIs', 'Sync Services'].forEach((l) => { MODULES[l.toLowerCase().replace(/[^a-z0-9]+/g, '-')] = l; });

function AccessBar({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 border-b border-violet/30 bg-violet/10 px-4 py-1 text-[11.5px]">
      <span className="flex items-center gap-2"><Badge tone="violet">BHRU</Badge><span className="text-muted-foreground">Platform administration</span></span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}


export function SubscriberShell({ children }: { children: ReactNode }) {
  const adminPath = useAdminPath();
  const st = useStore();
  const [, nav] = useLocation();
  const [checked, setChecked] = useState<string | null>(null);
  const [gateError, setGateError] = useState('');
  const { role, subscriberId } = st.session;
  const sub = st.subscribers.find((s) => s.id === subscriberId);
  useEffect(() => {
    let cancelled = false;
    setChecked(null); setGateError('');
    if (sub?.allowed) verifyPanelAccess(sub.id).then(() => {
      if (!cancelled) setChecked(sub.id);
    }).catch(error => { if (!cancelled) { setGateError(errorMessage(error)); void refreshState(); } });
    return () => { cancelled = true; };
  }, [sub?.id, sub?.allowed, sub?.status, sub?.expiresAt]);
  const redirect = !role ? '/login' : role === 'admin' && !subscriberId ? adminPath : !sub ? '/login' : null;
  useEffect(() => { if (redirect) nav(redirect); }, [redirect, nav]);
  if (redirect || !sub) return null;
  const preview = role === 'admin';
  const access = accessCheck(sub);
  if (!access.allowed) return <AccountStatus sub={sub} preview={preview} />;
  if (checked !== sub.id) return (
    <SubscriberThemeProvider subscriberId={sub.id}>
      {theme => <div className="sub-layout grid min-h-screen place-items-center text-muted-foreground" data-theme={theme}>{gateError || 'Checking panel access...'}</div>}
    </SubscriberThemeProvider>
  );
  return (
    <SubscriberLayout subscriberId={sub.id} business={sub.business} owner={sub.owner}
      banner={preview ? (
        <AccessBar>
          <span className="text-muted-foreground">Previewing as subscriber</span>
          <Btn sm v="warn" data-testid="button-return-admin" onClick={() => { returnToAdmin(); nav(`${adminPath}/subscribers`); }}><ArrowLeftRight size={12} /> Return to admin</Btn>
        </AccessBar>
      ) : undefined}>
      {children}
    </SubscriberLayout>
  );
}
