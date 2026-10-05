import { Fragment } from 'react';
import { useRoute, Link } from 'wouter';
import { ChevronRight, Construction, SearchX } from 'lucide-react';
import { Btn } from '@/components/bhru/ui';
import { resolveSlug } from '@/components/subscriber/nav-catalog';
import { OnlineStaffList, useOnlineStaff } from '@/components/subscriber/OnlineStaff';
import { EmptyState } from '@/components/subscriber/EmptyState';

function Crumbs({ items }: { items: string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1.5 flex flex-wrap items-center gap-1 text-[11.5px] text-[hsl(var(--text-secondary))]" data-testid="breadcrumb">
      {items.map((c, i) => (
        <Fragment key={`${i}-${c}`}>
          {i > 0 && <ChevronRight size={11} className="opacity-60" />}
          {i === 0 ? <Link href="/" className="hover:text-[hsl(var(--brand))]">{c}</Link> : <span className={i === items.length - 1 ? 'font-medium text-[hsl(var(--text-primary))]' : ''}>{c}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

export default function Module() {
  const [, p] = useRoute('/m/:slug');
  const r = p ? resolveSlug(p.slug) : undefined;
  const staff = useOnlineStaff();

  if (!r) return (
    <>
      <div className="sl-surface mx-auto mt-10 max-w-md" data-testid="module-not-found">
        <EmptyState icon={<SearchX size={18} />} title="Page not found" description="This address does not match any page in the BHRU menu."
          action={<Link href="/"><Btn data-testid="button-back-dashboard">Back to dashboard</Btn></Link>} />
      </div>
    </>
  );

  const isStaff = r.entry.id === 'online-staff' && !r.child;
  return (
    <>
      <Crumbs items={r.crumbs} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">{r.title}</h1>
          <p className="mt-0.5 text-[12.5px] text-[hsl(var(--text-secondary))]" data-testid="text-module-name">
            Module: {r.entry.label}{r.child?.group ? ` · ${r.child.group}` : ''}
          </p>
        </div>
        {isStaff && <span className="badge bg-[hsl(var(--brand)/.12)]" data-testid="text-online-staff-count">{staff.count} online</span>}
      </div>
      <div className="sl-surface" data-testid={isStaff ? 'online-staff-page' : 'module-placeholder'}>
        {isStaff ? <OnlineStaffList members={staff.members} /> : (
          <EmptyState icon={<Construction size={18} />} title="Module not enabled yet" description="This page is part of the BHRU structure and will be connected in a later stage." />
        )}
      </div>
    </>
  );
}
