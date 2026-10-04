import { useState } from 'react';
import { useLocation } from 'wouter';
import { Check, Zap, Repeat, CalendarPlus, PauseCircle, RotateCcw, Ban, Pencil, Eye } from 'lucide-react';
import { Btn, ConfirmDialog, Field, Modal } from './ui';
import {
  COUNTRIES, activate, approve, changePlan, editSub, effectiveStatus, extend, fromInput, previewAs, reactivate, revoke, suspend, toInput, useStore,
  type Subscriber, iso, errorMessage,
} from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

type Dlg = null | 'activate' | 'plan' | 'extend' | 'suspend' | 'revoke' | 'edit';

export function SubActions({ sub, full = true }: { sub: Subscriber; full?: boolean }) {
  const st = useStore();
  const { toast } = useToast();
  const [, nav] = useLocation();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [plan, setPlan] = useState(sub.plan);
  const [date, setDate] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ business: sub.business, owner: sub.owner, email: sub.email, username: sub.username, phone: sub.phone, country: sub.country, domain: sub.domain, notes: sub.notes });
  const eff = effectiveStatus(sub);
  const plans = st.plans.filter((p) => p.enabled || p.name === sub.plan);
  const open = (d: Dlg) => {
    setErr('');
    setPlan(plans.find(p => p.name === sub.plan && p.enabled)?.name || plans.find(p => p.enabled)?.name || '');
    const base = sub.expiresAt && new Date(sub.expiresAt) > new Date() ? new Date(sub.expiresAt) : new Date();
    setDate(toInput(d === 'edit' ? sub.expiresAt : d === 'activate' ? iso(365) : new Date(base.getTime() + 30 * 86400000).toISOString()));
    setForm({ business: sub.business, owner: sub.owner, email: sub.email, username: sub.username, phone: sub.phone, country: sub.country, domain: sub.domain, notes: sub.notes });
    setDlg(d);
  };
  const close = () => setDlg(null);
  const t = (title: string) => toast({ title, description: sub.business });
  const perform = async (work: () => Promise<void>, title: string, closeAfter = false) => {
    if (busy) return false;
    setBusy(true); setErr('');
    try { await work(); t(title); if (closeAfter) close(); return true; }
    catch (error) { const message = errorMessage(error); setErr(message); toast({ title: 'Update failed', description: message, variant: 'destructive' }); return false; }
    finally { setBusy(false); }
  };
  const futureOk = () => {
    if (!date || new Date(fromInput(date)).getTime() <= Date.now()) { setErr('Choose an expiration date in the future.'); return false; }
    return true;
  };
  const can = {
    approve: eff === 'PENDING',
    activate: ['PENDING', 'TRIAL', 'EXPIRED', 'REVOKED'].includes(eff),
    plan: ['TRIAL', 'ACTIVE', 'SUSPENDED'].includes(eff),
    extend: ['TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED'].includes(eff),
    suspend: ['TRIAL', 'ACTIVE'].includes(eff),
    reactivate: ['SUSPENDED', 'EXPIRED'].includes(eff),
    revoke: !['REVOKED', 'PENDING'].includes(eff),
  };
  const id = sub.id;
  return (
    <>
      <div className="flex flex-wrap gap-1.5" data-testid={`actions-${id}`} style={busy ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>
        {can.approve && <Btn sm v="ok" data-testid="button-approve" onClick={() => void perform(() => approve(id), 'Approved as Trial')}><Check size={12} />Approve</Btn>}
        {can.activate && <Btn sm v="ok" data-testid="button-activate" onClick={() => open('activate')}><Zap size={12} />Activate</Btn>}
        {can.reactivate && <Btn sm v="ok" data-testid="button-reactivate" onClick={() => void perform(() => reactivate(id), 'Reactivated')}><RotateCcw size={12} />Reactivate</Btn>}
        {can.plan && <Btn sm data-testid="button-change-plan" onClick={() => open('plan')}><Repeat size={12} />Change Plan</Btn>}
        {can.extend && <Btn sm v="primary" data-testid="button-extend" onClick={() => open('extend')}><CalendarPlus size={12} />Extend</Btn>}
        {can.suspend && <Btn sm v="warn" data-testid="button-suspend" onClick={() => open('suspend')}><PauseCircle size={12} />Suspend</Btn>}
        {can.revoke && <Btn sm v="danger" data-testid="button-revoke" onClick={() => open('revoke')}><Ban size={12} />Revoke</Btn>}
        {full && <Btn sm data-testid="button-edit" onClick={() => open('edit')}><Pencil size={12} />Edit</Btn>}
        {full && <Btn sm data-testid="button-preview" onClick={() => { previewAs(id); nav('/'); }}><Eye size={12} />Preview as subscriber</Btn>}
      </div>

      <Modal open={dlg === 'activate'} onClose={close} title={`Activate ${sub.business}`}
        footer={<><Btn onClick={close}>Cancel</Btn><Btn v="ok" disabled={busy || !plan} data-testid="button-activate-confirm" onClick={() => { if (futureOk()) void perform(() => activate(id, plan, fromInput(date)), 'Activated', true); }}>Activate</Btn></>}>
        <Field label="Plan"><select className="input" value={plan} onChange={(e) => setPlan(e.target.value)} data-testid="select-activate-plan">{plans.map((p) => <option key={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Expiration date" error={err}><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-activate-date" /></Field>
        <p className="text-[11.5px] text-muted-foreground">A licence key is issued if the subscriber has none.</p>
      </Modal>

      <Modal open={dlg === 'plan'} onClose={close} title="Change plan"
        footer={<><Btn onClick={close}>Cancel</Btn><Btn v="primary" disabled={busy || !plan} data-testid="button-plan-confirm" onClick={() => void perform(() => changePlan(id, plan), `Plan changed to ${plan}`, true)}>Save plan</Btn></>}>
        <Field label="Plan"><select className="input" value={plan} onChange={(e) => setPlan(e.target.value)} data-testid="select-plan">{plans.map((p) => <option key={p.id}>{p.name}</option>)}</select></Field>
      </Modal>

      <Modal open={dlg === 'extend'} onClose={close} title="Extend subscription"
        footer={<><Btn onClick={close}>Cancel</Btn><Btn v="primary" disabled={busy} data-testid="button-extend-confirm" onClick={() => { if (futureOk()) void perform(() => extend(id, fromInput(date)), 'Subscription extended', true); }}>Save date</Btn></>}>
        <Field label="New expiration date" error={err}><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-extend-date" /></Field>
        {sub.status === 'EXPIRED' && <p className="text-[11.5px] text-muted-foreground">The stored status is Expired; saving a future date will set the subscriber to Active.</p>}
      </Modal>

      <ConfirmDialog open={dlg === 'suspend'} onClose={close} danger confirmLabel="Suspend subscriber" title={`Suspend ${sub.business}?`} onConfirm={() => perform(() => suspend(id), 'Suspended')}
        body={<>The subscriber will immediately lose access to the Unlock Server Panel, including any open session. <b className="text-foreground">No data is deleted</b> and you can reactivate at any time.</>} />
      <ConfirmDialog open={dlg === 'revoke'} onClose={close} danger confirmLabel="Revoke licence" title={`Revoke licence for ${sub.business}?`} onConfirm={() => perform(() => revoke(id), 'Licence revoked')}
        body={<>Panel access is blocked until you activate the subscriber again. <b className="text-foreground">No data is deleted.</b></>} />

      <Modal open={dlg === 'edit'} onClose={close} title="Edit subscriber" width={520}
        footer={<><Btn onClick={close}>Cancel</Btn><Btn v="primary" disabled={busy} data-testid="button-edit-save" onClick={() => { if (!form.business.trim() || !form.owner.trim()) { setErr('Business and owner are required.'); return; } const { domain, ...input } = form; void perform(() => editSub(id, { ...input, ...(date ? { expiresAt: fromInput(date) } : {}) }), 'Subscriber updated', true); }}>Save changes</Btn></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          {([['business', 'Business / server'], ['owner', 'Owner'], ['email', 'Email'], ['username', 'Username'], ['phone', 'Phone'], ['domain', 'Custom domain']] as const).map(([k, l]) => (
            <Field key={k} label={l}><input className="input" disabled={k === 'domain'} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} data-testid={`input-edit-${k}`} /></Field>
          ))}
          <Field label="Country"><select className="input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <Field label="Expiration date" hint="A past date blocks access without deleting data."><input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} data-testid="input-edit-expiry" /></Field>
        <Field label="Notes" error={err}><textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-edit-notes" /></Field>
      </Modal>
    </>
  );
}
