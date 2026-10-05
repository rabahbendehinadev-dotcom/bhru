import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Bell, Check, ChevronDown, LogOut, Menu, Search, Server } from 'lucide-react';
import { logout, useStore, errorMessage } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { useAdminPath } from '@/lib/admin-entry';
import { SEARCH_INDEX } from './nav-catalog';
import { ThemeToggle } from './ThemeToggle';
import { EmptyState } from './EmptyState';
import { ServerClock } from './ServerClock';
import { InstallOption } from './PwaInstall';
import { usePopover } from './popover';

const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const selected = useRef<HTMLButtonElement>(null);
  useEffect(() => { selected.current?.scrollIntoView({ block: 'nearest' }); }, [idx, q]);
  const [, nav] = useLocation();
  const res = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return SEARCH_INDEX.filter((r) => { const hay = `${r.label} ${r.context}`.toLowerCase(); return terms.every((w) => hay.includes(w)); });
  }, [q]);
  const go = (href: string) => { onClose(); nav(href); };
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div className="sl-pop w-full max-w-[520px] overflow-hidden" role="dialog" aria-label="Search navigation" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-3">
          <Search size={15} className="text-[hsl(var(--text-secondary))]" />
          <input autoFocus value={q} data-testid="input-nav-search" onChange={(e) => { setQ(e.target.value); setIdx(0); }} placeholder="Jump to a page..." aria-label="Search navigation"
            className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-[hsl(var(--text-secondary))] lg:text-[13px]"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              else if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, res.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && res[idx]) go(res[idx].href);
            }} />
          <span className="sl-kbd">Esc</span>
        </div>
        <ul className="scroll-thin max-h-[50dvh] overflow-y-auto p-1.5">
          {res.length === 0 && <li className="px-3 py-6 text-center text-[12.5px] text-[hsl(var(--text-secondary))]">No page matches "{q}".</li>}
          {res.map((r, k) => (
            <li key={r.id}>
              <button ref={k === idx ? selected : undefined} type="button" onMouseEnter={() => setIdx(k)} onClick={() => go(r.href)} data-testid={`search-result-${r.id.replace('.', '--')}`}
                className={`flex min-h-11 w-full flex-col items-start justify-between gap-1 rounded-md px-2.5 py-2 text-left text-[12.5px] sm:flex-row sm:items-center lg:min-h-0 ${k === idx ? 'bg-[hsl(var(--hover))] text-[hsl(var(--brand))]' : ''}`}>
                <span className="min-w-0 font-medium">{r.label}</span><span className="max-w-full text-left text-[11px] text-[hsl(var(--text-secondary))] sm:ml-3 sm:max-w-[50%] sm:text-right">{r.context}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function TopBar({ business, owner, onToggleSidebar, onOpenSearch }: { business: string; owner: string; onToggleSidebar: () => void; onOpenSearch: () => void }) {
  const st = useStore();
  const adminPath = useAdminPath();
  const [, nav] = useLocation();
  const { toast } = useToast();
  const srv = usePopover();
  const bell = usePopover();
  return (
    <header className="sl-topbar sticky top-0 z-20 hidden h-14 lg:flex items-center gap-2 px-3 sm:gap-3 sm:px-4">
      <button className="sl-icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar" data-testid="button-menu"><Menu size={16} /></button>

      <div className="relative" ref={srv.ref}>
        <button type="button" className="sl-field h-8 text-[hsl(var(--text-primary))]" onClick={() => srv.setOpen((o) => !o)} aria-expanded={srv.open} data-testid="text-business-name">
          <Server size={14} className="hidden text-[hsl(var(--text-secondary))] sm:block" />
          <span className="hidden text-[10.5px] text-[hsl(var(--text-secondary))] sm:inline">Server</span>
          <span className="max-w-[48px] truncate font-semibold sm:max-w-[170px]">{business}</span>
          <ChevronDown size={12} className="text-[hsl(var(--text-secondary))]" />
        </button>
        {srv.open && (
          <div className="sl-pop absolute left-0 top-10 z-50 w-[260px] p-2">
            <div className="flex items-center gap-2 rounded-md bg-[hsl(var(--hover))] px-2.5 py-2 text-[12.5px]"><Check size={14} className="text-[hsl(var(--brand))]" /><span className="truncate font-semibold">{business}</span><span className="ml-auto text-[10.5px] text-[hsl(var(--text-secondary))]">Current</span></div>
            <p className="px-1 pb-1 pt-2 text-[11px] leading-snug text-[hsl(var(--text-secondary))]">This account manages a single server. Switching between servers will appear here once more than one is linked.</p>
            <InstallOption />
          </div>
        )}
      </div>

      <button type="button" className="sl-field ml-1 hidden w-full max-w-[320px] flex-1 md:flex" onClick={onOpenSearch} data-testid="button-search">
        <Search size={14} /><span className="flex-1 text-left">Search pages...</span><span className="sl-kbd">Ctrl + K</span>
      </button>

      <div className="ml-auto flex items-center gap-1 sm:gap-3">
        <button className="sl-icon-btn md:hidden" onClick={onOpenSearch} aria-label="Search pages"><Search size={15} /></button>
        <ThemeToggle />
        <ServerClock />
        <div className="relative" ref={bell.ref}>
          <button className="sl-icon-btn" aria-label="Notifications" aria-expanded={bell.open} onClick={() => bell.setOpen((o) => !o)} data-testid="button-notifications"><Bell size={15} /></button>
          {bell.open && (
            <div className="sl-pop absolute right-0 top-10 z-50 w-[270px] max-w-[calc(100vw-24px)]">
              <EmptyState compact icon={<Bell size={18} />} title="No notifications" description="Alerts will appear here once business modules are enabled." />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-[hsl(var(--brand))] text-[11px] font-bold text-white" data-testid="img-avatar">{initialsOf(owner)}</div>
          <div className="hidden text-[12px] leading-tight sm:block"><div className="max-w-[130px] truncate font-semibold" data-testid="text-owner-name">{owner}</div><div className="text-[10.5px] text-[hsl(var(--text-secondary))]">Owner</div></div>
          <button className="btn btn-sm" data-testid="button-signout" onClick={async () => { try { await logout(); nav(st.session.role === 'admin' ? adminPath : '/login'); } catch (e) { toast({ title: 'Sign out failed', description: errorMessage(e), variant: 'destructive' }); } }}>
            <LogOut size={13} /><span className="hidden md:inline">Sign out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
