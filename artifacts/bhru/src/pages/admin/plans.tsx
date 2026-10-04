import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { AdminShell } from '@/components/bhru/shells';
import { Card, Btn, Field, Modal, Badge, PlanBadge } from '@/components/bhru/ui';
import { updatePlan, createPlan, errorMessage, useStore, effectiveStatus, type Plan } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

function Page() {
  const { plans, subscribers } = useStore();
  const { toast } = useToast();
  const [edit, setEdit] = useState<Plan | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: '', price: '0', description: '', highlights: '', enabled: true });
  const [err, setErr] = useState('');
  const open = (p: Plan) => { setEdit(p); setErr(''); setF({ name: p.name, price: String(p.price), description: p.description, highlights: p.highlights, enabled: p.enabled }); };
  const save = async () => {
    if (busy) return;
    const price = Number(f.price);
    if (!f.name.trim() || Number.isNaN(price) || price < 0) { setErr('Enter a name and a valid price.'); return; }
    setBusy(true);
    try {
      const input = { name: f.name.trim(), price, description: f.description, highlights: f.highlights, enabled: f.enabled };
      if (creating) await createPlan(input); else await updatePlan(edit!.id, input);
      toast({ title: 'Plan saved' }); setEdit(null); setCreating(false);
    } catch (error) { setErr(errorMessage(error)); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3"><div><h1 className="text-[18px] font-semibold">Plans</h1><p className="text-[12.5px] text-muted-foreground">Saved subscription plans. Enable or disable availability for new assignments.</p></div><Btn v="primary" data-testid="button-create-plan" onClick={() => { setEdit(null); setCreating(true); setErr(''); setF({ name: '', price: '0', description: '', highlights: '', enabled: true }); }}><Plus size={13} />Create plan</Btn></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const n = subscribers.filter((s) => s.plan === p.name && ['ACTIVE', 'TRIAL'].includes(effectiveStatus(s))).length;
          return (
            <Card key={p.id} className="flex flex-col p-4" data-testid={`card-plan-${p.id}`}>
              <div className="flex items-center justify-between"><PlanBadge plan={p.name} />{!p.enabled && <Badge tone="gray">Disabled</Badge>}</div>
              <div className="mt-3 text-[26px] font-semibold tabular-nums" data-testid={`text-price-${p.id}`}>${p.price}<span className="text-[12px] font-normal text-muted-foreground"> / month</span></div>
              <p className="mt-3 text-[12.5px]">{p.description}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{p.highlights}</p>
              <div className="mt-3 text-[12px] text-muted-foreground">{n} live subscribers</div>
              <Btn className="mt-3" onClick={() => open(p)} data-testid={`button-edit-plan-${p.id}`}><Pencil size={12} /> Edit plan</Btn>
            </Card>
          );
        })}
      </div>
      <Card className="p-3.5 text-[12px] text-muted-foreground">Business-module limits, billing and domain automation remain planned for later. Disabled plans cannot be newly assigned; existing licences are retained.</Card>
      <Modal open={!!edit || creating} onClose={() => { setEdit(null); setCreating(false); }} title={creating ? 'Create plan' : 'Edit plan'} footer={<><Btn onClick={() => { setEdit(null); setCreating(false); }}>Cancel</Btn><Btn v="primary" disabled={busy} onClick={save} data-testid="button-save-plan">{busy ? 'Saving...' : 'Save'}</Btn></>}>
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-plan-name" /></Field>
        <Field label="Monthly price (USD)" error={err}><input className="input" type="number" step="0.01" min="0" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} data-testid="input-plan-price" /></Field>
        <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Highlights"><input className="input" value={f.highlights} onChange={(e) => setF({ ...f, highlights: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />Available for assignment</label>
      </Modal>
    </div>
  );
}
export default function Plans() { return <AdminShell><Page /></AdminShell>; }
