import { Fragment } from 'react';
import { Link } from 'wouter';
import type { NavChild } from './nav-catalog';

interface Props { items: NavChild[]; onNavigate: () => void; variant: 'fly' | 'drawer'; activeHref?: string }

/** Renders children in config order, emitting a heading whenever the group changes. */
export function NavItemList({ items, onNavigate, variant, activeHref }: Props) {
  let last: string | undefined;
  return (
    <>
      {items.map((it) => {
        const head = it.group && it.group !== last ? it.group : null;
        last = it.group;
        return (
          <Fragment key={it.id}>
            {head && <div className={variant === 'fly' ? 'sl-fly-group' : 'sl-dgroup'} data-testid={`nav-group-${it.parentId}-${head.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>{head}</div>}
            <Link href={it.href} role={variant === 'fly' ? 'menuitem' : undefined} onClick={onNavigate}
              className={variant === 'fly' ? 'sl-fly-item' : 'sl-drow sl-drow-child'} data-active={activeHref === it.href}
              data-testid={`${variant === 'fly' ? 'flyout' : 'drawer'}-link-${it.id.replace('.', '--')}`}>
              {variant === 'fly' && <span className="sl-fly-dot" aria-hidden />}
              <span className="sl-fly-label min-w-0 truncate">{it.label}</span>
            </Link>
          </Fragment>
        );
      })}
    </>
  );
}
