import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { Btn, Card } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { useAccessAdmin, useAccessPreview, useCustomerAccess, useGroupAccess } from '@/hooks/use-service-access';
import { errText } from '@/hooks/use-commerce';

type Effect = 'INHERIT' | 'ALLOW' | 'DENY';
type Pol = { id: string; effect: 'ALLOW' | 'DENY' } | null;
type Row = { id: string; name: string; categoryId: string | null; categoryName: string | null; serviceType: string | null; globallyAvailable: boolean; policy: Pol; groupPolicy: Pol; hasPricingRule: boolean; effective: { allowed: boolean; reasonCode: string; source: string; matchedPolicyId: string | null } };
type Data = { data: Row[]; hasMore: boolean; currentGroup: { id: string; name: string; active: boolean } | null; categories: { id: string; name: string; enabled: boolean }[] };
const MAX = 50;
const TYPES = ['imei', 'server', 'file', 'remote'] as const;
const label = (s: string) => s.replace(/_/g, ' ').toLowerCase();

function Preview({ id, services }: { id: string; services: Row[] }) {
  const [sid, setSid] = useState('');
  const serviceIds = services.map((r) => r.id).join(',');
  useEffect(() => { setSid(''); }, [id, serviceIds]);
  const svc = services;
  const p = useAccessPreview(id, sid);
  const x = p.data;
  return (
    <Card className="mt-3 space-y-2 p-3.5" data-testid="access-preview"><h2 className="text-[13px] font-semibold">Client access preview</h2>
      <select className="input w-auto min-w-[220px] max-w-full" value={sid} onChange={(e) => setSid(e.target.value)} aria-label="Preview service" data-testid="select-access-preview-service"><option value="">Select a service</option>{svc.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
      {sid && p.isLoading && <div className="h-10 animate-pulse rounded bg-white/5" aria-busy="true" />}
      {sid && p.isError && <p role="alert" className="text-[12px] text-danger">{errText(p.error)} <Btn sm onClick={() => void p.refetch()}>Retry</Btn></p>}
      {sid && x && <p className="text-[12.5px]" data-testid="text-access-preview"><span className={`badge ${x.allowed ? 'bg-ok/20' : 'bg-danger/20'}`}>{x.allowed ? 'Allowed' : 'Blocked'}</span> <span className="text-muted-foreground">{label(x.source)} · {label(x.reasonCode)}</span></p>}
    </Card>
  );
}

export function ServiceAccessTable({ scope, id }: { scope: 'group' | 'customer'; id: string }) {
  const [mode, setMode] = useState<'SERVICE' | 'CATEGORY'>('SERVICE');
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, Effect>>({});
  const [bulk, setBulk] = useState<Effect>('ALLOW');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const params = { targetType: mode, page, ...(search ? { search } : {}), ...(mode === 'SERVICE' && cat ? { categoryId: cat } : {}), ...(mode === 'SERVICE' && type ? { serviceType: type as typeof TYPES[number] } : {}) };
  const g = useGroupAccess(scope === 'group' ? id : '', params);
  const c = useCustomerAccess(scope === 'customer' ? id : '', params);
  const q = scope === 'group' ? g : c;
  const d = q.data as Data | undefined;
  const adm = useAccessAdmin();
  const mut = scope === 'group' ? adm.group : adm.customer;
  useEffect(() => { setSel([]); setDraft({}); }, [mode, page, search, cat, type, id, scope]);
  const own = (r: Row): Effect => draft[r.id] ?? r.policy?.effect ?? 'INHERIT';
  const save = async (ids: string[], effect: Effect) => {
    setMsg(null);
    try { await mut.mutateAsync({ id, data: { targetType: mode, targetIds: ids, effect } }); setMsg({ ok: true, t: ids.length > 1 ? `Saved ${ids.length} rules.` : 'Saved.' }); setSel([]); setDraft((p) => { const n = { ...p }; ids.forEach((i) => delete n[i]); return n; }); }
    catch (e) { setMsg({ ok: false, t: errText(e) }); }
  };
  const rows = d?.data ?? [];
  const toggle = (rid: string) => setSel((s) => (s.includes(rid) ? s.filter((x) => x !== rid) : s.length >= MAX ? s : [...s, rid]));
  const allOn = rows.length > 0 && rows.every((r) => sel.includes(r.id));
  const grp = d?.currentGroup && d.currentGroup.active ? d.currentGroup : null;
  const pill = (p: Pol) => p && <span className={`badge ${p.effect === 'ALLOW' ? 'bg-ok/20' : 'bg-danger/20'}`}>{p.effect === 'ALLOW' ? 'Allow' : 'Deny'}</span>;
  return (
    <div data-testid={`access-${scope}`}>
      <Card>
        <form className="flex flex-wrap gap-2 border-b p-2.5" onSubmit={(e) => { e.preventDefault(); setSearch(text.trim()); setPage(1); }}>
          <select className="input w-auto" value={mode} onChange={(e) => { setMode(e.target.value as typeof mode); setPage(1); setCat(''); setType(''); }} aria-label="Target" data-testid="select-access-mode"><option value="SERVICE">Services</option><option value="CATEGORY">Categories</option></select>
          <input className="input min-w-[160px] flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder={mode === 'SERVICE' ? 'Search services...' : 'Search categories...'} aria-label="Search access" data-testid="input-access-search" />
          {mode === 'SERVICE' && <select className="input w-auto" value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} aria-label="Category" data-testid="select-access-category"><option value="">All categories</option>{(d?.categories ?? []).map((k) => <option key={k.id} value={k.id}>{k.name}{k.enabled ? '' : ' (off)'}</option>)}</select>}
          {mode === 'SERVICE' && <select className="input w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type" data-testid="select-access-type"><option value="">All types</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
          <Btn type="submit" v="brand" sm data-testid="button-access-search">Search</Btn>
        </form>
        {scope === 'customer' && d && <p className="border-b px-2.5 py-1.5 text-[11.5px] text-muted-foreground" data-testid="text-access-group">{d.currentGroup ? `${d.currentGroup.name} · ${d.currentGroup.active ? 'Active. Group policies apply unless overridden by customer rules.' : 'Inactive. Group policies are ignored; membership is retained.'}` : 'No active group policy applies.'}</p>}
        {sel.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b p-2.5 text-[12px]" data-testid="access-bulk"><span>{sel.length} selected (max {MAX})</span>
          <select className="input w-auto" value={bulk} onChange={(e) => setBulk(e.target.value as Effect)} aria-label="Bulk policy" data-testid="select-access-bulk"><option value="ALLOW">Allow</option><option value="DENY">Deny</option><option value="INHERIT">Inherit (remove)</option></select>
          <Btn sm v="brand" disabled={mut.isPending} onClick={() => void save(sel, bulk)} data-testid="button-access-bulk-save">{mut.isPending ? 'Saving...' : 'Apply to selected'}</Btn><Btn sm onClick={() => setSel([])}>Clear</Btn></div>}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`px-2.5 pt-2 text-[12px] ${msg.ok ? 'text-ok' : 'text-danger'}`} data-testid="text-access-message">{msg.t}</p>}
        {q.isLoading ? <div className="space-y-2 p-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-white/5" />)}</div>
          : q.isError || !d ? <div role="alert" className="flex flex-col items-center gap-2 p-8 text-center"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(q.error)}</p><Btn sm onClick={() => void q.refetch()}>Try again</Btn></div>
          : rows.length === 0 ? <EmptyState compact icon={<ShieldCheck size={18} />} title={search || cat || type ? 'Nothing matches' : mode === 'SERVICE' ? 'No services yet' : 'No categories yet'} description="Services and categories from your catalog appear here." />
          : <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr>
            <th><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : rows.slice(0, MAX).map((r) => r.id))} aria-label="Select all" data-testid="checkbox-access-all" /></th>
            <th>{mode === 'SERVICE' ? 'Service' : 'Category'}</th><th>Global</th>{scope === 'customer' && <th>Group</th>}<th>Own policy</th><th>Effective</th></tr></thead><tbody>
            {rows.map((r) => { const cur = own(r); const dirty = cur !== (r.policy?.effect ?? 'INHERIT'); return (
              <tr key={r.id} data-testid={`row-access-${r.id}`}>
                <td><input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} data-testid={`checkbox-access-${r.id}`} /></td>
                <td className="min-w-[160px]"><div className="font-semibold">{r.name}</div>{mode === 'SERVICE' && <div className="text-[11px] text-muted-foreground">{[r.categoryName, r.serviceType].filter(Boolean).join(' · ')}</div>}{r.hasPricingRule && <span className="badge mt-0.5" data-testid={`badge-access-pricing-${r.id}`}>Custom pricing</span>}</td>
                <td><span className={`badge ${r.globallyAvailable ? 'bg-ok/20' : 'bg-danger/20'}`}>{r.globallyAvailable ? 'Available' : 'Off'}</span></td>
                {scope === 'customer' && <td>{grp && r.groupPolicy ? pill(r.groupPolicy) : <span className="text-muted-foreground">-</span>}</td>}
                <td><div className="flex flex-wrap items-center gap-1.5"><select className="input w-auto" value={cur} onChange={(e) => { setMsg(null); setDraft({ ...draft, [r.id]: e.target.value as Effect }); }} aria-label={`Policy for ${r.name}`} data-testid={`select-access-${r.id}`}><option value="INHERIT">Inherit</option><option value="ALLOW">Allow</option><option value="DENY">Deny</option></select>
                  <Btn sm v="brand" disabled={!dirty || mut.isPending} onClick={() => void save([r.id], cur)} data-testid={`button-access-save-${r.id}`}>Save</Btn></div></td>
                <td><span className={`badge ${r.effective.allowed ? 'bg-ok/20' : 'bg-danger/20'}`} data-testid={`text-access-effective-${r.id}`}>{r.effective.allowed ? 'Allowed' : 'Blocked'}</span><div className="text-[11px] text-muted-foreground">{label(r.effective.source)}</div></td>
              </tr>); })}</tbody></table></div>}
        <div className="flex items-center justify-between border-t p-2.5 text-[12px]">
          <Btn sm disabled={page <= 1} onClick={() => setPage(page - 1)}><ArrowLeft size={12} /> Previous</Btn><span className="text-muted-foreground">Page {page}</span>
          <Btn sm disabled={!d?.hasMore} onClick={() => setPage(page + 1)}>Next <ArrowRight size={12} /></Btn></div>
      </Card>
      {scope === 'customer' && mode === 'SERVICE' && d && <Preview id={id} services={rows} />}
    </div>
  );
}
