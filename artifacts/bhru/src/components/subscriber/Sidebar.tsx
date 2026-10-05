import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronRight, Search, X } from 'lucide-react';
import { NAV, entryIsActive, hasFlyout, isDesktopNav } from './nav-catalog';
import { FlyoutMenu } from './FlyoutMenu';
import { Wordmark } from './Wordmark';
import { OnlineStaffBadge, useOnlineStaff } from './OnlineStaff';

interface Props { collapsed: boolean; mobileOpen: boolean; onCloseMobile: () => void; onOpenSearch: () => void }

export function Sidebar({ collapsed, onCloseMobile, onOpenSearch }: Props) {
  const [loc] = useLocation();
  const [open, setOpen] = useState<{ id: string; top: number } | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [left, setLeft] = useState(232);
  const staff = useOnlineStaff();

  const cancel = () => window.clearTimeout(timer.current);
  const scheduleClose = () => { cancel(); timer.current = window.setTimeout(() => setOpen(null), 320); };
  const show = (id: string, el: HTMLElement) => {
    if (!isDesktopNav()) return;
    cancel();
    if (!hasFlyout(NAV.find((n) => n.id === id)!)) { setOpen(null); return; }
    const r = el.getBoundingClientRect();
    setLeft((asideRef.current?.getBoundingClientRect().right ?? r.right) - 4);
    setOpen({ id, top: r.top - 8 });
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

  return (
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
        {NAV.map((c) => {
          const on = open?.id === c.id;
          const fly = hasFlyout(c);
          return (
            <div key={c.id} className="mb-0.5" onMouseEnter={(e) => show(c.id, e.currentTarget)} onMouseLeave={scheduleClose}>
              <Link href={c.href} data-testid={`nav-${c.id}`} data-active={entryIsActive(c, loc)} data-open={on} title={collapsed ? c.label : undefined}
                aria-haspopup={fly ? 'menu' : undefined} aria-expanded={fly ? on : undefined} aria-controls={on ? `fly-${c.id}` : undefined} className="sl-nav relative"
                onFocus={(e) => show(c.id, e.currentTarget.parentElement as HTMLElement)} onClick={() => { close(); onCloseMobile(); }}>
                {c.icon}
                <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{c.label}</span>
                {c.badge === 'online-staff' && <span className={collapsed ? 'sl-count-dot' : 'ml-auto'}><OnlineStaffBadge count={staff.count} /></span>}
                {fly && <ChevronRight size={13} className={`sl-chev ${collapsed ? 'lg:hidden' : ''}`} />}
              </Link>
              {on && (
                <span data-flyout-zone>
                  <FlyoutMenu id={`fly-${c.id}`} entry={c} left={left} top={open.top} onEnter={cancel} onLeave={scheduleClose} onNavigate={() => { close(); onCloseMobile(); }} />
                </span>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
