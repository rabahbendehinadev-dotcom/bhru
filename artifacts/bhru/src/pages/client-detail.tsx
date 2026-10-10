import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Btn, Card, ConfirmDialog, Field } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { useClientDetail, useClientMutations } from '@/hooks/use-clients';
import { ClientActivityPanel } from './client-activity';
import { ClientSecurityPanel } from './client-security';
import { errText } from '@/hooks/use-commerce';
import { FinancialPanel, ClientOrdersPanel, ClientGroupAssign } from '@/pages/client-finance';
import { PricingTable } from '@/pages/pricing-table';
import { ServiceAccessTable } from '@/pages/service-access-table';
import { useCustomerPricing, usePricePreview } from '@/hooks/use-pricing';
import { clientName } from '@/pages/clients';
import type { ResellerClientDetail, ResellerClientProfileInput } from '@workspace/api-client-react';

const TABS = ['Overview', 'Financial', 'Profile', 'Orders', 'Pricing', 'Service Access', 'Activity', 'Security', 'Notes'] as const;
type Tab = typeof TABS[number];
const when = (s?: string | null) => { if (!s) return '-'; const d = new Date(s); return Number.isNaN(+d) ? '-' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-2 border-b py-1 text-[12px] leading-5 last:border-0"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{v === null || v === undefined || v === '' || v === false ? '-' : v}</dd></div>;
}
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

function PricePreview({ id }: { id: string }) {
  const list = useCustomerPricing(id, {});
  const svc = ((list.data as { data?: { serviceId: string; serviceName: string }[] } | undefined)?.data) ?? [];
  const [sid, setSid] = useState('');
  const p = usePricePreview(id, sid);
  const x = p.data;
  return (
    <Card className="mt-3 space-y-2 p-3.5" data-testid="price-preview"><h2 className="text-[13px] font-semibold">Server price preview</h2>
      <select className="input w-auto min-w-[220px]" value={sid} onChange={(e) => setSid(e.target.value)} aria-label="Preview service" data-testid="select-preview-service"><option value="">Select a service</option>{svc.map((r) => <option key={r.serviceId} value={r.serviceId}>{r.serviceName}</option>)}</select>
      {sid && p.isLoading && <div className="h-16 animate-pulse rounded bg-white/5" aria-busy="true" />}
      {sid && p.isError && <p role="alert" className="text-[12px] text-danger">{errText(p.error)} <Btn sm onClick={() => void p.refetch()}>Retry</Btn></p>}
      {sid && x && <dl><Row k="Source" v={x.source} /><Row k="Group" v={x.groupName ? `${x.groupName}${x.groupActive === false ? ' (inactive)' : ''}` : null} /><Row k="Rule" v={x.method ? `${x.method} ${x.value ?? ''}` : null} /><Row k="Standard (USD)" v={x.standardPriceUsd} /><Row k="Effective (USD)" v={x.effectivePriceUsd} /><Row k="Rate" v={`${x.rate} ${x.currency}`} /><Row k="Customer pays" v={x.formattedTotal} /></dl>}
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
  const navId = useId();
  const navRef = useRef<HTMLDivElement>(null);
  const [verticalNav, setVerticalNav] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const update = () => setVerticalNav(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const tabId = (t: Tab) => `${navId}-tab-${TABS.indexOf(t)}`;
  const panelId = `${navId}-panel`;
  const back = <Link href="/m/clients" className="mb-2 inline-flex items-center gap-1 text-[12px] text-[hsl(var(--text-secondary))] hover:text-[hsl(var(--brand))]" data-testid="link-back-clients"><ArrowLeft size={12} /> All clients</Link>;
  if (q.isLoading) return <div aria-busy="true">{back}<div className="h-40 animate-pulse rounded-lg bg-white/5" /></div>;
  if (q.isError || !q.data) return <div>{back}<Card className="flex flex-col items-center gap-2 p-8 text-center" role="alert"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(q.error)}</p><Btn sm onClick={() => void q.refetch()} data-testid="button-client-retry">Try again</Btn></Card></div>;
  const d = q.data, c = d.client;
  const toggle = async () => { setErr(''); try { await status.mutateAsync({ id, data: { enabled: !c.enabled } }); } catch (e) { setErr(errText(e)); } };
  return (
    <div className="min-w-0" data-testid="client-detail">
      {back}
      {err && <p role="alert" className="mb-2 text-[12px] text-danger">{err}</p>}
      <div className="grid min-w-0 gap-2.5 min-[1100px]:grid-cols-[200px_minmax(0,1fr)] min-[1100px]:items-start">
      <aside className="min-w-0" aria-label="Client identity">
        <Card className="min-w-0 p-2.5">
          <div className="flex min-w-0 items-center gap-2 min-[1100px]:flex-col min-[1100px]:text-center">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand)/0.12)] font-bold uppercase text-[hsl(var(--brand))] min-[1100px]:h-12 min-[1100px]:w-12 min-[1100px]:text-[17px]">{(c.firstName[0] || '') + (c.lastName[0] || '')}</span>
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-[15px] font-bold leading-tight tracking-tight" data-testid="text-page-title">{clientName(c)}</h1>
              <p className="mt-0.5 break-all font-mono text-[12px] leading-4 text-muted-foreground">{c.clientCode || c.username || '-'}</p>
              <p className="break-all text-[12px] leading-4 text-[hsl(var(--text-secondary))]">{c.email}</p>
              <p className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${c.enabled ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger'}`} data-testid="text-client-status">{c.enabled ? 'Active' : 'Blocked'}</p>
            </div>
          </div>
          <div ref={navRef} role="tablist" aria-label="Client sections" aria-orientation={verticalNav ? 'vertical' : 'horizontal'}
            onKeyDown={(e) => {
              const i = TABS.indexOf(tab); let n = -1;
              if (e.key === (verticalNav ? 'ArrowDown' : 'ArrowRight')) n = (i + 1) % TABS.length;
              else if (e.key === (verticalNav ? 'ArrowUp' : 'ArrowLeft')) n = (i - 1 + TABS.length) % TABS.length;
              else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
              if (n < 0) return; e.preventDefault(); setTab(TABS[n]); navRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[n]?.focus();
            }}
            className="scroll-thin -mx-1 mt-2 flex gap-0.5 overflow-x-auto border-t pt-1.5 min-[1100px]:mx-0 min-[1100px]:flex-col min-[1100px]:overflow-visible">
            {TABS.map((t) => <button key={t} type="button" role="tab" id={tabId(t)} aria-selected={tab === t} aria-controls={panelId} tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)} data-testid={`tab-client-${t.toLowerCase()}`}
              className={`min-h-10 shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-left text-[12px] leading-5 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--brand))] min-[1100px]:min-h-0 min-[1100px]:border-l-2 min-[1100px]:rounded-l-none ${tab === t ? 'bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand))] min-[1100px]:border-[hsl(var(--brand))]' : 'text-muted-foreground hover:text-foreground min-[1100px]:border-transparent'}`}>{t}</button>)}
          </div>
        </Card>
      </aside>
      <div className="min-w-0">
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(tab)} tabIndex={0} className="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[hsl(var(--brand))]">
        {tab === 'Overview' && <div className="space-y-2.5">
          <Card className="p-3"><h2 className="mb-0.5 text-[14px] font-semibold">Personal Info</h2><dl className="grid gap-x-5 md:grid-cols-2">
            <Row k="Full name" v={clientName(c)} /><Row k="Email" v={c.email} /><Row k="Client code" v={c.clientCode} /><Row k="Username" v={c.username} /><Row k="WhatsApp" v={c.whatsappPhone} />
            <Row k="Location" v={[c.city, c.state, c.countryCode].filter(Boolean).join(', ')} /><Row k="Registered" v={when(c.createdAt)} /><Row k="Last login" v={when(c.lastLoginAt)} />
            <Row k="Group" v={(c as unknown as { groupName?: string | null }).groupName} /><Row k="Status" v={c.enabled ? 'Active' : 'Blocked'} /></dl></Card>
          <Card className="space-y-2 p-3" data-testid="overview-credit-info"><h2 className="text-[14px] font-semibold">Credit Info</h2>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0"><div className="text-[12px] leading-4 text-muted-foreground">Available Balance</div>
                <div className="break-words text-[26px] font-bold leading-tight tabular-nums" data-testid="text-overview-available">{d.financial.formattedAvailable ?? '-'}</div>
                <div className="text-[12px] leading-4 text-muted-foreground">Account Currency: <b className="text-foreground" data-testid="text-overview-currency">{d.financial.accountCurrency ?? '-'}</b></div></div>
              <Btn sm v="brand" className="min-h-10 text-[12px] sm:min-h-8" onClick={() => setTab('Financial')} data-testid="button-manage-wallet">Manage Wallet</Btn>
            </div>
            <dl className="grid grid-cols-1 gap-2 border-t pt-2 sm:grid-cols-3">
              <div className="flex min-w-0 flex-col"><dt className="order-2 text-[12px] leading-4 text-muted-foreground">Ledger Credits</dt><dd className="order-1 break-words text-[14px] leading-5 font-semibold" data-testid="text-overview-credits">{d.financial.formattedLedgerCredits ?? '-'}</dd></div>
              <div className="flex min-w-0 flex-col"><dt className="order-2 text-[12px] leading-4 text-muted-foreground">Ledger Debits</dt><dd className="order-1 break-words text-[14px] leading-5 font-semibold" data-testid="text-overview-debits">{d.financial.formattedLedgerDebits ?? '-'}</dd></div>
              <div className="flex min-w-0 flex-col"><dt className="order-2 text-[12px] leading-4 text-muted-foreground">Total Spent (completed service orders)</dt><dd className="order-1 break-words text-[14px] leading-5 font-semibold" data-testid="text-overview-spent">{d.financial.formattedTotalSpent ?? '-'}</dd></div>
            </dl>
          </Card>
          <Card className="p-3"><h2 className="mb-1.5 text-[14px] font-semibold">Quick Actions</h2>
            <div className="flex flex-wrap gap-1.5">
              {(['Financial', 'Orders', 'Pricing', 'Service Access', 'Activity', 'Security', 'Profile'] as const).map((t) => <Btn key={t} sm className="min-h-10 min-w-[110px] max-w-full whitespace-normal px-2.5 text-[12px] sm:min-h-8" onClick={() => setTab(t)} data-testid={`quick-${t.toLowerCase().replace(/\s+/g, '-')}`}>{t === 'Financial' ? 'Manage Wallet' : t === 'Orders' ? 'View Orders' : t}</Btn>)}
              <Btn sm className="min-h-10 min-w-[110px] max-w-full whitespace-normal px-2.5 text-[12px] sm:min-h-8" v={c.enabled ? 'danger' : 'ok'} disabled={status.isPending} onClick={() => (c.enabled ? setConfirm(true) : void toggle())} data-testid="button-toggle-client">{c.enabled ? 'Block client' : 'Unblock client'}</Btn>
            </div></Card></div>}
        {tab === 'Financial' && <FinancialPanel id={id} d={d} />}
        {tab === 'Profile' && <><ProfileForm id={id} d={d} /><ClientGroupAssign id={id} d={d} /></>}
        {tab === 'Pricing' && <div data-testid="client-pricing-panel"><Card className="mb-3 p-3.5"><h2 className="mb-1 text-[13px] font-semibold">Group</h2><dl><Row k="Current group" v={(c as unknown as { groupName?: string | null }).groupName} /><Row k="Group state" v={(c as unknown as { groupId?: string | null }).groupId ? ((c as unknown as { groupActive?: boolean | null }).groupActive === false ? 'Inactive' : 'Active') : null} /></dl></Card><ClientGroupAssign id={id} d={d} /><h2 className="mb-1.5 mt-3 text-[13px] font-semibold">Customer-specific pricing</h2><PricingTable scope="customer" id={id} /><PricePreview id={id} /></div>}
        {tab === 'Service Access' && <ServiceAccessTable key={id} scope="customer" id={id} />}
        {tab === 'Orders' && <ClientOrdersPanel id={id} d={d} />}
        {tab === 'Activity' && <ClientActivityPanel key={id} id={id} legacy={d.activity} />}
        {tab === 'Security' && <ClientSecurityPanel key={id} id={id} />}
        {tab === 'Notes' && <Notes id={id} d={d} />}
      </div>
      </div>
      </div>
      <ConfirmDialog open={confirm} title="Block this client?" body="They will no longer be able to log in to your public website." confirmLabel="Block client" danger onConfirm={toggle} onClose={() => setConfirm(false)} />
    </div>
  );
}
