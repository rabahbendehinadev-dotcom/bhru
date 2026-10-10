import { useState } from 'react';
import type { ProviderConnection, ProviderInput, ProviderPricingPolicy } from '@workspace/api-client-react';
import { Btn, Badge, Field, Modal, ConfirmDialog } from '@/components/bhru/ui';
import { ProviderCatalog } from '@/components/subscriber/ProviderCatalog';
import { useProviders, useProviderJobs, isJobActive } from '@/hooks/use-external-providers';
import { useClientGroups } from '@/hooks/use-services';
import { errorMessage } from '@/lib/store';

const DEC = /^\d{1,10}(\.\d{1,12})?$/;
const PCT = /^\d{1,5}(\.\d{1,2})?$/;
const when = (s: string | null) => (s ? new Date(s).toLocaleString() : 'Never');
const healthTone = (h: string) => (/ok|connected|healthy/i.test(h) ? 'green' : /fail|error|invalid|down/i.test(h) ? 'red' : 'gray');

function ProviderForm({ initial, protocols, onClose }: { initial: ProviderConnection | null; protocols: { code: string; name: string; available: boolean; reason: string | null }[]; onClose: () => void }) {
  const { create, update, testDraft } = useProviders();
  const [name, setName] = useState(initial?.name ?? ''), [currency, setCurrency] = useState(initial?.currency ?? '');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [protocol, setProtocol] = useState<ProviderInput['protocol']>(initial?.protocol === 'DHRU_FUSION_LEGACY_V61' ? 'DHRU_FUSION_LEGACY_V61' : 'fusion_rest');
  const [username, setUsername] = useState(''), [apiAccessKey, setApiAccessKey] = useState('');
  const legacy = protocol === 'DHRU_FUSION_LEGACY_V61';
  const [enabled, setEnabled] = useState(initial?.enabled ?? true), [token, setToken] = useState('');
  const [msg, setMsg] = useState(''), [err, setErr] = useState('');
  const clearCredentials = () => { setToken(''); setUsername(''); setApiAccessKey(''); create.reset(); update.reset(); testDraft.reset(); };
  const close = () => { clearCredentials(); onClose(); };
  const input = (): ProviderInput => ({ name: name.trim(), protocol, baseUrl: baseUrl.trim(), enabled, currency: currency.trim() ? currency.trim().toUpperCase() : null,
    ...(legacy ? { ...(username.trim() ? { username: username.trim() } : {}), ...(apiAccessKey ? { apiAccessKey } : {}) } : token ? { token } : {}) });
  const newCredentials = legacy ? !!username.trim() && !!apiAccessKey : !!token;
  const credentialValid = legacy ? newCredentials || (!!initial && !username.trim() && !apiAccessKey) : !!initial || !!token;
  const valid = name.trim().length > 0 && (legacy ? /^https:\/\/[^?#]+$/.test(baseUrl.trim()) : /^https:\/\/.+\/api\/reseller\/v1\/?$/.test(baseUrl.trim())) && (!currency.trim() || /^[A-Za-z]{3}$/.test(currency.trim())) && credentialValid;
  const test = () => { setErr(''); setMsg(''); testDraft.mutate({ data: input() }, {
    onSuccess: r => { if (r.health === 'CONNECTED') setMsg(`Account responded: ${r.health}, currency: ${r.currency ?? 'Not supplied'}, balance: ${r.balance ?? 'Not supplied'}`);
      else setErr(`Connection test: ${r.health}. Check endpoint, credentials and provider access permissions.`); }, onError: e => setErr(errorMessage(e)) }); };
  const save = () => { setErr(''); const done = { onSuccess: () => close(), onError: (e: unknown) => setErr(errorMessage(e)) };
    if (initial) update.mutate({ id: initial.id, data: input() }, done); else create.mutate({ data: input() }, done); };
  const pending = create.isPending || update.isPending;
  return (
    <Modal open onClose={close} title={initial ? `Edit ${initial.name}` : 'Add provider'} footer={<>
      <Btn onClick={test} disabled={!newCredentials || !enabled || !valid || testDraft.isPending || pending} data-testid="button-test-draft">{testDraft.isPending ? 'Testing…' : 'Test connection'}</Btn>
      <Btn v="brand" onClick={save} disabled={!valid || pending} data-testid="button-save-provider">{pending ? 'Saving…' : 'Save'}</Btn></>}>
      <div className="space-y-3">
        <Field label="Name"><input className="input" maxLength={100} value={name} onChange={e => setName(e.target.value)} data-testid="input-provider-name" /></Field>
        <Field label="Provider type">
          <select className="input" value={protocol} disabled={!!initial} onChange={e => {
            setProtocol(e.target.value as ProviderInput['protocol']); clearCredentials(); setBaseUrl(''); setMsg(''); setErr('');
          }} data-testid="select-provider-protocol">
            {(protocols.length ? protocols : [{ code: 'fusion_rest', name: 'Fusion REST', available: true, reason: null }]).map(p => (
              <option key={p.code} value={p.code} disabled={!p.available}>{p.name}{p.available ? '' : ' — Not Implemented'}</option>))}
          </select></Field>
        <Field label={legacy ? 'API Endpoint URL' : 'API base URL'} hint={legacy ? 'Exact public HTTPS endpoint supplied by your provider; no query credentials. No /api.php path is added automatically.' : 'Public HTTPS host; exact path /api/reseller/v1'}><input className="input" type="url" maxLength={300} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder={legacy ? 'https://api.provider.example' : 'https://provider.example/api/reseller/v1'} data-testid="input-provider-baseurl" /></Field>
        <Field label="Currency (optional)" hint="Three-letter code, e.g. USD"><input className="input" maxLength={3} value={currency} onChange={e => setCurrency(e.target.value)} data-testid="input-provider-currency" /></Field>
        {legacy ? <>
          <Field label="Username" hint={initial?.credentialSaved ? 'Enter both fields to replace credentials. Leave both blank to keep saved credentials.' : undefined}>
            <input className="input" autoComplete="off" maxLength={200} value={username} onChange={e => setUsername(e.target.value)} data-testid="input-provider-username" />
          </Field>
          <Field label={initial?.credentialSaved ? 'Replace API Access Key' : 'API Access Key'}>
            <input className="input" type="password" autoComplete="new-password" maxLength={4096} value={apiAccessKey} onChange={e => setApiAccessKey(e.target.value)} data-testid="input-provider-access-key" />
          </Field>
        </> : <Field label={initial?.credentialSaved ? 'Replace token (leave blank to keep saved credential)' : 'API token'}>
          <input className="input" type="password" autoComplete="new-password" maxLength={4096} value={token} onChange={e => setToken(e.target.value)} placeholder={initial?.credentialSaved ? 'Saved — not displayed' : ''} data-testid="input-provider-token" /></Field>}
        <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} data-testid="checkbox-provider-enabled" />Enabled</label>
        {msg && <div className="text-[12px] text-[hsl(152_60%_58%)]" data-testid="text-draft-result">{msg}</div>}
        {err && <div className="text-[12px] text-[hsl(0_90%_72%)]" role="alert" data-testid="text-provider-error">{err}</div>}
      </div>
    </Modal>
  );
}

function PricingForm({ p, onClose }: { p: ProviderConnection; onClose: () => void }) {
  const { savePricing } = useProviders();
  const cg = useClientGroups();
  const [pct, setPct] = useState(p.pricingPolicy.percentage), [fix, setFix] = useState(p.pricingPolicy.fixedUsd);
  const [g, setG] = useState<Record<string, { percentage: string; fixedUsd: string }>>(Object.fromEntries(p.pricingPolicy.groups.map(x => [x.groupId, { percentage: x.percentage, fixedUsd: x.fixedUsd }])));
  const [err, setErr] = useState('');
  const ids = Object.keys(g);
  const ok = PCT.test(pct) && DEC.test(fix) && ids.every(i => PCT.test(g[i].percentage) && DEC.test(g[i].fixedUsd));
  const save = () => { const data: ProviderPricingPolicy = { percentage: pct, fixedUsd: fix, groups: ids.map(i => ({ groupId: i, ...g[i] })) };
    savePricing.mutate({ id: p.id, data }, { onSuccess: onClose, onError: e => setErr(errorMessage(e)) }); };
  const active = cg.rows?.filter(x => x.active) ?? [];
  return (
    <Modal open onClose={onClose} title={`Pricing · ${p.name}`} footer={<Btn v="brand" onClick={save} disabled={!ok || savePricing.isPending} data-testid="button-save-pricing">{savePricing.isPending ? 'Saving…' : 'Save defaults'}</Btn>}>
      <p className="mb-3 text-[11.5px] text-[hsl(var(--text-secondary))]">Defaults apply to future imports. Saving does not reprice existing services.</p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Markup %"><input className="input" inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} data-testid="input-pricing-percentage" /></Field>
        <Field label="Fixed USD"><input className="input" inputMode="decimal" value={fix} onChange={e => setFix(e.target.value)} data-testid="input-pricing-fixed" /></Field>
      </div>
      <div className="mt-3 text-[12px] font-medium">Client group policies (optional)</div>
      {cg.isLoading ? <div className="mt-1 h-8 animate-pulse rounded bg-[hsl(var(--muted))]" /> : cg.isError ? <div className="mt-1 text-[12px]">{errorMessage(cg.error)}</div>
        : !active.length ? <div className="mt-1 text-[12px] text-[hsl(var(--text-secondary))]" data-testid="text-no-groups">No active client groups.</div>
        : active.map(x => { const on = !!g[x.id]; return (
          <div key={x.id} className="mt-1 grid grid-cols-[1fr_80px_80px] items-center gap-2">
            <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={on} data-testid={`checkbox-group-${x.id}`}
              onChange={e => setG(s => { const n = { ...s }; if (e.target.checked) n[x.id] = { percentage: pct, fixedUsd: fix }; else delete n[x.id]; return n; })} />{x.name}</label>
            {on && <><input className="input" aria-label="Group %" value={g[x.id].percentage} onChange={e => setG(s => ({ ...s, [x.id]: { ...s[x.id], percentage: e.target.value } }))} />
              <input className="input" aria-label="Group fixed USD" value={g[x.id].fixedUsd} onChange={e => setG(s => ({ ...s, [x.id]: { ...s[x.id], fixedUsd: e.target.value } }))} /></>}
          </div>); })}
      {err && <div className="mt-2 text-[12px] text-[hsl(0_90%_72%)]" role="alert" data-testid="text-pricing-error">{err}</div>}
    </Modal>
  );
}

function History({ p, onClose }: { p: ProviderConnection; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const { query } = useProviderJobs(p.id, page);
  return (
    <Modal open onClose={onClose} width={720} title={`Job history · ${p.name}`}>
      {query.isLoading ? <div className="h-16 animate-pulse rounded bg-[hsl(var(--muted))]" /> : query.isError ? <div className="text-[12.5px]">{errorMessage(query.error)} <Btn sm onClick={() => void query.refetch()}>Retry</Btn></div>
        : !query.data?.data.length ? <div className="p-4 text-center text-[12.5px] text-[hsl(var(--text-secondary))]" data-testid="text-no-jobs">No jobs yet.</div>
        : <div className="overflow-x-auto scroll-thin"><table className="tbl"><thead><tr><th>Kind</th><th>State</th><th>Attempts</th><th>Created</th><th>Completed</th><th>Detail</th></tr></thead><tbody>
          {query.data.data.map(j => (
             <tr key={j.id} data-testid={`row-job-${j.id}`}><td>{j.kind}<div className="text-[10px] text-[hsl(var(--text-secondary))]" title={j.id}>{j.id.slice(0,8)}</div></td><td><Badge tone={isJobActive(j.state) ? 'blue' : /fail/i.test(j.state) ? 'red' : 'green'}>{j.state}</Badge></td><td>{j.attempts}</td><td>{when(j.createdAt)}</td><td>{j.completedAt ? when(j.completedAt) : '—'}</td>
              <td className="max-w-[220px] truncate" title={j.safeError ?? ''}>{j.safeError ?? Object.entries(j.counts).map(([k, v]) => `${k}: ${v}`).join(', ')}</td></tr>))}
        </tbody></table></div>}
      <div className="mt-2 flex justify-end gap-2"><Btn sm disabled={page <= 1} onClick={() => setPage(x => x - 1)}>Prev</Btn><Btn sm disabled={!query.data?.hasMore} onClick={() => setPage(x => x + 1)}>Next</Btn></div>
    </Modal>
  );
}

function JobWatcher({ id }: { id: string }) {
  const { query, busy } = useProviderJobs(id);
  const last = query.data?.data[0];
  if (!last) return null;
  return <div className="text-[10.5px] text-[hsl(var(--text-secondary))]" data-testid={`text-job-${id}`}>{busy ? `${last.kind} ${last.state.toLowerCase()}…` : `${last.kind} ${last.state.toLowerCase()}`}{!busy && last.safeError ? `: ${last.safeError}` : ''}</div>;
}

export default function ExternalProvidersPage() {
  const { query, update, startJob } = useProviders();
  const [form, setForm] = useState<ProviderConnection | 'new' | null>(null);
  const [pricing, setPricing] = useState<ProviderConnection | null>(null), [hist, setHist] = useState<ProviderConnection | null>(null), [cat, setCat] = useState<ProviderConnection | null>(null);
  const [off, setOff] = useState<ProviderConnection | null>(null), [err, setErr] = useState('');
  const d = query.data, ready = d?.storageReady === true;
  const run = (p: ProviderConnection, kind: 'TEST' | 'SYNC') => { setErr(''); startJob.mutate({ id: p.id, data: { kind } }, { onError: e => setErr(errorMessage(e)) }); };
  const toggle = (p: ProviderConnection) => update.mutateAsync({ id: p.id, data: { name: p.name, protocol: p.protocol as ProviderInput['protocol'], baseUrl: p.baseUrl, enabled: !p.enabled, currency: p.currency } })
    .then(() => true, e => { setErr(errorMessage(e)); return false; });
  return (
    <div data-testid="page-external-providers">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">API Settings</h1>
          <p className="text-[12.5px] text-[hsl(var(--text-secondary))]">External providers: connect, sync catalogs, price and import services.</p></div>
        <Btn v="brand" onClick={() => setForm('new')} disabled={!ready} data-testid="button-add-provider">Add provider</Btn>
      </div>
      {d && !ready && <div className="mb-3 rounded-md border border-[hsl(var(--warn)/.4)] bg-[hsl(var(--warn)/.12)] p-2.5 text-[12.5px]" role="alert" data-testid="warning-storage">Provider storage is not ready. Operations are disabled until it is available.</div>}
      {err && <div className="mb-3 rounded-md border border-[hsl(var(--danger)/.4)] bg-[hsl(var(--danger)/.12)] p-2.5 text-[12.5px]" role="alert" data-testid="text-action-error">{err}</div>}
      <div className="sl-surface overflow-x-auto scroll-thin">
        {query.isLoading ? <div className="space-y-2 p-3">{[0, 1, 2].map(i => <div key={i} className="h-9 animate-pulse rounded bg-[hsl(var(--muted))]" />)}</div>
        : query.isError ? <div className="p-6 text-center text-[12.5px]" data-testid="text-providers-error">{errorMessage(query.error)} <Btn sm onClick={() => void query.refetch()} data-testid="button-retry-providers">Retry</Btn></div>
        : !d?.data.length ? <div className="p-8 text-center text-[12.5px] text-[hsl(var(--text-secondary))]" data-testid="text-providers-empty">No external providers connected yet.</div>
        : <table className="tbl"><thead><tr><th>Name</th><th>Type</th><th>Health</th><th>Currency</th><th>Balance</th><th>Services</th><th>Last sync</th><th>Actions</th></tr></thead><tbody>
          {d.data.map(p => { const dis = !ready || !p.enabled; return (
            <tr key={p.id} data-testid={`row-provider-${p.id}`}>
              <td><div className="font-medium">{p.name}</div>{!p.enabled && <Badge tone="gray">Disabled</Badge>}<JobWatcher id={p.id} /></td>
              <td>{d.protocols.find(x => x.code === p.protocol)?.name ?? p.protocol}</td>
              <td><Badge tone={healthTone(p.health)}>{p.health}</Badge>{p.safeError && <div className="max-w-[200px] truncate text-[10.5px]" title={p.safeError}>{p.safeError}</div>}</td>
              <td>{p.currency ?? '—'}</td><td className="font-mono">{p.balance ?? '—'}</td><td>{p.serviceCount}</td><td>{when(p.lastSyncAt)}</td>
              <td><div className="flex gap-1">
                <Btn sm disabled={!ready} onClick={() => setForm(p)} data-testid={`button-edit-${p.id}`}>Edit</Btn>
                <Btn sm disabled={dis || startJob.isPending} onClick={() => run(p, 'TEST')} data-testid={`button-test-${p.id}`}>Test</Btn>
                <Btn sm disabled={dis || startJob.isPending} onClick={() => run(p, 'SYNC')} data-testid={`button-sync-${p.id}`}>Sync</Btn>
                <Btn sm disabled={dis} onClick={() => setCat(p)} data-testid={`button-import-${p.id}`}>Import</Btn>
                <Btn sm disabled={!ready} onClick={() => setPricing(p)} data-testid={`button-pricing-${p.id}`}>Pricing</Btn>
                <Btn sm onClick={() => setHist(p)} data-testid={`button-history-${p.id}`}>History</Btn>
                {p.enabled ? <Btn sm v="danger" disabled={!ready} onClick={() => setOff(p)} data-testid={`button-disable-${p.id}`}>Disable</Btn>
                  : <Btn sm disabled={!ready} onClick={() => void toggle(p)} data-testid={`button-enable-${p.id}`}>Enable</Btn>}
              </div></td></tr>); })}
        </tbody></table>}
      </div>
      {form && <ProviderForm initial={form === 'new' ? null : form} protocols={d?.protocols ?? []} onClose={() => setForm(null)} />}
      {pricing && <PricingForm p={pricing} onClose={() => setPricing(null)} />}
      {hist && <History p={hist} onClose={() => setHist(null)} />}
      {cat && <ProviderCatalog provider={cat} onClose={() => setCat(null)} />}
      <ConfirmDialog open={!!off} title="Disable provider" body={`Disable ${off?.name}? Saved credentials are kept; sync and import stop until re-enabled.`} confirmLabel="Disable" danger
        onConfirm={() => off ? toggle(off) : false} onClose={() => setOff(null)} />
    </div>
  );
}
