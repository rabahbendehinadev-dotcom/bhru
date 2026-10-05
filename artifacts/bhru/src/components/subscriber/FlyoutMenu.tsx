import { Link } from 'wouter';
import type { ReactNode } from 'react';
import { itemHref, type CatalogItem } from './nav-catalog';

interface Props {
  id: string; title: string; items: CatalogItem[]; icon: ReactNode;
  left: number; top: number; onEnter: () => void; onLeave: () => void; onNavigate: () => void;
}

/** Reusable right-side multi-column flyout. Overlays content (fixed), never pushes it. */
export function FlyoutMenu({ id, title, items, icon, left, top, onEnter, onLeave, onNavigate }: Props) {
  const wide = items.length > 5;
  const flyoutLeft = window.innerWidth < 640 ? 8 : left;
  return (
    <div id={id} role="menu" aria-label={title} data-testid={`flyout-${id}`} className="sl-fly scroll-thin fixed z-[60] overflow-y-auto p-2"
      style={{ left: flyoutLeft, top, width: wide ? 540 : 290, maxWidth: `calc(100vw - ${flyoutLeft + 8}px)`, maxHeight: `calc(100dvh - ${top + 12}px)` }}
      onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--text-secondary))]">{title}</div>
      <div className={wide ? 'sm:columns-2 sm:gap-2' : ''}>
        {items.map((it) => (
          <Link key={it.label} href={itemHref(it)} role="menuitem" onClick={onNavigate} className="sl-fly-item" data-testid={`flyout-link-${id}-${it.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
            <span className="sl-fly-tile">{icon}</span>
            <span className="min-w-0">
              <span className="sl-fly-label block text-[12.5px] font-semibold leading-tight">{it.label}</span>
              <span className="block text-[11px] leading-tight text-[hsl(var(--text-secondary))]">{it.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
