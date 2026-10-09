import { useState } from 'react';
import type { GatewayView, GatewayCurrencyRule, FundingView } from '@workspace/api-client-react';
import { Card, Btn } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { errText } from '@/hooks/use-commerce';
import { useAdminGateways, useResellerGateways, useFundingHistory, useFundingDetail, useAdminPaymentMonitoring, usePaymentReviews, useFundingReconciliation, type FundingFilter } from '@/hooks/use-payment-gateways';

const date = (v?: string | null) => (v ? new Date(v).toLocaleString() : 'Not recorded');
const implemented = (g: GatewayView) => g.integrationStatus === 'AVAILABLE';
const List = ({ label, items }: { label: string; items: string[] }) => items.length ? <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5">{items.join(', ')}</dd></div> : null;

function Stats({ code }: { code: string }) {
  const m = useAdminPaymentMonitoring();
  if (m.isLoading) return <p className="mt-2 text-[12px] text-muted-foreground" aria-busy="true">Loading monitoring…</p>;
  if (m.isError || !m.data) return <p role="alert" className="mt-2 text-[12px]">{errText(m.error)} <Btn sm onClick={() => void m.refetch()}>Retry</Btn></p>;
  const r = m.data.data.find(x => x.gatewayCode === code);
  if (!r) return <p className="mt-2 text-[12px] text-muted-foreground">No monitoring data.</p>;
  const cells: [string, number][] = [['Configured resellers', r.configuredResellers], ['Pending', r.pending], ['Verified unsettled', r.verifiedUnsettled], ['Failed processing', r.failedProcessing], ['Review required', r.reviewRequired]];
  return <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-5" data-testid={`monitoring-${code}`}>{cells.map(([l, v]) => <div key={l}><dt className="text-muted-foreground">{l}</dt><dd className="font-semibold">{v}</dd></div>)}</dl>;
}

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
        <Stats code={g.code} />
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

function Recon({ id }: { id: string }) {
  const q = useFundingReconciliation(id);
  if (q.isLoading) return <p aria-busy="true" className="mt-1">Checking consistency…</p>;
  if (q.isError || !q.data) return <p role="alert" className="mt-1">{errText(q.error)} <Btn sm onClick={() => void q.refetch()}>Retry</Btn></p>;
  return <div className="mt-1" data-testid={`recon-${id}`}><p>Reconciliation (read-only): {q.data.consistent ? 'Consistent' : 'Inconsistent'}</p>
    {q.data.issues.length > 0 && <ul className="list-disc pl-4">{q.data.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}</div>;
}

function Detail({ id }: { id: string }) {
  const q = useFundingDetail(id);
  if (q.isLoading) return <p aria-busy="true">Loading…</p>;
  if (q.isError || !q.data) return <p role="alert">{errText(q.error)} <Btn onClick={() => void q.refetch()}>Retry</Btn></p>;
  const f: FundingView = q.data;
  return <div className="mt-2 text-[12px]">
    <p>{f.paymentMethod} · {f.accountCurrency} to {f.paymentCurrency}</p>
    <p>Settlement {f.settlementStatus} · Paid {date(f.paidAt)} · Expires {date(f.expiresAt)} · Credited {f.creditedWalletAmount ?? 'none'}{f.processing ? ` · Processing ${f.processing.state}` : ''}</p>
    {f.reviewRequired && <p className="text-danger">Review required{f.reviewReasons.length ? ': ' + f.reviewReasons.join(', ') : ''}</p>}
    {f.payments.length === 0 ? <p className="text-muted-foreground">No payment attempts recorded.</p> : <ul className="divide-y">{f.payments.map(p =>
      <li key={p.id} className="py-1">{p.status} · {p.formattedAmount ?? 'Amount not reported'} · Ref {p.providerReference ?? 'none'} · {date(p.createdAt)} · Settled {date(p.settledAt)}</li>)}</ul>}
    <Recon id={id} />
  </div>;
}

function ReviewQueue() {
  const [page, setPage] = useState(1); const q = usePaymentReviews(page);
  return <Card className="p-3.5" data-testid="card-payment-reviews"><h2 className="text-[13px] font-semibold">Payment review queue</h2>
    <p className="mb-2 text-[11.5px] text-muted-foreground">Read-only. Includes receipts not linked to a visible funding request.</p>
    {q.isLoading ? <p aria-busy="true">Loading reviews…</p>
      : q.isError || !q.data ? <p role="alert">{errText(q.error)} <Btn sm onClick={() => void q.refetch()}>Retry</Btn></p>
      : q.data.data.length === 0 ? <EmptyState compact title={page > 1 ? 'No reviews on this page' : 'No payments awaiting review'} />
      : <ul className="divide-y text-[12px]">{q.data.data.map(r => <li key={r.id} className="py-1.5" data-testid={`row-review-${r.id}`}>
        {r.category} · {r.gatewayCode} · {r.amountMinor && r.currency ? `${r.amountMinor} ${r.currency} (minor units)` : 'Amount not reported'} · Ref {r.providerReference ?? 'none'} · {r.fundingId ? `Funding ${r.fundingId}` : 'No matching funding request'} · {date(r.createdAt)}</li>)}</ul>}
    <div className="mt-2 flex items-center gap-2 text-[12px]"><Btn sm disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Btn><span>Page {page}</span><Btn sm disabled={!q.data?.hasMore} onClick={() => setPage(p => p + 1)}>Next</Btn></div>
  </Card>;
}

const FILTERS: FundingFilter[] = ['ALL', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REVIEW_REQUIRED'];

export function FundingHistory() {
  const [page, setPage] = useState(1); const [filter, setFilter] = useState<FundingFilter>('ALL');
  const q = useFundingHistory(page, filter); const [open, setOpen] = useState<string | null>(null);
  return <div className="space-y-3">
    <div><h1 className="text-[18px] font-bold">Funding Requests</h1><p className="text-[12.5px] text-muted-foreground">Customer funding requests. A request is not a payment until settled.</p></div>
    <ReviewQueue />
    <div className="flex flex-wrap gap-1">{FILTERS.map(f => <Btn key={f} sm v={f === filter ? 'primary' : undefined} onClick={() => { setFilter(f); setPage(1); setOpen(null); }}>{f.replace('_', ' ')}</Btn>)}</div>
    {q.isLoading ? <Card className="p-4" aria-busy="true">Loading history…</Card>
      : q.isError || !q.data ? <Card className="p-4" role="alert">{errText(q.error)} <Btn onClick={() => void q.refetch()}>Retry</Btn></Card>
      : q.data.data.length === 0 ? <EmptyState compact title="No funding requests" />
      : <Card className="p-3.5"><ul className="divide-y">{q.data.data.map(f => <li key={f.id} className="py-2 text-[12.5px]" data-testid={`row-funding-${f.id}`}>
        <div className="flex flex-wrap justify-between gap-2"><div><strong>{f.customerName ?? 'Customer'}</strong> · {f.gatewayName}<p className="text-muted-foreground">{date(f.createdAt)} · {f.status}{f.reviewRequired ? ' · Review required' : ''}</p></div>
          <div className="text-right">Credit {f.formattedCredit}<p className="text-muted-foreground">Base {f.formattedBase} · Fee {f.formattedFee} · Payable {f.formattedPayable}</p></div></div>
        <Btn sm onClick={() => setOpen(open === f.id ? null : f.id)}>{open === f.id ? 'Hide details' : 'Details'}</Btn>{open === f.id && <Detail id={f.id} />}
      </li>)}</ul>
      <div className="mt-2 flex items-center gap-2 text-[12px]"><Btn sm disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Btn><span>Page {page}</span><Btn sm disabled={!q.data.hasMore} onClick={() => setPage(p => p + 1)}>Next</Btn></div></Card>}
  </div>;
}
