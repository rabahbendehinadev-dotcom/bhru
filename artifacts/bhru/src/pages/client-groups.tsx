import { useMemo, useState } from 'react';
import { AlertTriangle, Layers } from 'lucide-react';
import { Btn, Card, ConfirmDialog, Field } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { useClientGroups } from '@/hooks/use-services';
import { useGroupAdmin } from '@/hooks/use-pricing';
import { errText } from '@/hooks/use-commerce';
import { PricingTable } from '@/pages/pricing-table';
import { ServiceAccessTable } from '@/pages/service-access-table';

type G = { id: string; name: string; description: string; active: boolean; isDefault: boolean; sortOrder: number; customerCount: number; pricingRuleCount: number };

export default function ClientGroupsManager() {
  const q = useClientGroups();
  const a = useGroupAdmin();
  const rows = q.rows as G[] | undefined;
  const [search, setSearch] = useState('');
  const [flt, setFlt] = useState<'' | 'active' | 'inactive'>('');
  const [edit, setEdit] = useState<G | 'new' | null>(null);
  const [f, setF] = useState({ name: '', description: '', active: true, sortOrder: '0' });
  const [pricing, setPricing] = useState<string | null>(null);
  const [access, setAccess] = useState<string | null>(null);
  const [del, setDel] = useState<G | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [formErr, setFormErr] = useState('');
  const shown = useMemo(() => (rows ?? []).filter((g) => (!search || g.name.toLowerCase().includes(search.toLowerCase())) && (!flt || g.active === (flt === 'active'))), [rows, search, flt]);
  const open = (g: G | 'new') => { setEdit(g); setFormErr(''); setF(g === 'new' ? { name: '', description: '', active: true, sortOrder: '0' } : { name: g.name, description: g.description, active: g.active, sortOrder: String(g.sortOrder) }); };
  const run = async (p: Promise<unknown>, ok: string) => { setMsg(null); try { await p; setMsg({ ok: true, t: ok }); } catch (e) { setMsg({ ok: false, t: errText(e) }); } };
  const submit = async () => {
    const name = f.name.trim(); const so = Number(f.sortOrder);
    if (!name) return setFormErr('Enter a group name.');
    if (!Number.isInteger(so) || so < 0 || so > 100000) return setFormErr('Sort order must be a whole number from 0 to 100000.');
    const data = { name, description: f.description.trim(), active: f.active, sortOrder: so };
    try { if (edit === 'new') await a.create.mutateAsync({ data }); else if (edit) await a.update.mutateAsync({ id: edit.id, data }); setEdit(null); setMsg({ ok: true, t: 'Group saved.' }); } catch (e) { setFormErr(errText(e)); }
  };
  const saving = a.create.isPending || a.update.isPending;
  const pg = rows?.find((g) => g.id === pricing);
  return (
    <div data-testid="client-groups-page">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">Client Groups</h1>
        <p className="text-[12.5px] text-[hsl(var(--text-secondary))]">Group clients and set exact per-service pricing.</p></div>
        <Btn v="brand" onClick={() => open('new')} data-testid="button-group-new">New group</Btn></div>
      <Card className="mb-3 flex flex-wrap gap-2 p-2.5">
        <input className="input min-w-[200px] flex-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search groups..." aria-label="Search groups" data-testid="input-group-search" />
        <select className="input w-auto" value={flt} onChange={(e) => setFlt(e.target.value as typeof flt)} aria-label="Group status" data-testid="select-group-filter"><option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
      </Card>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mb-2 text-[12px] ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.t}</p>}
      <Card>
        {q.isLoading ? <div className="space-y-2 p-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-white/5" />)}</div>
          : q.isError || !rows ? <div role="alert" className="flex flex-col items-center gap-2 p-8 text-center"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(q.error)}</p><Btn sm onClick={() => void q.refetch()}>Try again</Btn></div>
          : shown.length === 0 ? <EmptyState compact icon={<Layers size={18} />} title={rows.length ? 'No groups match' : 'No client groups yet'} description="Create a group, then assign clients and set pricing." />
          : <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th>Group</th><th>Status</th><th>Clients</th><th>Rules</th><th>Actions</th></tr></thead><tbody>
            {shown.map((g) => <tr key={g.id} data-testid={`row-group-${g.id}`}>
              <td className="min-w-[160px]"><span className="font-semibold">{g.name}</span>{g.isDefault && <span className="badge ml-1.5 bg-ok/20">Default</span>}<div className="text-[11px] text-muted-foreground">{g.description}</div></td>
              <td><span className={`badge ${g.active ? 'bg-ok/20' : 'bg-danger/20'}`}>{g.active ? 'Active' : 'Inactive'}</span></td>
              <td>{g.customerCount}</td><td>{g.pricingRuleCount}</td>
              <td><div className="flex flex-wrap gap-1">
                <Btn sm onClick={() => setPricing(pricing === g.id ? null : g.id)} data-testid={`button-group-pricing-${g.id}`}>Pricing</Btn>
                <Btn sm onClick={() => setAccess(access === g.id ? null : g.id)} data-testid={`button-group-access-${g.id}`}>Access</Btn>
                <Btn sm onClick={() => open(g)} data-testid={`button-group-edit-${g.id}`}>Edit</Btn>
                {!g.isDefault && <Btn sm disabled={a.update.isPending} onClick={() => void run(a.update.mutateAsync({ id: g.id, data: { name: g.name, description: g.description, sortOrder: g.sortOrder, active: !g.active } }), g.active ? 'Group deactivated.' : 'Group activated.')} data-testid={`button-group-toggle-${g.id}`}>{g.active ? 'Deactivate' : 'Activate'}</Btn>}
                {!g.isDefault && <Btn sm disabled={!g.active || a.makeDefault.isPending} title={g.active ? undefined : 'Only active groups can be default'} onClick={() => void run(a.makeDefault.mutateAsync({ id: g.id, data: {} }), 'Default group changed. Existing clients keep their groups.')} data-testid={`button-group-default-${g.id}`}>Make default</Btn>}
                {!g.isDefault && g.customerCount === 0 && g.pricingRuleCount === 0 && <Btn sm v="danger" onClick={() => setDel(g)} data-testid={`button-group-delete-${g.id}`}>Delete</Btn>}
              </div></td></tr>)}</tbody></table></div>}
      </Card>
      {pg && <div className="mt-3"><h2 className="mb-1.5 text-[14px] font-semibold">Pricing: {pg.name}</h2><PricingTable key={pg.id} scope="group" id={pg.id} /></div>}
      {rows?.find((g) => g.id === access) && <div className="mt-3"><h2 className="mb-1.5 text-[14px] font-semibold">Access / Service Permissions: {rows.find((g) => g.id === access)?.name}</h2><ServiceAccessTable key={access} scope="group" id={access!} /></div>}
      {edit && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true"><Card className="w-full max-w-md space-y-3 p-4">
        <h2 className="text-[15px] font-semibold">{edit === 'new' ? 'New group' : 'Edit group'}</h2>
        <Field label="Name"><input className="input" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-group-name" /></Field>
        <Field label="Description"><textarea className="input min-h-[60px]" maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="input-group-description" /></Field>
        <Field label="Sort order"><input className="input" inputMode="numeric" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: e.target.value })} data-testid="input-group-sort" /></Field>
        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" disabled={edit !== "new" && edit?.isDefault === true} checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} data-testid="checkbox-group-active" /> Active</label>
        {formErr && <p role="alert" className="text-[12px] text-danger">{formErr}</p>}
        <div className="flex justify-end gap-2"><Btn onClick={() => setEdit(null)} data-testid="button-group-cancel">Cancel</Btn><Btn v="brand" disabled={saving} onClick={() => void submit()} data-testid="button-group-save">{saving ? 'Saving...' : 'Save'}</Btn></div>
      </Card></div>}
      <ConfirmDialog open={!!del} title="Delete this group?" body="Only unused, non-default groups can be deleted." confirmLabel="Delete" danger onConfirm={async () => { if (!del) return; try { await a.remove.mutateAsync({ id: del.id }); setMsg({ ok: true, t: 'Group deleted.' }); } catch (e) { setMsg({ ok: false, t: errText(e) }); } }} onClose={() => setDel(null)} />
    </div>
  );
}
