import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Bell, Check, ChevronDown, LogOut, Menu, Search, Server } from 'lucide-react';
import { logout, useStore, errorMessage } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { useAdminPath } from '@/lib/admin-entry';
import { CATALOG, itemHref } from './nav-catalog';
import { ThemeToggle } from './ThemeToggle';
import { EmptyState } from './EmptyState';
import { ServerClock } from './ServerClock';

const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const d = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', d); window.addEventListener('keydown', k);
    return () => { window.removeEventListener('pointerdown', d); window.removeEventListener('keydown', k); };
  }, [open]);
  return { open, setOpen, ref };
}

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [, nav] = useLocation();
  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: { label: string; group: string; href: string }[] = [];
    CATALOG.forEach((c) => {
      if (!seen.has(c.href)) { seen.add(c.href); out.push({ label: c.label, group: 'Menu', href: c.href }); }
      c.items.forEach((it) => { const h = itemHref(it); if (!seen.has(h)) { seen.add(h); out.push({ label: it.label, group: c.label, href: h }); } });
    });
    return out;
  }, []);
  const res = all.filter((r) => `${r.label} ${r.group}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30);
  const go = (href: string) => { onClose(); nav(href); };
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div className="sl-pop w-full max-w-[520px] overflow-hidden" role="dialog" aria-label="Search navigation" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-3">
          <Search size={15} className="text-[hsl(var(--text-secondary))]" />
          <input autoFocus value={q} data-testid="input-nav-search" onChange={(e) => { setQ(e.target.value); setIdx(0); }} placeholder="Jump to a page..." aria-label="Search navigation"
            className="h-11 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[hsl(var(--text-secondary))]"
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
            <li key={r.href + r.label}>
              <button type="button" onMouseEnter={() => setIdx(k)} onClick={() => go(r.href)} data-testid={`search-result-${k}`}
                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-[12.5px] ${k === idx ? 'bg-[hsl(var(--hover))] text-[hsl(var(--brand))]' : ''}`}>
                <span className="font-medium">{r.label}</span><span className="text-[11px] text-[hsl(var(--text-secondary))]">{r.group}</span>
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
    <header className="sl-topbar sticky top-0 z-20 flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
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
