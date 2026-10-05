import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronRight, Search, X } from 'lucide-react';
import { CATALOG, itemHref, slugify } from './nav-catalog';
import { FlyoutMenu } from './FlyoutMenu';
import { Wordmark } from './Wordmark';

interface Props { collapsed: boolean; mobileOpen: boolean; onCloseMobile: () => void; onOpenSearch: () => void }

export function Sidebar({ collapsed, mobileOpen, onCloseMobile, onOpenSearch }: Props) {
  const [loc] = useLocation();
  const [open, setOpen] = useState<{ label: string; top: number } | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [left, setLeft] = useState(232);

  const cancel = () => window.clearTimeout(timer.current);
  const scheduleClose = () => { cancel(); timer.current = window.setTimeout(() => setOpen(null), 180); };
  const show = (label: string, el: HTMLElement) => {
    if (!window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches) return;
    cancel();
    const r = el.getBoundingClientRect();
    setLeft(asideRef.current?.getBoundingClientRect().right ?? r.right);
    setOpen({ label, top: Math.max(8, Math.min(r.top - 8, window.innerHeight - 220)) });
  };
  const close = useCallback(() => { window.clearTimeout(timer.current); setOpen(null); }, []);

  useEffect(() => {
    if (!open) return;
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') close(); };
    const down = (ev: PointerEvent) => { if (!(ev.target as HTMLElement).closest?.('[data-flyout-zone]')) close(); };
    window.addEventListener('keydown', key); window.addEventListener('pointerdown', down);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', down); };
  }, [open, close]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { close(); }, [loc, collapsed, close]);

  const active = CATALOG.find((c) => open && c.label === open.label);
  const isActive = (c: (typeof CATALOG)[number]) =>
    c.href === '/' ? loc === '/' || loc === '/dashboard' : loc === c.href || c.items.some((it) => { const h = itemHref(it); return h !== '/' && loc === h; });

  return (
    <>
      <aside ref={asideRef} data-testid="subscriber-sidebar" data-flyout-zone
        className={`sl-aside hidden flex-col lg:flex lg:sticky lg:top-0 lg:z-30 lg:h-[100dvh] lg:shrink-0 lg:self-start ${collapsed ? 'w-[232px] lg:w-[64px]' : 'w-[232px]'}`}>
        <div className="flex h-14 items-center justify-between px-3.5">
          <Wordmark compact={collapsed} />
          <button className="sl-icon-btn lg:hidden" onClick={onCloseMobile} aria-label="Close menu"><X size={15} /></button>
        </div>
        {!collapsed && (
          <div className="px-3 pb-2">
            <button type="button" className="sl-field w-full text-left" onClick={onOpenSearch} data-testid="button-sidebar-search"><Search size={14} />Search menu...</button>
          </div>
        )}
        <nav className="scroll-thin flex-1 overflow-y-auto px-2.5 pb-3" aria-label="Main">
          {CATALOG.map((c) => {
            const slug = slugify(c.label);
            const on = open?.label === c.label;
            return (
              <div key={c.label} className="mb-0.5" onMouseEnter={(e) => show(c.label, e.currentTarget)} onMouseLeave={scheduleClose}>
                <Link href={c.href} data-testid={`nav-${slug}`} data-active={isActive(c)} data-open={on} title={collapsed ? c.label : undefined}
                  aria-haspopup="menu" aria-expanded={on} aria-controls={on ? `fly-${slug}` : undefined} className="sl-nav"
                  onFocus={(e) => show(c.label, e.currentTarget.parentElement as HTMLElement)}
                   onClick={onCloseMobile}>
                  {c.icon}
                  <span className={collapsed ? 'lg:hidden' : ''}>{c.label}</span>
                  <ChevronRight size={13} className={`sl-chev ${collapsed ? 'lg:hidden' : ''}`} />
                </Link>
                {on && active && (
                  <span data-flyout-zone>
                    <FlyoutMenu id={`fly-${slug}`} title={c.label} items={c.items} icon={c.icon} left={left} top={open.top} onEnter={cancel} onLeave={scheduleClose} onNavigate={() => { close(); onCloseMobile(); }} />
                  </span>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
