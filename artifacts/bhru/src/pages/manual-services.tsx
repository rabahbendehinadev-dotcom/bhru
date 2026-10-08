import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, Trash2, Boxes } from 'lucide-react';
import { Btn, Card, Field, Modal, Badge } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { errText } from '@/hooks/use-commerce';
import { useManualServices, useServiceGroups, useServiceMutations, type ManualService, type Requirement, type ServiceType } from '@/hooks/use-services';
import type { ManualServiceInput } from '@workspace/api-client-react';

const TYPES: ServiceType[] = ['imei', 'server', 'file', 'remote'];
const REQ_TYPES: Requirement['type'][] = ['text', 'textarea', 'number', 'select', 'imei', 'reference'];
const PRICE = /^\d{1,10}(\.\d{1,12})?$/;
const KEY = /^[a-z][a-z0-9_]{0,31}$/;

interface ReqRow { key: string; label: string; type: Requirement['type']; required: boolean; options: string }
const blank = (type: ServiceType) => ({ name: '', serviceType: type, groupId: '' as string, description: '', priceUsd: '0', estimatedTime: '', active: true, displayOrder: '0', reqs: [] as ReqRow[] });

function ServiceForm({ initial, type, onClose }: { initial: ManualService | null; type: ServiceType; onClose: () => void }) {
  const { rows: groups } = useServiceGroups();
  const { create, update, createGroup } = useServiceMutations();
  const [f, setF] = useState(() => initial ? {
    name: initial.name, serviceType: initial.serviceType, groupId: initial.groupId ?? '', description: initial.description ?? '', priceUsd: initial.priceUsd, estimatedTime: initial.estimatedTime ?? '',
    active: initial.active, displayOrder: String(initial.displayOrder ?? 0),
    reqs: (initial.requirements ?? []).map((r) => ({ key: r.key, label: r.label, type: r.type, required: r.required, options: (r.options ?? []).join('\n') })),
  } : blank(type));
  const [err, setErr] = useState('');
  const [grp, setGrp] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setErr(''); setF((p) => ({ ...p, [k]: v })); };
  const setReq = (i: number, patch: Partial<ReqRow>) => { setErr(''); setF((p) => ({ ...p, reqs: p.reqs.map((r, j) => (j === i ? { ...r, ...patch } : r)) })); };
  const busy = create.isPending || update.isPending;

  const addGroup = async () => {
    const name = grp.trim();
    if (!name) return;
    try { const g = await createGroup.mutateAsync({ data: { name } }) as unknown as { id: string }; setGrp(''); set('groupId', g.id); } catch (e) { setErr(errText(e)); }
  };
  const save = async () => {
    const price = f.priceUsd.trim();
    if (!f.name.trim()) return setErr('Name is required.');
    if (!PRICE.test(price)) return setErr('Price must be a decimal with up to 10 integer and 12 fractional digits.');
    const order = Number(f.displayOrder);
    if (!Number.isInteger(order) || order < 0 || order > 100000) return setErr('Display order must be a whole number from 0 to 100000.');
    if (f.reqs.length > 12) return setErr('At most 12 requirement fields.');
    const seen = new Set<string>();
    const requirements: Requirement[] = [];
    for (const r of f.reqs) {
      const key = r.key.trim();
      if (!KEY.test(key)) return setErr(`Field key "${key}" must be lowercase: start with a letter, then letters, digits or underscores (max 32).`);
      if (seen.has(key)) return setErr(`Duplicate field key "${key}".`);
      seen.add(key);
      if (!r.label.trim()) return setErr(`Field "${key}" needs a label.`);
      const options = r.type === 'select' ? r.options.split('\n').map((o) => o.trim()).filter(Boolean) : undefined;
      if (r.type === 'select' && (!options || options.length === 0)) return setErr(`Select field "${key}" needs at least one option.`);
      if (options && options.length > 50) return setErr(`Field "${key}" has more than 50 options.`);
      requirements.push({ key, label: r.label.trim(), type: r.type, required: r.required, ...(options ? { options } : {}) });
    }
    const data: ManualServiceInput = { name: f.name.trim(), serviceType: f.serviceType, groupId: f.groupId || null, description: f.description, priceUsd: price, estimatedTime: f.estimatedTime, active: f.active, displayOrder: order, requirements };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, data }); else await create.mutateAsync({ data });
      onClose();
    } catch (e) { setErr(errText(e)); }
  };
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit service' : 'Add service'} width={680}
      footer={<><Btn onClick={onClose} data-testid="button-service-cancel">Cancel</Btn><Btn v="brand" disabled={busy} onClick={() => void save()} data-testid="button-service-save">{busy ? 'Saving...' : 'Save service'}</Btn></>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className="input" maxLength={160} value={f.name} onChange={(e) => set('name', e.target.value)} data-testid="input-service-name" /></Field>
          <Field label="Service family"><select className="input" value={f.serviceType} onChange={(e) => set('serviceType', e.target.value as ServiceType)} data-testid="select-service-type">{TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></Field>
          <Field label="Price (USD)" hint="Exact decimal string, stored as typed."><input className="input font-mono" inputMode="decimal" value={f.priceUsd} onChange={(e) => set('priceUsd', e.target.value)} data-testid="input-service-price" /></Field>
          <Field label="Estimated time"><input className="input" maxLength={100} value={f.estimatedTime} onChange={(e) => set('estimatedTime', e.target.value)} placeholder="e.g. 1-24 hours" data-testid="input-service-time" /></Field>
          <Field label="Group"><select className="input" value={f.groupId} onChange={(e) => set('groupId', e.target.value)} data-testid="select-service-group"><option value="">No group</option>{(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          <Field label="Display order"><input className="input" inputMode="numeric" value={f.displayOrder} onChange={(e) => set('displayOrder', e.target.value)} data-testid="input-service-order" /></Field>
        </div>
        <div className="flex gap-2"><input className="input" maxLength={100} value={grp} onChange={(e) => setGrp(e.target.value)} placeholder="New group name" aria-label="New group name" data-testid="input-group-name" /><Btn sm disabled={createGroup.isPending || !grp.trim()} onClick={() => void addGroup()} data-testid="button-group-create">Create group</Btn></div>
        <Field label="Description"><textarea className="input min-h-[70px]" maxLength={4000} value={f.description} onChange={(e) => set('description', e.target.value)} data-testid="input-service-description" /></Field>
        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} data-testid="checkbox-service-active" /> Enabled (customers can order it)</label>
        <div>
          <div className="mb-1 flex items-center justify-between"><span className="lbl">Customer requirement fields ({f.reqs.length}/12)</span>
            <Btn sm disabled={f.reqs.length >= 12} onClick={() => set('reqs', [...f.reqs, { key: '', label: '', type: 'text', required: true, options: '' }])} data-testid="button-req-add"><Plus size={12} /> Add field</Btn></div>
          <div className="space-y-2">{f.reqs.map((r, i) => (
            <div key={i} className="space-y-2 rounded-md border p-2" data-testid={`req-row-${i}`}>
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px]">
                <input className="input font-mono" aria-label="Field key" placeholder="key (lowercase)" maxLength={32} value={r.key} onChange={(e) => setReq(i, { key: e.target.value.toLowerCase() })} data-testid={`input-req-key-${i}`} />
                <input className="input" aria-label="Field label" placeholder="Label" maxLength={100} value={r.label} onChange={(e) => setReq(i, { label: e.target.value })} data-testid={`input-req-label-${i}`} />
                <select className="input" aria-label="Field type" value={r.type} onChange={(e) => setReq(i, { type: e.target.value as Requirement['type'] })} data-testid={`select-req-type-${i}`}>{REQ_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              </div>
              {r.type === 'select' && <textarea className="input min-h-[60px]" aria-label="Options, one per line" placeholder="One option per line (max 50)" value={r.options} onChange={(e) => setReq(i, { options: e.target.value })} data-testid={`input-req-options-${i}`} />}
              <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={r.required} onChange={(e) => setReq(i, { required: e.target.checked })} /> Required</label>
                <Btn sm v="danger" onClick={() => set('reqs', f.reqs.filter((_, j) => j !== i))} aria-label="Remove field" data-testid={`button-req-remove-${i}`}><Trash2 size={12} /></Btn></div>
            </div>))}</div>
        </div>
        {err && <p role="alert" className="text-[12px] text-danger" data-testid="text-service-error">{err}</p>}
      </div>
    </Modal>
  );
}

export default function ManualServicesPage({ type, title }: { type: ServiceType; title: string }) {
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState('');
  const { rows: groups } = useServiceGroups();
  const q = useManualServices({ serviceType: type, page, ...(search ? { search } : {}), ...(groupId ? { groupId } : {}), ...(status ? { status } : {}) });
  const { update } = useServiceMutations();
  const [edit, setEdit] = useState<ManualService | 'new' | null>(null);
  const [err, setErr] = useState('');
  const rows = useMemo(() => q.rows ?? [], [q.rows]);
  const toggle = async (s: ManualService) => {
    setErr('');
    const data: ManualServiceInput = { name: s.name, serviceType: s.serviceType, groupId: s.groupId ?? null, description: s.description ?? '', priceUsd: s.priceUsd, estimatedTime: s.estimatedTime ?? '', active: !s.active, displayOrder: s.displayOrder, requirements: s.requirements ?? [] };
    try { await update.mutateAsync({ id: s.id, data }); } catch (e) { setErr(errText(e)); }
  };
  return (
    <div data-testid={`manual-services-${type}`}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">{title}</h1><p className="text-[12.5px] text-[hsl(var(--text-secondary))]">Manual services your clients order and you fulfil by hand.</p></div>
        <div className="flex gap-2"><Btn sm disabled={q.isFetching} onClick={() => void q.refetch()} data-testid="button-services-refresh">Refresh</Btn><Btn v="brand" sm onClick={() => setEdit('new')} data-testid="button-service-add"><Plus size={12} /> Add service</Btn></div>
      </div>
      {err && <p role="alert" className="mb-2 text-[12px] text-danger">{err}</p>}
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b p-2.5" onSubmit={(e) => { e.preventDefault(); setSearch(text.trim()); setPage(1); }}>
          <input className="input min-w-[180px] flex-1" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search services..." aria-label="Search services" data-testid="input-service-search" />
          <select className="input w-auto" value={groupId} onChange={(e) => { setGroupId(e.target.value); setPage(1); }} aria-label="Group filter" data-testid="select-service-group-filter"><option value="">All groups</option>{(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status filter" data-testid="select-service-status"><option value="">All statuses</option><option value="active">Enabled</option><option value="inactive">Disabled</option></select>
          <Btn type="submit" v="brand" sm data-testid="button-service-search">Search</Btn>
        </form>
        {q.isLoading ? <div className="space-y-2 p-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-white/5" />)}</div>
          : q.isError || !q.rows ? <div className="flex flex-col items-center gap-2 p-8 text-center" role="alert"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(q.error)}</p><Btn sm onClick={() => void q.refetch()} data-testid="button-services-retry">Try again</Btn></div>
            : rows.length === 0 ? <EmptyState compact icon={<Boxes size={18} />} title={`No ${type.toUpperCase()} services yet`} description="Add a service to make it orderable from your public customer panel." action={<Btn v="brand" sm onClick={() => setEdit('new')}>Add service</Btn>} />
              : <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th>Service</th><th>Group</th><th>Price (USD)</th><th>Time</th><th>Fields</th><th>Order</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>{rows.map((s) => (
                  <tr key={s.id} data-testid={`row-service-${s.id}`}><td className="min-w-[180px] font-semibold">{s.name}</td><td>{s.groupName || '-'}</td><td className="font-mono">{s.formattedPrice ?? s.priceUsd}</td><td>{s.estimatedTime || '-'}</td><td>{s.requirements?.length ?? 0}</td><td>{s.displayOrder}</td>
                    <td><Badge tone={s.active ? 'green' : 'gray'}>{s.active ? 'Enabled' : 'Disabled'}</Badge></td>
                    <td className="whitespace-nowrap"><Btn sm onClick={() => setEdit(s)} data-testid={`button-service-edit-${s.id}`}>Edit</Btn>{' '}<Btn sm v={s.active ? 'warn' : 'ok'} disabled={update.isPending} onClick={() => void toggle(s)} data-testid={`button-service-toggle-${s.id}`}>{s.active ? 'Disable' : 'Enable'}</Btn></td></tr>))}</tbody></table></div>}
        <div className="flex items-center justify-between border-t p-2.5 text-[12px]"><Btn sm disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-services-prev">Previous</Btn><span className="text-muted-foreground">Page {page}</span><Btn sm disabled={!q.hasMore} onClick={() => setPage(page + 1)} data-testid="button-services-next">Next</Btn></div>
      </Card>
      {edit && <ServiceForm initial={edit === 'new' ? null : edit} type={type} onClose={() => setEdit(null)} />}
    </div>
  );
}
