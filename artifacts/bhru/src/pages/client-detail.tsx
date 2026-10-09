import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Btn, Card, ConfirmDialog, Field } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { useClientDetail, useClientMutations } from '@/hooks/use-clients';
import { ClientActivityPanel } from './client-activity';
import { errText } from '@/hooks/use-commerce';
import { FinancialPanel, ClientOrdersPanel, ClientGroupAssign } from '@/pages/client-finance';
import { clientName } from '@/pages/clients';
import type { ResellerClientDetail, ResellerClientProfileInput } from '@workspace/api-client-react';

const TABS = ['Overview', 'Financial', 'Profile', 'Orders', 'Activity', 'Notes'] as const;
type Tab = typeof TABS[number];
const when = (s?: string | null) => { if (!s) return '-'; const d = new Date(s); return Number.isNaN(+d) ? '-' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b py-1.5 text-[12.5px] last:border-0"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{v || '-'}</dd></div>;
}

const fmt = (d: ResellerClientDetail, f: string, raw: string) => { const x = d.financial as unknown as Record<string, string>; return x[f] ?? x[raw] ?? d.financial.formattedZero; };

function toInput(c: ResellerClientDetail['client']): ResellerClientProfileInput {
  return {
    firstName: c.firstName, lastName: c.lastName, username: c.username ?? c.clientCode ?? '', whatsappPhone: c.whatsappPhone ?? null,
    preferredLanguage: c.preferredLanguage ?? null, preferredCurrency: c.preferredCurrency ?? null, newsletterOptIn: c.newsletterOptIn === true,
    addressLine1: c.addressLine1 ?? null, addressLine2: c.addressLine2 ?? null, countryCode: c.countryCode ?? null,
    state: c.state ?? null, city: c.city ?? null, postalCode: c.postalCode ?? null,
  };
}

function ProfileForm({ id, d }: { id: string; d: ResellerClientDetail }) {
  const { update } = useClientMutations(id);
  const [f, setF] = useState(() => toInput(d.client));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => { setF(toInput(d.client)); }, [d.client]);
  const set = <K extends keyof ResellerClientProfileInput>(k: K, v: ResellerClientProfileInput[K]) => { setMsg(null); setF((p) => ({ ...p, [k]: v })); };
  const txt = (k: 'addressLine1' | 'addressLine2' | 'state' | 'city' | 'postalCode' | 'whatsappPhone', label: string, max: number) => (
    <Field label={label}><input className="input" maxLength={max} value={f[k] ?? ''} onChange={(e) => set(k, e.target.value === '' ? null : e.target.value)} data-testid={`input-client-${k}`} /></Field>
  );
  const save = async () => {
    if (!f.firstName.trim() || !f.lastName.trim()) return setMsg({ ok: false, t: 'First and last name are required.' });
    if (f.username.trim().length < 3) return setMsg({ ok: false, t: 'Username must be 3 to 32 characters.' });
    try { await update.mutateAsync({ id, data: { ...f, firstName: f.firstName.trim(), lastName: f.lastName.trim(), username: f.username.trim() } }); setMsg({ ok: true, t: 'Profile saved.' }); }
    catch (e) { setMsg({ ok: false, t: errText(e) }); }
  };
  const langKnown = !f.preferredLanguage || d.options.languages.some((c) => c.code === f.preferredLanguage);
  return (
    <Card className="space-y-3 p-3.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name"><input className="input" maxLength={100} value={f.firstName} onChange={(e) => set('firstName', e.target.value)} data-testid="input-client-firstName" /></Field>
        <Field label="Last name"><input className="input" maxLength={100} value={f.lastName} onChange={(e) => set('lastName', e.target.value)} data-testid="input-client-lastName" /></Field>
        <Field label="Username"><input className="input" maxLength={32} value={f.username} onChange={(e) => set('username', e.target.value)} data-testid="input-client-username" /></Field>
        <Field label="WhatsApp" hint="International format, for example +39 333 1234567">{txt('whatsappPhone', '', 30).props.children}</Field>
        <Field label="Preferred language"><select className="input" value={f.preferredLanguage ?? ''} onChange={(e) => set('preferredLanguage', e.target.value || null)} data-testid="select-client-language">
          <option value="">Not set</option>{!langKnown && <option value={f.preferredLanguage!}>{f.preferredLanguage}</option>}{d.options.languages.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
        <Field label="Account Currency" hint="Fixed at registration; currency migration is not available."><div className="input flex items-center" data-testid="text-client-account-currency">{d.client.preferredCurrency}</div></Field>
        {txt('addressLine1', 'Address line 1', 200)}{txt('addressLine2', 'Address line 2', 200)}
        <Field label="Country"><select className="input" value={f.countryCode ?? ''} onChange={(e) => set('countryCode', e.target.value || null)} data-testid="select-client-country">
          <option value="">Not set</option>{d.options.countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
        {txt('state', 'State / province', 100)}{txt('city', 'City', 100)}{txt('postalCode', 'Postal code', 24)}
      </div>
      <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={f.newsletterOptIn} onChange={(e) => set('newsletterOptIn', e.target.checked)} data-testid="checkbox-client-newsletter" /> Newsletter subscription</label>
      <p className="text-[11.5px] text-muted-foreground">Email and client code are fixed. Passwords are managed by the client.</p>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-[12px] ${msg.ok ? 'text-ok' : 'text-danger'}`} data-testid="text-profile-message">{msg.t}</p>}
      <Btn v="brand" disabled={update.isPending} onClick={() => void save()} data-testid="button-save-client">{update.isPending ? 'Saving...' : 'Save profile'}</Btn>
    </Card>
  );
}

function Notes({ id, d }: { id: string; d: ResellerClientDetail }) {
  const { note } = useClientMutations(id);
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const add = async () => {
    const b = body.trim();
    if (!b) return setErr('Write a note first.');
    try { await note.mutateAsync({ id, data: { body: b } }); setBody(''); setErr(''); } catch (e) { setErr(errText(e)); }
  };
  return (
    <div className="space-y-3">
      <Card className="space-y-2 p-3.5">
        <label className="lbl" htmlFor="client-note">Internal note (never shown to the client)</label>
        <textarea id="client-note" className="input min-h-[80px]" maxLength={4000} value={body} onChange={(e) => { setBody(e.target.value); setErr(''); }} data-testid="input-client-note" />
        {err && <p role="alert" className="text-[11.5px] text-danger">{err}</p>}
        <Btn v="brand" sm disabled={note.isPending} onClick={() => void add()} data-testid="button-add-note">{note.isPending ? 'Adding...' : 'Add note'}</Btn>
      </Card>
      <Card>{d.notes.length === 0 ? <EmptyState compact title="No notes yet" /> : <ul className="divide-y">{d.notes.map((n) => <li key={n.id} className="p-3 text-[12.5px]" data-testid={`note-${n.id}`}><p className="whitespace-pre-wrap break-words">{n.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{when(n.createdAt)}</p></li>)}</ul>}</Card>
    </div>
  );
}

export default function ClientDetailPage({ id }: { id: string }) {
  const q = useClientDetail(id);
  const { status } = useClientMutations(id);
  const [tab, setTab] = useState<Tab>('Overview');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState('');
  const back = <Link href="/m/clients" className="mb-2 inline-flex items-center gap-1 text-[12px] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--brand))]" data-testid="link-back-clients"><ArrowLeft size={12} /> All clients</Link>;
  if (q.isLoading) return <div aria-busy="true">{back}<div className="h-40 animate-pulse rounded-lg bg-white/5" /></div>;
  if (q.isError || !q.data) return <div>{back}<Card className="flex flex-col items-center gap-2 p-8 text-center" role="alert"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(q.error)}</p><Btn sm onClick={() => void q.refetch()} data-testid="button-client-retry">Try again</Btn></Card></div>;
  const d = q.data, c = d.client;
  const toggle = async () => { setErr(''); try { await status.mutateAsync({ id, data: { enabled: !c.enabled } }); } catch (e) { setErr(errText(e)); } };
  return (
    <div className="min-w-0" data-testid="client-detail">
      {back}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand)/0.12)] font-bold text-[hsl(var(--brand))]">{(c.firstName[0] || '') + (c.lastName[0] || '')}</span><div className="min-w-0"><h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">{clientName(c)}</h1>
          <p className="break-words text-[12.5px] text-[hsl(var(--text-secondary))]">{c.email} · <span className="font-mono">{c.clientCode || c.username || '-'}</span> · <span data-testid="text-client-status">{c.enabled ? 'Active' : 'Blocked'}</span></p></div></div>
        <Btn v={c.enabled ? 'danger' : 'ok'} disabled={status.isPending} onClick={() => (c.enabled ? setConfirm(true) : void toggle())} data-testid="button-toggle-client">{c.enabled ? 'Block client' : 'Unblock client'}</Btn>
      </div>
      {err && <p role="alert" className="mb-2 text-[12px] text-danger">{err}</p>}
      <div role="tablist" aria-label="Client sections" className="scroll-thin mb-3 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => <button key={t} role="tab" id={`client-tab-${t}`} aria-selected={tab === t} aria-controls="client-panel" onClick={() => setTab(t)} data-testid={`tab-client-${t.toLowerCase()}`}
          className={`whitespace-nowrap px-3 py-2 text-[12.5px] font-medium ${tab === t ? 'border-b-2 border-[hsl(var(--brand))] text-[hsl(var(--brand))]' : 'text-muted-foreground'}`}>{t}</button>)}
      </div>
      <div id="client-panel" role="tabpanel" aria-labelledby={`client-tab-${tab}`}>
        {tab === 'Overview' && <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-3.5"><h2 className="mb-1 text-[13px] font-semibold">Identity</h2><dl>
            <Row k="Name" v={clientName(c)} /><Row k="Email" v={c.email} /><Row k="Client code" v={c.clientCode} /><Row k="Username" v={c.username} /><Row k="WhatsApp" v={c.whatsappPhone} />
            <Row k="Location" v={[c.city, c.state, c.countryCode].filter(Boolean).join(', ')} /><Row k="Registered" v={when(c.createdAt)} /><Row k="Last login" v={when(c.lastLoginAt)} /></dl></Card>
          <Card className="p-3.5"><h2 className="mb-1 text-[13px] font-semibold">Summary</h2><dl>
            <Row k="Status" v={c.enabled ? 'Active' : 'Blocked'} /><Row k="Total orders" v={d.orderSummary.totalOrders} /><Row k="Retail orders" v={d.orderSummary.retailOrders} />
            <Row k="Available balance" v={fmt(d, 'formattedAvailable', 'availableBalance')} /><Row k="Account currency" v={d.client.effectiveCurrency} /><Row k="Total spent" v={fmt(d, 'formattedTotalSpent', 'totalSpent')} /><Row k="Ledger credits" v={fmt(d, 'formattedLedgerCredits', 'ledgerCredits')} /><Row k="Ledger debits" v={fmt(d, 'formattedLedgerDebits', 'ledgerDebits')} />{BigInt(d.financial.lockedAmount) !== 0n && <Row k="Locked balance" v={fmt(d, 'formattedLocked', 'lockedAmount')} />}</dl></Card></div>}
        {tab === 'Financial' && <FinancialPanel id={id} d={d} />}
        {tab === 'Profile' && <><ProfileForm id={id} d={d} /><ClientGroupAssign id={id} d={d} /></>}
        {tab === 'Orders' && <ClientOrdersPanel id={id} d={d} />}
        {tab === 'Activity' && <ClientActivityPanel key={id} id={id} legacy={d.activity} />}
        {tab === 'Notes' && <Notes id={id} d={d} />}
      </div>
      <ConfirmDialog open={confirm} title="Block this client?" body="They will no longer be able to log in to your public website." confirmLabel="Block client" danger onConfirm={toggle} onClose={() => setConfirm(false)} />
    </div>
  );
}
