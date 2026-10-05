import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { columnsOf, isTwoColumn, type NavEntry } from './nav-catalog';
import { NavItemList } from './NavItemList';

interface Props { id: string; entry: NavEntry; left: number; top: number; onEnter: () => void; onLeave: () => void; onNavigate: () => void }

/** Right-side flyout. Explicit columns from config; fixed overlay, scrolls within the viewport. */
export function FlyoutMenu({ id, entry, left, top, onEnter, onLeave, onNavigate }: Props) {
  const [loc] = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(top);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setY(Math.max(8, Math.min(top, window.innerHeight - 8 - h)));
  }, [top, entry.id]);
  const two = isTwoColumn(entry);
  const cols = columnsOf(entry);
  return (
    <div ref={ref} id={id} role="menu" aria-label={entry.label} data-testid={`flyout-${entry.id}`} className="sl-fly sl-fly-bridge fixed z-[60] flex flex-col"
      style={{ left, top: y, width: two ? 500 : 260, maxWidth: `calc(100vw - ${left + 8}px)`, maxHeight: 'calc(100dvh - 16px)' }}
      onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">
        <span className="text-[hsl(var(--brand))]">{entry.icon}</span>{entry.label}
      </div>
      <div className={`scroll-thin min-h-0 overflow-y-auto px-1.5 pb-1.5 ${two ? 'grid grid-cols-2 gap-x-1' : ''}`}>
        {cols.map((c, i) => (
          <div key={i} className="min-w-0" data-testid={`flyout-col-${entry.id}-${i + 1}`}>
            <NavItemList items={c} variant="fly" onNavigate={onNavigate} activeHref={loc} />
          </div>
        ))}
      </div>
    </div>
  );
}
