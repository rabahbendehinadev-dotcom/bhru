import { useEffect,useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Search, Tag } from 'lucide-react';
import { Btn, Card } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { useCustomerPricing, useGroupAdmin, useGroupPricing } from '@/hooks/use-pricing';
import { errText } from '@/hooks/use-commerce';

const METHODS = [['INHERIT_DEFAULT', 'Inherit'], ['FIXED_PRICE', 'Fixed price (USD)'], ['PERCENT_DISCOUNT', 'Percent discount'], ['PERCENT_MARKUP', 'Percent markup']] as const;
type Method = typeof METHODS[number][0];
type Row = { serviceId: string; serviceName: string; serviceType: string; active: boolean; standardPriceUsd: string; effectivePriceUsd: string; rule: { id: string; method: string; value: string } | null };

/** Client-side input validation only; all prices shown come from the server. */
function check(m: Method, v: string): string {
  if (m === 'INHERIT_DEFAULT') return '';
  const s = v.trim();
  if (m === 'FIXED_PRICE') return /^\d+(\.\d{1,6})?$/.test(s) && /[1-9]/.test(s) ? '' : 'Fixed price must be a positive USD amount.';
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return 'Use a percentage with at most two decimals.';
  const n = Number(s);
  if (m === 'PERCENT_DISCOUNT') return n >= 0 && n < 100 ? '' : 'Discount must be below 100.';
  return n >= 0 && n <= 10000 ? '' : 'Markup cannot exceed 10000.';
}

function PriceRow({ r, scope, id }: { r: Row; scope: 'group' | 'customer'; id: string }) {
  const a = useGroupAdmin();
  const [m, setM] = useState<Method>((r.rule?.method as Method) ?? 'INHERIT_DEFAULT');
  const [v, setV] = useState(r.rule?.value ?? '');
  const [dirty,setDirty]=useState(false);
  useEffect(()=>{if(!dirty){setM((r.rule?.method as Method)??'INHERIT_DEFAULT');setV(r.rule?.value??'');}},[dirty,r.rule?.method,r.rule?.value]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const save = scope === 'group' ? a.saveGroup : a.saveCustomer;
  const del = scope === 'group' ? a.removeGroup : a.removeCustomer;
  const busy = save.isPending || del.isPending;
  const go = async () => {
    const e = check(m, v); if (e) return setMsg({ ok: false, t: e });
    try {
      if (m === 'INHERIT_DEFAULT') { if (r.rule) await del.mutateAsync({ id, serviceId: r.serviceId }); }
      else await save.mutateAsync({ id, serviceId: r.serviceId, data: { method: m, value: v.trim() } });
      setMsg({ ok: true, t: 'Saved' });
      setDirty(false);
    } catch (x) { setMsg({ ok: false, t: errText(x) }); }
  };
  return (
    <tr data-testid={`row-pricing-${r.serviceId}`}>
      <td className="min-w-[160px]"><div className="font-semibold">{r.serviceName}</div><div className="text-[11px] text-muted-foreground">{r.serviceType}{!r.active && ' · inactive'}</div></td>
      <td className="whitespace-nowrap">${r.standardPriceUsd}</td>
      <td>
        <div className="flex flex-wrap items-center gap-1.5">
          <select className="input w-auto" value={m} onChange={(e) => { setDirty(true);setM(e.target.value as Method); setMsg(null); }} aria-label="Method" data-testid={`select-pricing-method-${r.serviceId}`}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          {m !== 'INHERIT_DEFAULT' && <input className="input w-24" inputMode="decimal" value={v} onChange={(e) => { setDirty(true);setV(e.target.value); setMsg(null); }} aria-label="Value" data-testid={`input-pricing-value-${r.serviceId}`} />}
          <Btn sm v="brand" disabled={busy} onClick={() => void go()} data-testid={`button-pricing-save-${r.serviceId}`}>{busy ? 'Saving...' : 'Save'}</Btn>
        </div>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-1 text-[11px] ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.t}</p>}
      </td>
      <td className="whitespace-nowrap font-semibold" data-testid={`text-effective-${r.serviceId}`}>${r.effectivePriceUsd}</td>
    </tr>
  );
}

export function PricingTable({ scope, id }: { scope: 'group' | 'customer'; id: string }) {
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const params = { page, ...(search ? { search } : {}) };
  const g = useGroupPricing(scope === 'group' ? id : '', params);
  const c = useCustomerPricing(scope === 'customer' ? id : '', params);
  const q = scope === 'group' ? g : c;
  const d = q.data as { data?: Row[]; hasMore?: boolean } | undefined;
  return (
    <Card data-testid={`pricing-${scope}`}>
      <form className="flex flex-wrap gap-2 border-b p-2.5" onSubmit={(e) => { e.preventDefault(); setSearch(text.trim()); setPage(1); }}>
        <div className="relative min-w-[200px] flex-1"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input pl-8" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search services..." aria-label="Search services" data-testid="input-pricing-search" /></div>
        <Btn type="submit" v="brand" sm data-testid="button-pricing-search">Search</Btn>
      </form>
      {q.isLoading ? <div className="space-y-2 p-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-white/5" />)}</div>
        : q.isError || !d?.data ? <div role="alert" className="flex flex-col items-center gap-2 p-8 text-center"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(q.error)}</p><Btn sm onClick={() => void q.refetch()}>Try again</Btn></div>
        : d.data.length === 0 ? <EmptyState compact icon={<Tag size={18} />} title={search ? 'No services match' : 'No services yet'} description="Services from your catalog appear here for pricing." />
        : <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th>Service</th><th>Standard</th><th>Rule</th><th>Effective</th></tr></thead>
          <tbody>{d.data.map((r) => <PriceRow key={`${r.serviceId}:${r.rule?.id ?? ''}:${r.rule?.method ?? ''}:${r.rule?.value ?? ''}`} r={r} scope={scope} id={id} />)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t p-2.5 text-[12px]">
        <Btn sm disabled={page <= 1} onClick={() => setPage(page - 1)}><ArrowLeft size={12} /> Previous</Btn><span className="text-muted-foreground">Page {page}</span>
        <Btn sm disabled={!d?.hasMore} onClick={() => setPage(page + 1)}>Next <ArrowRight size={12} /></Btn>
      </div>
    </Card>
  );
}
