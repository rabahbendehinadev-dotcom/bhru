import { useEffect, useMemo, useState } from 'react';
import { useSearch } from 'wouter';
import { useGetSubscriberCommerceModule, useSetSubscriberCommerceModule, getGetSubscriberCommerceModuleQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, MoreHorizontal, Users, UserCheck, Clock, PauseCircle, XCircle, X, Hourglass } from 'lucide-react';
import { AdminShell } from '@/components/bhru/shells';
import { Card, PlanBadge, SubStatus, Pager, Btn } from '@/components/bhru/ui';
import { SubActions } from '@/components/bhru/sub-actions';
import { COUNTRIES, STATUSES, daysLeft, effectiveStatus, fmtDate, fmtDateTime, useStore, type Subscriber } from '@/lib/store';
import { cn } from '@/lib/utils';

export function StatCards() {
  const { subscribers, plans } = useStore();
  const c = (s: string) => subscribers.filter((x) => effectiveStatus(x) === s).length;
  const items = [
    ['Total', subscribers.length, Users, 'bg-primary/20 text-[hsl(217_95%_72%)]'], ['Active', c('ACTIVE'), UserCheck, 'bg-ok/20 text-[hsl(152_60%_58%)]'],
    ['Trial', c('TRIAL'), Clock, 'bg-primary/20 text-[hsl(217_95%_72%)]'], ['Pending', c('PENDING'), Hourglass, 'bg-warn/20 text-[hsl(30_95%_62%)]'],
    ['Suspended', c('SUSPENDED'), PauseCircle, 'bg-danger/20 text-[hsl(0_90%_72%)]'], ['Expired', c('EXPIRED'), XCircle, 'bg-danger/20 text-[hsl(0_90%_72%)]'],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map(([l, n, Icon, tone]) => (
        <Card key={l} className="flex items-center gap-3 p-3" data-testid={`count-${l.toLowerCase()}`}>
          <div className={cn('grid h-9 w-9 place-items-center rounded-lg', tone)}><Icon size={17} /></div>
          <div><div className="text-[20px] font-semibold leading-none tabular-nums">{n}</div><div className="mt-0.5 text-[11px] text-muted-foreground">{l}</div></div>
        </Card>
      ))}
    </div>
  );
}

export const Expiry = ({ sub }: { sub: Subscriber }) => {
  const d = daysLeft(sub.expiresAt);
  if (!sub.expiresAt) return <span className="text-muted-foreground">-</span>;
  return <div className="leading-tight">{fmtDate(sub.expiresAt)}<div className={cn('text-[10.5px]', d! < 0 ? 'text-danger' : d! <= 14 ? 'text-warn' : 'text-ok')}>{d! < 0 ? 'Expired' : `${d} days`}</div></div>;
};

const adminReq = { credentials: 'same-origin' as const, headers: { 'X-BHRU-Request': '1', 'X-BHRU-Auth': 'admin' } };

function CommerceToggle({ id }: { id: string }) {
  const qc = useQueryClient();
  const key = getGetSubscriberCommerceModuleQueryKey(id);
  const q = useGetSubscriberCommerceModule(id, { request: adminReq, query: { queryKey: key } });
  const m = useSetSubscriberCommerceModule({ request: adminReq, mutation: { onSuccess: (d) => { qc.setQueryData(key, d); void qc.invalidateQueries({ queryKey: key }); } } });
  const on = q.data?.enabled === true;
  return (
    <div className="border-t p-3.5" data-testid="panel-commerce-module">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0"><div className="text-[11.5px] font-semibold">E-Commerce module</div><div className="text-[11px] text-muted-foreground">{q.isLoading ? 'Loading...' : q.isError ? 'Could not load module state.' : on ? 'Enabled for this subscriber.' : 'Disabled for this subscriber.'}</div></div>
        {q.isError ? <Btn sm onClick={() => void q.refetch()} data-testid="button-commerce-module-retry">Retry</Btn> : (
          <Btn sm v={on ? 'danger' : 'primary'} disabled={q.isLoading || m.isPending} onClick={() => m.mutate({ id, data: { enabled: !on } })} data-testid="button-commerce-module-toggle">{m.isPending ? 'Saving...' : on ? 'Disable' : 'Enable'}</Btn>
        )}
      </div>
      {m.isError && <p className="mt-1.5 text-[11px] text-danger" role="alert">{m.error instanceof Error ? m.error.message : 'Could not update the module.'}</p>}
    </div>
  );
}

function Detail({ sub, onClose }: { sub: Subscriber; onClose: () => void }) {
  const rows: [string, React.ReactNode][] = [
    ['Business owner', sub.owner], ['Email', sub.email], ['Username', sub.username], ['Phone', sub.phone], ['Country', sub.country],
    ['Registered', fmtDateTime(sub.registeredAt)], ['Plan', <PlanBadge key="p" plan={sub.plan} />],
    ['Licence', <span key="l" className="font-mono text-[11px]">{sub.licenceKey || 'Not issued'}</span>], ['Status', <SubStatus key="s" sub={sub} />],
    ['Expiration', sub.expiresAt ? `${fmtDate(sub.expiresAt)} (${daysLeft(sub.expiresAt)} days)` : '-'], ['Last login', fmtDateTime(sub.lastLogin)],
    ['Custom domain', sub.domain || '-'],
  ];
  return (
    <Card className="overflow-hidden" data-testid="panel-subscriber-detail">
      <div className="flex items-center gap-3 border-b p-3.5">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-secondary font-bold">{sub.business.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
        <div className="min-w-0 flex-1"><div className="truncate font-semibold" data-testid="text-detail-business">{sub.business}</div><div className="text-[11.5px] text-muted-foreground">{sub.plan} Plan - BHRU subscriber</div></div>
        <SubStatus sub={sub} />
        <button onClick={onClose} aria-label="Close panel" className="text-muted-foreground"><X size={16} /></button>
      </div>
      <dl className="space-y-1.5 p-3.5 text-[12.5px]">
        {rows.map(([k, v]) => <div key={k} className="grid grid-cols-[110px_1fr] items-center gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 truncate">{v}</dd></div>)}
      </dl>
      <div className="border-t p-3.5"><SubActions sub={sub} /></div>
      <CommerceToggle id={sub.id} />
      <div className="border-t p-3.5"><div className="mb-1 text-[11.5px] font-semibold">Notes</div><div className="rounded-md border bg-background p-2.5 text-[12px] text-muted-foreground" data-testid="text-detail-notes">{sub.notes || 'No notes.'}</div></div>
    </Card>
  );
}

function Page() {
  const { subscribers, plans } = useStore();
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [country, setCountry] = useState('');
  const [per, setPer] = useState(10);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(null);
  const search = useSearch();
  const requested = new URLSearchParams(search).get('subscriber');
  const requestedExists = subscribers.some(s => s.id === requested);
  const modulesView = new URLSearchParams(search).get('view') === 'modules';
  useEffect(() => {
    if (!requested || !requestedExists) return;
    setSel(requested); setQ(''); setPlan(''); setStatus(''); setCountry(''); setPage(1);
  }, [requested,requestedExists]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return subscribers.filter((x) =>
      (!s || [x.business, x.owner, x.email, x.username, x.domain].some((v) => v.toLowerCase().includes(s))) &&
      (!plan || x.plan === plan) && (!status || effectiveStatus(x) === status) && (!country || x.country === country),
    ).sort((a, b) => +new Date(b.registeredAt) - +new Date(a.registeredAt));
  }, [subscribers, q, plan, status, country]);
  const pages = Math.max(1, Math.ceil(list.length / per));
  const cur = Math.min(page, pages);
  const rows = list.slice((cur - 1) * per, cur * per);
  const selected = subscribers.find((x) => x.id === sel);
  const reset = <T,>(f: (v: T) => void) => (v: T) => { f(v); setPage(1); };
  return (
    <div className="space-y-3">
      <div><h1 className="text-[18px] font-semibold">{modulesView ? 'Modules / Add-ons' : 'Subscribers'}</h1><p className="text-[12.5px] text-muted-foreground">{modulesView ? 'Select a subscriber to manage their existing E-Commerce module controls in the details panel.' : 'Every business registered on BHRU. Manage their licences, statuses and subscriptions.'}</p></div>
      <StatCards />
      <div className="grid items-start gap-3 xl:grid-cols-[1fr_380px]" style={selected ? undefined : { gridTemplateColumns: '1fr' }}>
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <div className="relative min-w-[200px] flex-1"><Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input className="input pl-8" placeholder="Search business, owner, email, username..." value={q} onChange={(e) => reset(setQ)(e.target.value)} data-testid="input-search" /></div>
            <select className="input w-auto" value={plan} onChange={(e) => reset(setPlan)(e.target.value)} data-testid="filter-plan"><option value="">All plans</option>{plans.map((p) => <option key={p.id}>{p.name}</option>)}</select>
            <select className="input w-auto" value={status} onChange={(e) => reset(setStatus)(e.target.value)} data-testid="filter-status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}</select>
            <select className="input w-auto" value={country} onChange={(e) => reset(setCountry)(e.target.value)} data-testid="filter-country"><option value="">All countries</option>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          <div className="scroll-thin overflow-x-auto">
            <table className="tbl" data-testid="table-subscribers">
              <thead><tr><th>#</th><th>Business / Server</th><th>Owner</th><th>Email / Username</th><th>Plan</th><th>Status</th><th>Registered</th><th>Expiration</th><th>Last login</th><th>Custom domain</th><th>Actions</th></tr></thead>
              <tbody>
                {rows.map((s, k) => (
                  <tr key={s.id} className={cn('hov', sel === s.id && 'bg-accent/60')} onClick={() => setSel(s.id)} data-testid={`row-subscriber-${s.id}`}>
                    <td className="text-muted-foreground">{(cur - 1) * per + k + 1}</td>
                    <td><div className="font-semibold">{s.business}</div><div className="text-[10.5px] text-muted-foreground">{s.country}</div></td>
                    <td>{s.owner}</td>
                    <td><div>{s.email}</div><div className="text-[10.5px] text-muted-foreground">{s.username}</div></td>
                    <td><PlanBadge plan={s.plan} /></td><td><SubStatus sub={s} /></td>
                    <td>{fmtDateTime(s.registeredAt)}</td><td><Expiry sub={s} /></td>
                    <td>{s.lastLogin ? <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-ok" />{fmtDateTime(s.lastLogin)}</span> : <span className="text-muted-foreground">Never</span>}</td>
                    <td className="text-muted-foreground">{s.domain || '-'}</td>
                    <td><Btn sm className="w-8 px-0" aria-label="Open details" data-testid={`button-open-${s.id}`} onClick={(e) => { e.stopPropagation(); setSel(s.id); }}><MoreHorizontal size={14} /></Btn></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={11} className="py-10 text-center text-muted-foreground" data-testid="text-empty">No subscribers match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-[12px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <select className="input w-auto" value={per} onChange={(e) => { setPer(Number(e.target.value)); setPage(1); }}><option value={5}>5 per page</option><option value={10}>10 per page</option><option value={25}>25 per page</option></select>
              <span data-testid="text-showing">Showing {list.length ? (cur - 1) * per + 1 : 0} to {Math.min(cur * per, list.length)} of {list.length} results</span>
            </div>
            <Pager page={cur} pages={pages} onPage={setPage} />
          </div>
        </Card>
        {selected && (
          <div className="fixed inset-y-0 right-0 z-40 w-full max-w-[400px] overflow-y-auto bg-background p-2 shadow-2xl xl:static xl:z-auto xl:max-w-none xl:overflow-visible xl:bg-transparent xl:p-0 xl:shadow-none">
            <Detail sub={selected} onClose={() => setSel(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
export default function Subscribers() { return <AdminShell><Page /></AdminShell>; }
