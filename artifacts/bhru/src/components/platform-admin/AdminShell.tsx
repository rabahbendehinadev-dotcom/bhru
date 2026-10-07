import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import {
  LayoutDashboard, Users, Zap, CreditCard, KeyRound, Puzzle, ShieldCheck, ListChecks, Settings, Menu, Search, Bell, Clock, LogOut,
  Eye, X, Moon, Sun, ChevronRight, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { logout, previewAs, useStore, errorMessage } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { useAdminPath } from '@/lib/admin-entry';
import { useAdminSummary } from '@/hooks/use-admin-summary';
import { useAttention } from './attention';
import './admin-erp.css';

const initials = (n: string) => (n || 'PA').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const sz = 16;

interface Item { label: string; href: string; icon: ReactNode; hint?: string }
const groups = (b: string): { title: string; items: Item[] }[] => [
  { title: 'OVERVIEW', items: [{ label: 'Dashboard', href: b || '/', icon: <LayoutDashboard size={sz} /> }] },
  { title: 'CUSTOMERS', items: [
    { label: 'Subscribers', href: `${b}/subscribers`, icon: <Users size={sz} /> },
    { label: 'Activations', href: `${b}/activations`, icon: <Zap size={sz} /> },
  ] },
  { title: 'BILLING & ACCESS', items: [
    { label: 'Plans', href: `${b}/plans`, icon: <CreditCard size={sz} /> },
    { label: 'Licences', href: `${b}/licences`, icon: <KeyRound size={sz} /> },
    { label: 'Modules / Add-ons', href: `${b}/subscribers?view=modules`, icon: <Puzzle size={sz} />, hint: 'Managed per subscriber' },
  ] },
  { title: 'PLATFORM', items: [
    { label: 'Admin Users', href: `${b}/users`, icon: <ShieldCheck size={sz} /> },
    { label: 'Activity Logs', href: `${b}/logs`, icon: <ListChecks size={sz} /> },
    { label: 'Platform Settings', href: `${b}/settings`, icon: <Settings size={sz} /> },
  ] },
];

function useOutside(ref: React.RefObject<HTMLElement | null>, on: () => void) {
  const cb = useRef(on); cb.current = on;
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cb.current(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref]);
}

/** Server clock: offset from the server's reported time, ticking locally. */
function useServerClock(serverTime?: string) {
  const [now, setNow] = useState<Date | null>(null);
  const offset = useRef<number | null>(null);
  useEffect(() => {
    if (!serverTime) { offset.current = null; setNow(null); return; }
    const t = Date.parse(serverTime);
    if (Number.isNaN(t)) return;
    offset.current = t - Date.now();
    const tick = () => setNow(new Date(Date.now() + (offset.current ?? 0)));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [serverTime]);
  return now;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const adminPath = useAdminPath();
  const st = useStore();
  const [loc, nav] = useLocation();
  const routeSearch=useSearch();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [desktopHidden,setDesktopHidden]=useState(false);
  const [desktop,setDesktop]=useState(()=>window.matchMedia('(min-width:1024px)').matches);
  const menuButton=useRef<HTMLButtonElement>(null);
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('bhru-admin-theme') === 'dark'; } catch { return false; } });
  const summary = useAdminSummary();
  const clock = useServerClock(summary.isError ? undefined : summary.data?.serverTime);
  const attention = useAttention();
  const ok = st.session.role === 'admin';

  useEffect(() => { if (!ok) nav(st.session.role ? '/' : adminPath || '/login'); }, [ok, nav, st.session.role, adminPath]);
  useEffect(() => { try { localStorage.setItem('bhru-admin-theme', dark ? 'dark' : 'light'); } catch { /* ignore */ } }, [dark]);
  useEffect(() => { setOpen(false); }, [loc]);
  useEffect(()=>{
    const mq=window.matchMedia('(min-width:1024px)');
    const change=()=>{setDesktop(mq.matches);setOpen(false);};
    mq.addEventListener('change',change);
    return ()=>mq.removeEventListener('change',change);
  },[]);
  useEffect(()=>{
    if(!open||desktop)return;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const sidebar=document.getElementById('ae-sidebar');
    sidebar?.querySelector<HTMLElement>('button,a')?.focus();
    const keys=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();setOpen(false);}
      if(e.key==='Tab'){
        const nodes=sidebar?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])');
        if(!nodes?.length)return;
        const first=nodes[0],last=nodes[nodes.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    };
    window.addEventListener('keydown',keys);
    return ()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',keys);menuButton.current?.focus();};
  },[open,desktop]);

  // search
  const [q, setQ] = useState('');
  const [sOpen, setSOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const sWrap = useRef<HTMLDivElement>(null);
  const bWrap = useRef<HTMLDivElement>(null);
  useOutside(sWrap, () => setSOpen(false));
  useOutside(bWrap, () => setBell(false));
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if(e.key==='Escape'){setBell(false);setSOpen(false);}
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(false);setSOpen(true);requestAnimationFrame(()=>input.current?.focus()); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const slugs = useMemo(() => new Map((summary.data?.subscribers ?? []).map((s) => [s.id, s.publicSlug])), [summary.data]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return st.subscribers.filter((s) => [s.business, s.owner, s.email, s.username, slugs.get(s.id) || ''].some((v) => v.toLowerCase().includes(t))).slice(0, 8);
  }, [q, st.subscribers, slugs]);

  if (!ok) return null;
  const go = (id?: string) => { setSOpen(false); setBell(false); setQ(''); nav(`${adminPath}/subscribers${id ? `?subscriber=${encodeURIComponent(id)}` : ''}`); };
  const firstActive = st.subscribers.find((s) => s.status === 'ACTIVE') || st.subscribers[0];
  const modulesView=loc===`${adminPath}/subscribers`&&new URLSearchParams(routeSearch).get('view')==='modules';
  const isActive = (it: Item) => it.label === 'Modules / Add-ons' ? modulesView : it.label==='Subscribers'&&modulesView ? false : it.label === 'Dashboard' ? loc === it.href || loc === `${adminPath}/` : loc.startsWith(it.href);

  return (
    <div className="admin-erp flex min-h-[100dvh]" data-admin-theme={dark ? 'dark' : 'light'}>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside id="ae-sidebar" inert={desktop ? desktopHidden : !open} className={cn('ae-side fixed inset-y-0 left-0 z-40 flex flex-col transition-transform lg:sticky lg:top-0 lg:h-[100dvh] lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full',desktopHidden&&'lg:hidden')}>
        <div className="flex h-[60px] items-center justify-between px-4">
          <Link href={adminPath} className="flex items-center gap-2" aria-label="BHRU Platform dashboard">
            <img src={`${import.meta.env.BASE_URL}brand/bhru-icon.png`} alt="" width={34} height={34} className="rounded-md" />
            <span className="leading-tight"><strong className="ae-wordmark"><span>B</span>HRU</strong><small className="block text-[9.5px] text-muted-foreground">SaaS Management</small></span>
          </Link>
          <button className="ae-iconbtn lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={15} /></button>
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-3 pb-4" aria-label="Platform admin">
          {groups(adminPath).map((g) => (
            <div key={g.title}>
              <div className="ae-group-label">{g.title}</div>
              {g.items.map((it) => (
                <Link key={it.label} href={it.href} onClick={()=>setOpen(false)} className="ae-nav" data-active={isActive(it)} data-testid={`nav-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} title={it.hint}>
                  {it.icon}<span>{it.label}{it.hint && <small>{it.hint}</small>}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col" inert={open&&!desktop}>
        <header className="ae-head sticky top-0 z-20 flex min-h-[60px] flex-wrap items-center gap-2.5 px-3 py-2 sm:flex-nowrap sm:px-4 sm:py-0">
          <button ref={menuButton} className="ae-iconbtn" onClick={() => desktop ? setDesktopHidden(h=>!h) : setOpen(o=>!o)} aria-label="Menu" aria-controls="ae-sidebar" aria-expanded={desktop ? !desktopHidden : open} data-testid="button-menu"><Menu size={16} /></button>
          <div ref={sWrap} className="relative order-last min-w-0 flex-1 basis-full sm:order-none sm:max-w-[460px] sm:basis-auto">
            <Search size={14} className="absolute left-3 top-[11px] text-muted-foreground" />
            <input ref={input} className="input pl-9 pr-16" style={{ height: 34 }} value={q} aria-label="Search subscribers" data-testid="input-search"
              placeholder="Search subscribers (business, owner, email, public slug...)"
              onChange={(e) => { setQ(e.target.value); setSOpen(true); }} onFocus={() => setSOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setSOpen(false); input.current?.blur(); } if (e.key === 'Enter' && results[0]) go(results[0].id); }} />
            <span className="pointer-events-none absolute right-2 top-[8px] hidden rounded border px-1.5 text-[10px] text-muted-foreground sm:block">Ctrl K</span>
            {sOpen && q.trim() && (
              <div className="ae-pop left-0 right-0 top-[40px] max-h-[360px] overflow-y-auto py-1" role="region" aria-label="Subscriber search results">
                {results.length ? results.map((s) => (
                  <button key={s.id} className="ae-row" onClick={() => go(s.id)} data-testid={`search-result-${s.id}`}>
                    <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-[hsl(var(--brand)/.14)] text-[10.5px] font-bold text-[hsl(24_90%_40%)]">{initials(s.business)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[12.5px] font-semibold">{s.business}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{s.owner} - {s.email}{slugs.get(s.id) ? ` - /${slugs.get(s.id)}` : ''}</span></span>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </button>
                )) : <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">No subscribers match "{q}".</div>}
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 px-1 xl:flex" data-testid="text-server-time">
              <Clock size={14} className="text-muted-foreground" />
              <div className="text-[10.5px] leading-tight text-muted-foreground">Server Time · UTC<div className="text-[12px] font-semibold text-foreground">{clock ? `${clock.toLocaleDateString('en-GB',{timeZone:'UTC'})} - ${clock.toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'})}` : '—'}</div></div>
            </div>
            <button className="ae-iconbtn" onClick={() => setDark((d) => !d)} aria-label={dark ? 'Switch to light' : 'Switch to dark'} data-testid="button-theme">{dark ? <Sun size={15} /> : <Moon size={15} />}</button>
            <div ref={bWrap} className="relative">
              <button className="ae-iconbtn" onClick={() => setBell((b) => !b)} aria-label="Notifications" aria-expanded={bell} data-testid="button-notifications">
                <Bell size={15} />
                {attention.count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[hsl(var(--danger))] px-1 text-[9.5px] font-bold text-white">{attention.count}</span>}
              </button>
              {bell && (
                <div className="ae-pop ae-notice-pop py-1">
                  <div className="border-b px-3 py-2 text-[12.5px] font-semibold">Needs attention</div>
                  {attention.items.map((n) => (
                    <button key={n.key} className="ae-row" disabled={n.tone === 'ok'} onClick={() => n.tone !== 'ok' && go(n.subscriberId)} style={n.tone === 'ok' ? { cursor: 'default' } : undefined}>
                      <span className={cn('ae-kpi-ic !h-8 !w-8', n.tone === 'ok' ? 'ae-tint-green' : n.tone === 'danger' ? 'ae-tint-red' : 'ae-tint-orange')}>{n.tone === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span>
                      <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{n.title}</span><span className="block truncate text-[11px] text-muted-foreground">{n.detail}</span></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 pl-1">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-[hsl(var(--brand))] text-[11px] font-bold text-white">{initials(st.session.name)}</div>
              <div className="hidden text-[12px] leading-tight md:block"><div className="max-w-[140px] truncate font-semibold">{st.session.name || 'Platform Administrator'}</div><div className="text-[10.5px] text-muted-foreground">Platform Admin</div></div>
              <button className="btn btn-sm" style={{ height: 32 }} data-testid="button-signout"
                onClick={async () => { try { await logout(); nav(st.session.role === 'admin' ? adminPath : '/login'); } catch (e) { toast({ title: 'Sign out failed', description: errorMessage(e), variant: 'destructive' }); } }}>
                <LogOut size={13} /><span className="hidden lg:inline">Sign out</span>
              </button>
            </div>
            <button className="btn btn-primary hidden sm:inline-flex" style={{ height: 34 }} disabled={!st.subscribers.length} data-testid="button-preview-subscriber"
              onClick={() => { if (firstActive) { previewAs(firstActive.id); nav('/'); } }}>
              <Eye size={14} /><span className="hidden xl:inline">Preview as Subscriber</span><span className="xl:hidden">Preview</span>
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-hidden p-3 sm:p-4">
          {children}
          <button className="btn btn-primary mt-3 w-full sm:hidden" disabled={!st.subscribers.length} onClick={() => { if (firstActive) { previewAs(firstActive.id); nav('/'); } }}><Eye size={14} /> Preview as Subscriber</button>
        </main>
      </div>
    </div>
  );
}
