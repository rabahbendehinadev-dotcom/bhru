import { type ReactNode, useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard, ShoppingCart, Smartphone, Server, Monitor, ShoppingBag, History, Users, UsersRound, Plug, Boxes, Tags, BadgeDollarSign,
  Layers, Package, BarChart3, Receipt, TrendingUp, LifeBuoy, Megaphone, UserCog, Settings, ScrollText, HelpCircle, Menu, Search, Bell,
  Clock, LogOut, ShieldCheck, KeyRound, Zap, CreditCard, ListChecks, Eye, ArrowLeftRight, ChevronDown, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo, Btn, Badge } from './ui';
import { accessCheck, logout, previewAs, returnToAdmin, useStore, fmtDate, fmtTime, verifyPanelAccess, refreshState, errorMessage } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import AccountStatus from '@/pages/account-status';
import { useAdminPath } from '@/lib/admin-entry';

export const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  return now;
}

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
// extra quick-action modules
['Add Customer', 'Manage Services', 'Manage APIs', 'Sync Services'].forEach((l) => { MODULES[l.toLowerCase().replace(/[^a-z0-9]+/g, '-')] = l; });

const ADMIN_NAV = (base: string): NavGroup[] => [
  { items: [{ label: 'Dashboard', href: base, icon: <LayoutDashboard size={i} /> }] },
  { title: 'SUBSCRIPTIONS', items: [
    { label: 'Subscribers', href: `${base}/subscribers`, icon: <Users size={i} /> },
    { label: 'Plans', href: `${base}/plans`, icon: <CreditCard size={i} /> },
    { label: 'Licences', href: `${base}/licences`, icon: <KeyRound size={i} /> },
    { label: 'Activations', href: `${base}/activations`, icon: <Zap size={i} /> },
  ] },
  { title: 'PLATFORM', items: [
    { label: 'Admin Users', href: `${base}/users`, icon: <ShieldCheck size={i} /> },
    { label: 'Activity Logs', href: `${base}/logs`, icon: <ListChecks size={i} /> },
    { label: 'Platform Settings', href: `${base}/settings`, icon: <Settings size={i} /> },
  ] },
];

function Sidebar({ groups, logoSub, open, onClose, footer }: { groups: NavGroup[]; logoSub: string; open: boolean; onClose: () => void; footer?: ReactNode }) {
  const [loc] = useLocation();
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={onClose} />}
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[212px] flex-col border-r bg-sidebar transition-transform lg:static lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-14 items-center justify-between px-4"><Logo sub={logoSub} /><button className="lg:hidden" onClick={onClose} aria-label="Close menu"><X size={16} /></button></div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-2.5 pb-3">
          {groups.map((g, gi) => (
            <div key={gi} className="mb-2">
              {g.title && <div className="px-2 pb-1 pt-2 text-[10px] font-semibold tracking-wider text-muted-foreground">{g.title}</div>}
              {g.items.map((it) => {
                const active = it.label === 'Dashboard' ? loc === it.href || (it.href === '/' && loc === '/dashboard') : loc.startsWith(it.href);
                return (
                  <Link key={it.href} href={it.href} onClick={onClose} data-testid={`nav-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    className={cn('mb-px flex items-center gap-2.5 rounded-md px-2.5 py-[6px] text-[12.5px] transition-colors', active ? 'bg-primary text-white' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground')}>
                    {it.icon}<span>{it.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {footer}
      </aside>
    </>
  );
}

function AccessBar({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 border-b border-violet/30 bg-violet/10 px-4 py-1 text-[11.5px]">
      <span className="flex items-center gap-2"><Badge tone="violet">BHRU</Badge><span className="text-muted-foreground">Platform administration</span></span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}

function Header({ onMenu, name, role, chip, right }: { onMenu: () => void; name: string; role: string; chip?: ReactNode; right?: ReactNode }) {
  const st = useStore();
  const adminPath = useAdminPath();
  const now = useClock();
  const [, nav] = useLocation();
  const { toast } = useToast();
  return (
    <header className="flex h-14 items-center gap-3 border-b bg-background px-4">
      <button className="btn h-8 w-8 px-0" onClick={onMenu} aria-label="Menu" data-testid="button-menu"><Menu size={16} /></button>
      {chip}
      <div className="relative hidden max-w-[360px] flex-1 md:block">
        <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
        <input className="input pl-8" placeholder="Search (not enabled yet)" aria-label="Search" disabled />
        <span className="absolute right-2 top-2 rounded border px-1 text-[10px] text-muted-foreground">Ctrl + K</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-md border px-2.5 py-1 lg:flex">
          <Clock size={14} className="text-muted-foreground" />
          <div className="text-[10.5px] leading-tight text-muted-foreground">Server Time<div className="font-medium text-foreground">{fmtDate(now.toISOString())} - {fmtTime(now.toISOString())}</div></div>
        </div>
        <button className="btn relative h-8 w-8 px-0" aria-label="Notifications"><Bell size={15} /></button>
        {right}
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-violet/70 text-[11px] font-bold">{initials(name)}</div>
          <div className="hidden text-[12px] leading-tight sm:block"><div className="font-semibold">{name}</div><div className="text-[10.5px] text-muted-foreground">{role}</div></div>
          <button className="btn btn-sm" onClick={async () => { try { await logout(); nav(st.session.role === 'admin' ? adminPath : '/login'); } catch (e) { toast({ title: 'Sign out failed', description: errorMessage(e), variant: 'destructive' }); } }} data-testid="button-signout"><LogOut size={13} /> <span className="hidden md:inline">Sign out</span></button>
        </div>
      </div>
    </header>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const adminPath = useAdminPath();
  const st = useStore();
  const [, nav] = useLocation();
  const [open, setOpen] = useState(false);
  const ok = st.session.role === 'admin';
  useEffect(() => { if (!ok) nav(st.session.role ? '/' : adminPath || '/login'); }, [ok, nav, st.session.role, adminPath]);
  if (!ok) return null;
  const firstActive = st.subscribers.find((s) => s.status === 'ACTIVE');
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AccessBar>
        <Btn sm v="primary" disabled={!st.subscribers.length} data-testid="button-preview-subscriber" onClick={() => { const selected = firstActive || st.subscribers[0]; if (selected) { previewAs(selected.id); nav('/'); } }}><Eye size={12} /> Preview as subscriber</Btn>
      </AccessBar>
      <div className="flex flex-1">
        <Sidebar groups={ADMIN_NAV(adminPath)} logoSub="SaaS Management" open={open} onClose={() => setOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onMenu={() => setOpen((o) => !o)} name={st.session.name} role="Platform Admin" />
          <main className="min-w-0 flex-1 p-4">{children}</main>
        </div>
      </div>
    </div>
  );
}

export function SubscriberShell({ children }: { children: ReactNode }) {
  const adminPath = useAdminPath();
  const st = useStore();
  const [, nav] = useLocation();
  const [open, setOpen] = useState(false);
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
  if (checked !== sub.id) return <div className="grid min-h-screen place-items-center text-muted-foreground">{gateError || 'Checking panel access...'}</div>;
  return (
    <div className="flex min-h-[100dvh] flex-col">
      {preview && <AccessBar>
        {preview ? (
          <>
            <span className="text-muted-foreground">Previewing as subscriber</span>
            <Btn sm v="warn" data-testid="button-return-admin" onClick={() => { returnToAdmin(); nav(`${adminPath}/subscribers`); }}><ArrowLeftRight size={12} /> Return to admin</Btn>
          </>
        ) : null}
      </AccessBar>}
      <div className="flex flex-1">
        <Sidebar groups={SUB_NAV} logoSub="Unlock Server Panel" open={open} onClose={() => setOpen(false)}
          footer={<div className="m-2.5 flex items-center gap-2 rounded-md bg-sidebar-accent px-2.5 py-2 text-[12px]"><span className="h-2 w-2 rounded-full bg-muted" />Online Staff<span className="ml-auto rounded bg-muted px-1.5 text-[10px] font-bold">0</span></div>} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header onMenu={() => setOpen((o) => !o)} name={sub.owner} role="Owner"
            chip={<div className="hidden items-center gap-2 rounded-md border bg-card px-2.5 py-1 md:flex" data-testid="text-business-name"><span className="text-[10px] text-muted-foreground">Server</span><span className="text-[12.5px] font-semibold">{sub.business}</span><ChevronDown size={12} className="text-muted-foreground" /></div>}
             />
          <main className="min-w-0 flex-1 p-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
