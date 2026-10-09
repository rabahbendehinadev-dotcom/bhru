import { useState } from 'react';
import type { GatewayView, GatewayCurrencyRule, FundingView } from '@workspace/api-client-react';
import { Card, Btn } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { errText } from '@/hooks/use-commerce';
import { useAdminGateways, useResellerGateways, useFundingHistory, useFundingDetail } from '@/hooks/use-payment-gateways';

const date = (v?: string | null) => (v ? new Date(v).toLocaleString() : 'Not recorded');
const implemented = (g: GatewayView) => g.integrationStatus === 'AVAILABLE';
const List = ({ label, items }: { label: string; items: string[] }) => items.length ? <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5">{items.join(', ')}</dd></div> : null;

function Status({ g }: { g: GatewayView }) {
  return <span className="badge" data-testid={`status-gateway-${g.code}`}>{implemented(g) ? 'Integrated' : 'Not Integrated - coming soon'}</span>;
}

function Meta({ g }: { g: GatewayView }) {
  return <dl className="grid gap-2 text-[12px] sm:grid-cols-2">
    <List label="Supported currencies" items={g.supportedCurrencies} />
    <List label="Supported methods" items={g.supportedMethods} />
    <List label="Required credentials" items={g.requiredCredentials.map(c => c.label)} />
    <List label="Configuration fields" items={g.configurationFields.map(c => c.label)} />
    <div><dt className="text-muted-foreground">Version</dt><dd className="mt-0.5">{g.version}</dd></div>
  </dl>;
}

export function AdminPaymentGateways() {
  const { query: q, update } = useAdminGateways();
  const [error, setError] = useState('');
  const patch = async (g: GatewayView, d: { globalEnabled: boolean; resellerAvailable: boolean }) => {
    setError('');
    try { await update.mutateAsync({ code: g.code, data: d }); } catch (e) { setError(errText(e)); }
  };
  return <div className="space-y-3">
    <div><h1 className="text-[18px] font-bold">Payment Gateways</h1>
      <p className="text-[12.5px] text-muted-foreground">Trusted gateway definitions. No payment provider is integrated yet, so no payment can be taken.</p></div>
    {error && <p role="alert" className="text-danger">{error}</p>}
    {q.isLoading ? <Card className="p-4" aria-busy="true">Loading gateways…</Card>
      : q.isError || !q.data ? <Card className="p-4" role="alert">{errText(q.error)} <Btn onClick={() => void q.refetch()}>Retry</Btn></Card>
      : q.data.data.length === 0 ? <EmptyState compact title="No gateway definitions" />
      : q.data.data.map(g => <Card key={g.code} className="p-3.5" data-testid={`card-gateway-${g.code}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-[13px] font-semibold">{g.displayName}</h2><p className="text-[12px] text-muted-foreground">{g.description}</p></div><Status g={g} /></div>
        <Meta g={g} />
        <div className="mt-3 flex flex-wrap gap-4 text-[12.5px]">
          <label className="flex items-center gap-2"><input type="checkbox" checked={g.globalEnabled} disabled={update.isPending} data-testid={`switch-global-${g.code}`}
            onChange={e => void patch(g, { globalEnabled: e.target.checked, resellerAvailable: g.resellerAvailable })} />Globally enabled</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={g.resellerAvailable} disabled={update.isPending} data-testid={`switch-reseller-${g.code}`}
            onChange={e => void patch(g, { globalEnabled: g.globalEnabled, resellerAvailable: e.target.checked })} />Available to resellers</label>
        </div>
        {!implemented(g) && <p className="mt-2 text-[11.5px] text-muted-foreground">These flags are stored but have no effect until an integration exists.</p>}
      </Card>)}
  </div>;
}

function GatewayCard({ g, ready }: { g: GatewayView; ready: boolean }) {
  const { configure, validate } = useResellerGateways();
  const usable = implemented(g) && g.globalEnabled && g.resellerAvailable;
  const [enabled, setEnabled] = useState(g.enabled);
  const [instructions, setInstructions] = useState(g.instructions);
  const [rules, setRules] = useState<GatewayCurrencyRule[]>(g.currencyRules);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const setRule = (i: number, k: keyof GatewayCurrencyRule, v: string) => setRules(r => r.map((x, j) => j === i ? { ...x, [k]: k === 'feeBps' ? Number(v) : v } : x));
  const save = async () => {
    setErr(''); setMsg('');
    const credentials = Object.fromEntries(Object.entries(creds).filter(([, v]) => v !== ''));
    try {
      await configure.mutateAsync({ code: g.code, data: { enabled, instructions, currencyRules: rules, ...(Object.keys(credentials).length ? { credentials } : {}) } });
      setCreds({}); setMsg('Saved.');
    } catch (e) { setErr(errText(e)); }
  };
  const check = async () => {
    setErr(''); setMsg('');
    try { await validate.mutateAsync({ code: g.code, data: {} }); setMsg('Validation requested.'); } catch (e) { setErr(errText(e)); }
  };
  return <Card className="p-3.5" data-testid={`card-gateway-${g.code}`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-[13px] font-semibold">{g.displayName}</h2><p className="text-[12px] text-muted-foreground">{g.description}</p></div><Status g={g} /></div>
    <Meta g={g} />
    {!usable ? <p className="mt-3 text-[12px] text-muted-foreground">Not Integrated. Activation, credentials and validation are unavailable until this gateway is integrated and made available by the platform.</p> : <div className="mt-3 space-y-3 text-[12.5px]">
      <label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} data-testid={`switch-enabled-${g.code}`} />Enabled for my customers</label>
      <label className="block">Instructions<textarea className="input mt-1 w-full" maxLength={1000} value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
      {rules.map((r, i) => <div key={r.currency} className="grid grid-cols-2 gap-2 sm:grid-cols-5"><strong className="self-center">{r.currency}</strong>
        {(['minimum', 'maximum', 'feeBps', 'fixedFee'] as const).map(k => <label key={k} className="text-[11px] text-muted-foreground">{k}<input className="input w-full" inputMode="decimal" value={String(r[k])} onChange={e => setRule(i, k, e.target.value)} /></label>)}</div>)}
      {g.requiredCredentials.filter(c => c.secret).length > 0 && (ready ? g.requiredCredentials.filter(c => c.secret).map(c => <label key={c.key} className="block">{c.label}
        <input type="password" autoComplete="new-password" className="input mt-1 w-full" placeholder={g.configuredCredentialFields.includes(c.key) ? 'Stored - leave blank to keep' : ''} value={creds[c.key] ?? ''} onChange={e => setCreds(s => ({ ...s, [c.key]: e.target.value }))} /></label>)
        : <p className="text-muted-foreground">Credential storage is not ready.</p>)}
      <div className="flex gap-2"><Btn v="primary" disabled={configure.isPending} onClick={() => void save()}>Save</Btn><Btn disabled={validate.isPending} onClick={() => void check()}>Validate</Btn></div>
      <p className="text-muted-foreground">Validation: {g.validationStatus}</p>
    </div>}
    {msg && <p role="status" className="mt-2">{msg}</p>}{err && <p role="alert" className="mt-2 text-danger">{err}</p>}
  </Card>;
}

export function ResellerPaymentGateways() {
  const { query: q } = useResellerGateways();
  return <div className="space-y-3">
    <div><h1 className="text-[18px] font-bold">Payment Gateways</h1><p className="text-[12.5px] text-muted-foreground">No payment provider is integrated yet. Customers cannot pay online.</p></div>
    {q.isLoading ? <Card className="p-4" aria-busy="true">Loading gateways…</Card>
      : q.isError || !q.data ? <Card className="p-4" role="alert">{errText(q.error)} <Btn onClick={() => void q.refetch()}>Retry</Btn></Card>
      : q.data.data.length === 0 ? <EmptyState compact title="No gateways" />
      : q.data.data.map(g => <GatewayCard key={g.code + g.validationStatus + g.configuredCredentialFields.join()} g={g} ready={q.data.credentialStorageReady} />)}
  </div>;
}

function Detail({ id }: { id: string }) {
  const q = useFundingDetail(id);
  if (q.isLoading) return <p aria-busy="true">Loading…</p>;
  if (q.isError || !q.data) return <p role="alert">{errText(q.error)} <Btn onClick={() => void q.refetch()}>Retry</Btn></p>;
  const f: FundingView = q.data;
  return <div className="mt-2 text-[12px]">
    <p>{f.paymentMethod} · {f.accountCurrency} to {f.paymentCurrency}</p>
    {f.payments.length === 0 ? <p className="text-muted-foreground">No payment attempts recorded.</p> : <ul className="divide-y">{f.payments.map(p =>
      <li key={p.id} className="py-1">{p.status} · {(p as { formattedAmount?: string | null }).formattedAmount ?? 'Amount not reported'} · Ref {p.providerReference ?? 'none'} · {date(p.createdAt)} · Settled {date(p.settledAt)}</li>)}</ul>}
  </div>;
}

export function FundingHistory() {
  const q = useFundingHistory(); const [open, setOpen] = useState<string | null>(null);
  return <div className="space-y-3">
    <div><h1 className="text-[18px] font-bold">Funding Requests</h1><p className="text-[12.5px] text-muted-foreground">Customer funding requests. A request is not a payment and does not credit a wallet.</p></div>
    {q.isLoading ? <Card className="p-4" aria-busy="true">Loading history…</Card>
      : q.isError || !q.data ? <Card className="p-4" role="alert">{errText(q.error)} <Btn onClick={() => void q.refetch()}>Retry</Btn></Card>
      : q.data.data.length === 0 ? <EmptyState compact title="No funding requests yet" />
      : <Card className="p-3.5"><ul className="divide-y">{q.data.data.map(f => <li key={f.id} className="py-2 text-[12.5px]" data-testid={`row-funding-${f.id}`}>
        <div className="flex flex-wrap justify-between gap-2"><div><strong>{f.customerName ?? 'Customer'}</strong> · {f.gatewayName}<p className="text-muted-foreground">{date(f.createdAt)} · {f.status}</p></div>
          <div className="text-right">Credit {f.formattedCredit}<p className="text-muted-foreground">Base {f.formattedBase} · Fee {f.formattedFee} · Payable {f.formattedPayable}</p></div></div>
        <Btn sm onClick={() => setOpen(open === f.id ? null : f.id)}>{open === f.id ? 'Hide details' : 'Details'}</Btn>{open === f.id && <Detail id={f.id} />}
      </li>)}</ul>{q.data.hasMore && <p className="mt-2 text-[11.5px] text-muted-foreground">Showing the first 30 requests only; more exist and are not listed here.</p>}</Card>}
  </div>;
}
