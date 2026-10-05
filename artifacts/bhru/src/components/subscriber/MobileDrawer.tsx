import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { CATALOG, itemHref, slugify } from './nav-catalog';
import { Wordmark } from './Wordmark';

interface Props { open: boolean; onClose: () => void; returnFocus: React.RefObject<HTMLElement | null> }

export function MobileDrawer({ open, onClose, returnFocus }: Props) {
  const [loc] = useLocation();
  const [view, setView] = useState<string | null>(null);
  const [visible, setVisible] = useState(open);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const first = useRef(true);

  useEffect(() => { if (!first.current) closeRef.current(); first.current = false; }, [loc]);
  useEffect(() => {
    if (open) { setVisible(true); setView(null); return; }
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200;
    const timer = window.setTimeout(() => { setVisible(false); setView(null); }, delay);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const target = returnFocus.current;
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = Array.from(panel.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    const resize = () => { if (window.matchMedia('(min-width: 1024px)').matches) closeRef.current(); };
    window.addEventListener('keydown', key); window.addEventListener('resize', resize);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', key); window.removeEventListener('resize', resize); target?.focus(); };
  }, [open, returnFocus]);

  useEffect(() => { if (open) panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }, [view, open, visible]);

  if (!open && !visible) return null;
  const cat = CATALOG.find((c) => c.label === view);
  const isActive = (c: (typeof CATALOG)[number]) => c.href === '/' ? loc === '/' || loc === '/dashboard' : loc === c.href || c.items.some((it) => itemHref(it) === loc);

  return (
    <div className="sl-drawer-root lg:hidden" data-testid="mobile-drawer" data-open={open} aria-hidden={!open} inert={!open}>
      <div className="sl-scrim" onClick={onClose} aria-hidden />
      <div ref={panel} className="sl-drawer" role="dialog" aria-modal="true" aria-label="Main menu">
        <div className="flex min-h-14 items-center justify-between gap-2 px-3">
          {cat ? (
            <button type="button" data-autofocus className="sl-touch sl-back" onClick={() => setView(null)} data-testid="button-drawer-back"><ChevronLeft size={20} />Back</button>
          ) : <Wordmark />}
          <button type="button" className="sl-icon-btn sl-touch" onClick={onClose} aria-label="Close menu" data-testid="button-drawer-close" {...(cat ? {} : { 'data-autofocus': true })}><X size={20} /></button>
        </div>
        {cat ? (
          <nav className="scroll-thin sl-drawer-scroll" aria-label={cat.label}>
            <div className="px-3 pb-2 pt-1 text-[12px] font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">{cat.label}</div>
            {cat.items.map((it) => (
              <Link key={it.label} href={itemHref(it)} onClick={onClose} className="sl-drow" data-testid={`drawer-link-${slugify(cat.label)}-${slugify(it.label)}`}>
                <span className="sl-fly-tile">{cat.icon}</span>
                <span className="min-w-0"><span className="block text-[14px] font-semibold leading-tight">{it.label}</span><span className="block text-[12px] leading-tight text-[hsl(var(--text-secondary))]">{it.desc}</span></span>
              </Link>
            ))}
          </nav>
        ) : (
          <nav className="scroll-thin sl-drawer-scroll" aria-label="Main">
            {CATALOG.map((c) => (
              <button key={c.label} type="button" className="sl-drow" data-active={isActive(c)} onClick={() => setView(c.label)} data-testid={`drawer-nav-${slugify(c.label)}`}>
                <span className="sl-fly-tile">{c.icon}</span>
                <span className="flex-1 text-left text-[14px] font-semibold">{c.label}</span>
                <ChevronRight size={16} className="opacity-60" />
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
