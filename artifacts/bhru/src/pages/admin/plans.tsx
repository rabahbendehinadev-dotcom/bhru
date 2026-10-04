import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { AdminShell } from '@/components/bhru/shells';
import { Card, Btn, Field, Modal, Badge, PlanBadge } from '@/components/bhru/ui';
import { updatePlan, useStore, effectiveStatus, type Plan } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

function Page() {
  const { plans, subscribers } = useStore();
  const { toast } = useToast();
  const [edit, setEdit] = useState<Plan | null>(null);
  const [f, setF] = useState({ name: '', price: '0', description: '', highlights: '', enabled: true });
  const [err, setErr] = useState('');
  const open = (p: Plan) => { setEdit(p); setErr(''); setF({ name: p.name, price: String(p.price), description: p.description, highlights: p.highlights, enabled: p.enabled }); };
  const save = () => {
    const price = Number(f.price);
    if (!f.name.trim() || Number.isNaN(price) || price < 0) { setErr('Enter a name and a valid price.'); return; }
    updatePlan(edit!.id, { name: f.name.trim(), price, description: f.description, highlights: f.highlights, enabled: f.enabled });
    toast({ title: 'Plan saved (demo)' });
    setEdit(null);
  };
  return (
    <div className="space-y-3">
      <div><h1 className="text-[18px] font-semibold">Plans</h1><p className="text-[12.5px] text-muted-foreground">Editable subscription plans. Prices are provisional demo values; no limits are enforced in this iteration.</p></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const n = subscribers.filter((s) => s.plan === p.name && ['ACTIVE', 'TRIAL'].includes(effectiveStatus(s))).length;
          return (
            <Card key={p.id} className="flex flex-col p-4" data-testid={`card-plan-${p.id}`}>
              <div className="flex items-center justify-between"><PlanBadge plan={p.name} />{!p.enabled && <Badge tone="gray">Disabled</Badge>}</div>
              <div className="mt-3 text-[26px] font-semibold tabular-nums" data-testid={`text-price-${p.id}`}>${p.price}<span className="text-[12px] font-normal text-muted-foreground"> / month</span></div>
              <Badge tone="orange">Provisional price</Badge>
              <p className="mt-3 text-[12.5px]">{p.description}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{p.highlights}</p>
              <div className="mt-3 text-[12px] text-muted-foreground">{n} live subscribers</div>
              <Btn className="mt-3" onClick={() => open(p)} data-testid={`button-edit-plan-${p.id}`}><Pencil size={12} /> Edit plan</Btn>
            </Card>
          );
        })}
      </div>
      <Card className="p-3.5 text-[12px] text-muted-foreground">Planned for later: limits on customers, staff, services, API providers, custom domain, white label and reports. Not enforced in the demo.</Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit plan" footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn v="primary" onClick={save} data-testid="button-save-plan">Save</Btn></>}>
        <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="input-plan-name" /></Field>
        <Field label="Monthly price (USD, provisional)" error={err}><input className="input" type="number" min="0" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} data-testid="input-plan-price" /></Field>
        <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Highlights"><input className="input" value={f.highlights} onChange={(e) => setF({ ...f, highlights: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />Available for assignment</label>
      </Modal>
    </div>
  );
}
export default function Plans() { return <AdminShell><Page /></AdminShell>; }
