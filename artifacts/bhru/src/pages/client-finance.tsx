import { useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { Btn, Card, ConfirmDialog, Field } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { errText } from '@/hooks/use-commerce';
import {
  newUuid, when, useClientGroupMutations, useClientGroups, useClientStatement, useClientWallet, useServiceOrders, useWalletMutation,
} from '@/hooks/use-services';
import { OrderBadge } from '@/pages/service-orders';
import type { ResellerClientDetail } from '@workspace/api-client-react';

const AMOUNT = /^\d{1,15}(\.\d{1,6})?$/;
type Op = 'add' | 'deduct' | 'adjustment';
type Payload = Parameters<ReturnType<typeof useWalletMutation>['mutateAsync']>[0]['data'];
const pkey = (id: string) => `bhru-wallet-pending:${id}`;
const loadPending = (id: string): Payload | null => { try { const v = sessionStorage.getItem(pkey(id)); return v ? JSON.parse(v) as Payload : null; } catch { return null; } };
const savePending = (id: string, p: Payload) => { try { sessionStorage.setItem(pkey(id), JSON.stringify(p)); } catch { /* ignore */ } };
const clearPending = (id: string) => { try { sessionStorage.removeItem(pkey(id)); } catch { /* ignore */ } };
const isDefinitive = (e: unknown) => { const st = (e as { status?: number } | null)?.status; return typeof st === 'number' && st >= 400 && st < 500; };

function Stat({ k, v, id }: { k: string; v?: string; id: string }) {
  return <Card className="p-2.5"><div className="text-[11px] text-muted-foreground">{k}</div><div className="break-words text-[17px] font-bold" data-testid={`stat-${id}`}>{v ?? '-'}</div></Card>;
}

function Ledger({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [dir, setDir] = useState('');
  const q = useClientStatement(id, { page, ...(search ? { search } : {}), ...(type ? { type } : {}), ...(dir ? { direction: dir } : {}) });
  return (
    <Card>
      <form className="flex flex-wrap items-center gap-2 border-b p-2.5" onSubmit={(e) => { e.preventDefault(); setSearch(text.trim()); setPage(1); }}>
        <div className="relative min-w-[180px] flex-1"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="input pl-8" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search description or reference..." aria-label="Search ledger" data-testid="input-ledger-search" /></div>
        <select className="input w-auto" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type filter" data-testid="select-ledger-type"><option value="">All types</option><option value="admin_credit">Admin credit</option><option value="admin_debit">Admin debit</option><option value="adjustment">Adjustment</option><option value="order_debit">Order debit</option><option value="order_refund">Order refund</option></select>
        <select className="input w-auto" value={dir} onChange={(e) => { setDir(e.target.value); setPage(1); }} aria-label="Direction" data-testid="select-ledger-direction"><option value="">Credit and debit</option><option value="credit">Credit</option><option value="debit">Debit</option></select>
        <Btn type="submit" v="brand" sm data-testid="button-ledger-search">Search</Btn><Btn type="button" sm disabled={q.isFetching} onClick={() => void q.refetch()} data-testid="button-ledger-refresh">Refresh</Btn>
      </form>
      {q.isLoading ? <div className="space-y-2 p-3" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-white/5" />)}</div>
        : q.isError || !q.rows ? <div className="flex flex-col items-center gap-2 p-6 text-center" role="alert"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(q.error)}</p><Btn sm onClick={() => void q.refetch()}>Try again</Btn></div>
          : q.rows.length === 0 ? <EmptyState compact title="No ledger entries" description="Wallet movements appear here." />
            : <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Method / Ref</th><th>Description</th><th>Internal note</th><th>By</th></tr></thead>
              <tbody>{q.rows.map((r) => <tr key={r.id} data-testid={`row-ledger-${r.id}`}><td className="whitespace-nowrap">{when(r.createdAt)}</td><td>{r.type}</td>
                <td className={`whitespace-nowrap font-medium ${r.direction === 'credit' ? 'text-ok' : 'text-danger'}`}>{r.direction === 'credit' ? '+' : '-'}{r.formattedAmount}</td><td className="whitespace-nowrap">{r.formattedBalanceAfter}</td>
                <td>{[r.method, r.transactionReference].filter(Boolean).join(' / ') || '-'}</td><td className="min-w-[160px]">{r.description || '-'}</td><td className="min-w-[120px]">{r.internalNote || '-'}</td><td>{r.createdByType || '-'}</td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t p-2.5 text-[12px]"><Btn sm disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-ledger-prev"><ArrowLeft size={12} /> Previous</Btn><span className="text-muted-foreground">Page {page}</span><Btn sm disabled={!q.hasMore} onClick={() => setPage(page + 1)} data-testid="button-ledger-next">Next <ArrowRight size={12} /></Btn></div>
    </Card>
  );
}

export function FinancialPanel({ id, d }: { id: string; d: ResellerClientDetail }) {
  const w = useClientWallet(id);
  const m = useWalletMutation();
  const fin = w.fin;
  const [op, setOp] = useState<Op>('add');
  const [adjDir, setAdjDir] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(d.options.currencies[0]?.code ?? d.options.defaultCurrency ?? 'USD');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('');
  const [ref, setRef] = useState('');
  const [internal, setInternal] = useState('');
  const [customer, setCustomer] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const direction = op === 'add' ? 'credit' : op === 'deduct' ? 'debit' : adjDir;
  const validate = () => {
    if (!AMOUNT.test(amount.trim())) return 'Amount must be a positive decimal with up to 6 fractional digits.';
    if (/^0+(\.0+)?$/.test(amount.trim())) return 'Amount must be greater than zero.';
    if (!reason.trim()) return 'A reason is required.';
    if (!method.trim()) return 'A method is required, for example Bank transfer or Cash.';
    return '';
  };
  const [pending, setPending] = useState<Payload | null>(() => loadPending(id));
  const build = (): Payload => ({
    operation: op, direction, amount: amount.trim(), currency, reason: reason.trim(), method: method.trim(), idempotencyKey: newUuid(),
    ...(ref.trim() ? { transactionReference: ref.trim() } : {}), ...(internal.trim() ? { internalNote: internal.trim() } : {}), ...(customer.trim() ? { customerNote: customer.trim() } : {}),
  } as Payload);
  const ask = () => { if (pending) return setConfirm(true); const e = validate(); if (e) return setMsg({ ok: false, t: e }); setMsg(null); setConfirm(true); };
  const submit = async () => {
    const data = pending ?? build();
    if (!pending) { savePending(id, data); setPending(data); }
    try {
      await m.mutateAsync({ id, data });
      clearPending(id); setPending(null);
      setAmount(''); setReason(''); setMethod(''); setRef(''); setInternal(''); setCustomer('');
      setMsg({ ok: true, t: 'Wallet updated.' });
    } catch (e) {
      if (isDefinitive(e)) { clearPending(id); setPending(null); setMsg({ ok: false, t: `${errText(e)} Nothing was applied. Correct the form and submit again.` }); }
      else setMsg({ ok: false, t: `${errText(e)} The outcome is uncertain. Review and apply again to resend the exact same request; it is never applied twice.` });
    }
  };
  const discard = () => { clearPending(id); setPending(null); setMsg(null); };
  const locked = pending !== null;
  return (
    <div className="space-y-3" data-testid="financial-panel">
      {w.isLoading ? <div className="h-20 animate-pulse rounded bg-white/5" aria-busy="true" />
        : w.isError || !fin ? <Card className="flex flex-col items-center gap-2 p-6 text-center" role="alert"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(w.error)}</p><Btn sm onClick={() => void w.refetch()} data-testid="button-wallet-retry">Try again</Btn></Card>
          : <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6"><Stat id="available" k="Available" v={fin.formattedAvailable} /><Stat id="locked" k="Locked" v={fin.formattedLocked} /><Stat id="due" k="Due" v={fin.formattedDue} /><Stat id="spent" k="Total spent" v={fin.formattedTotalSpent} /><Stat id="credits" k="Total credits" v={fin.formattedTotalCredits} /><Stat id="debits" k="Total debits" v={fin.formattedTotalDebits} /></div>}
      <Card className="space-y-3 p-3.5">
        <div className="flex items-center justify-between"><h2 className="text-[13px] font-semibold">Wallet adjustment</h2><Btn sm disabled={w.isFetching} onClick={() => void w.refetch()} data-testid="button-wallet-refresh">Refresh</Btn></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Operation"><select className="input" disabled={locked} value={op} onChange={(e) => { setOp(e.target.value as Op); setMsg(null); }} data-testid="select-wallet-operation"><option value="add">Add funds</option><option value="deduct">Deduct funds</option><option value="adjustment">Adjustment</option></select></Field>
          {op === 'adjustment' && <Field label="Direction"><select className="input" disabled={locked} value={adjDir} onChange={(e) => setAdjDir(e.target.value as 'credit' | 'debit')} data-testid="select-wallet-direction"><option value="credit">Credit</option><option value="debit">Debit</option></select></Field>}
          <Field label="Amount"><input className="input font-mono" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setMsg(null); }} placeholder="0.00" disabled={locked} data-testid="input-wallet-amount" /></Field>
          <Field label="Currency"><select className="input" disabled={locked} value={currency} onChange={(e) => setCurrency(e.target.value)} data-testid="select-wallet-currency">{d.options.currencies.map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}{d.options.currencies.length === 0 && <option value="USD">USD</option>}</select></Field>
          <Field label="Method"><input className="input" maxLength={100} value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Bank transfer, Cash..." disabled={locked} data-testid="input-wallet-method" /></Field>
          <Field label="Transaction reference (optional)"><input className="input" maxLength={200} value={ref} onChange={(e) => setRef(e.target.value)} disabled={locked} data-testid="input-wallet-reference" /></Field>
        </div>
        <Field label="Reason"><input className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} disabled={locked} data-testid="input-wallet-reason" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Internal note (staff only)"><textarea className="input min-h-[56px]" maxLength={2000} value={internal} onChange={(e) => setInternal(e.target.value)} disabled={locked} data-testid="input-wallet-internal" /></Field>
          <Field label="Customer note (shown to the client)"><textarea className="input min-h-[56px]" maxLength={500} value={customer} onChange={(e) => setCustomer(e.target.value)} disabled={locked} data-testid="input-wallet-customer" /></Field>
        </div>
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-[12px] ${msg.ok ? 'text-ok' : 'text-danger'}`} data-testid="text-wallet-message">{msg.t}</p>}
        {locked && <p role="status" className="text-[12px] text-warn" data-testid="text-wallet-pending">An earlier submission ({pending.direction} {pending.amount} {pending.currency}) is awaiting a confirmed result. Fields are locked until it succeeds or is discarded.</p>}
        <div className="flex gap-2"><Btn v="brand" disabled={m.isPending} onClick={ask} data-testid="button-wallet-submit">{m.isPending ? 'Applying...' : locked ? 'Retry same request' : 'Review and apply'}</Btn>{locked && <Btn disabled={m.isPending} onClick={discard} data-testid="button-wallet-discard">Discard and edit</Btn>}</div>
      </Card>
      <h2 className="text-[13px] font-semibold">Ledger</h2>
      <Ledger id={id} />
      <ConfirmDialog open={confirm} title="Confirm wallet change" danger={direction === 'debit'} confirmLabel="Apply change"
        body={<span>{(pending?.operation ?? op) === 'add' ? 'Add' : (pending?.operation ?? op) === 'deduct' ? 'Deduct' : `Adjustment (${pending?.direction ?? direction})`}: <b className="font-mono">{pending?.amount ?? amount.trim()} {pending?.currency ?? currency}</b> {(pending?.direction ?? direction) === 'credit' ? 'to' : 'from'} this client's wallet. Reason: {pending?.reason ?? reason.trim()}. This is recorded permanently in the ledger.</span>}
        onConfirm={async () => { await submit(); return true; }} onClose={() => setConfirm(false)} />
    </div>
  );
}

export function ClientOrdersPanel({ id, d }: { id: string; d: ResellerClientDetail }) {
  const q = useServiceOrders({ customerId: id });
  const s = q.summary;
  return (
    <div className="space-y-3" data-testid="client-orders-panel">
      <Card className="p-3.5"><h2 className="mb-2 text-[13px] font-semibold">Service orders</h2>
        {q.isLoading ? <div className="h-16 animate-pulse rounded bg-white/5" aria-busy="true" />
          : q.isError || !q.rows ? <div role="alert" className="flex items-center gap-2 text-[12.5px]"><AlertTriangle size={14} className="text-danger" />{errText(q.error)}<Btn sm onClick={() => void q.refetch()} data-testid="button-client-orders-retry">Try again</Btn></div>
            : <>
              {s && <div className="mb-2 flex flex-wrap gap-3 text-[12px]" data-testid="client-service-summary"><span>Total <b>{s.totalOrders}</b></span><span>Pending <b>{s.pending}</b></span><span>Processing <b>{s.processing}</b></span><span>Completed <b>{s.completed}</b></span><span>Rejected <b>{s.rejected}</b></span></div>}
              {q.rows.length === 0 ? <EmptyState compact title="No service orders" description="This client has not bought a manual service." />
                : <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th>Reference</th><th>Service</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{q.rows.map((o) => <tr key={o.id} data-testid={`row-service-order-${o.id}`}><td className="font-mono text-[11.5px]">{o.reference}</td><td>{o.serviceName}</td><td>{o.amountFormatted}</td><td><OrderBadge s={o.status} /></td><td>{when(o.createdAt)}</td></tr>)}</tbody></table></div>}
            </>}
      </Card>
      <Card className="p-0"><h2 className="p-3.5 pb-0 text-[13px] font-semibold">Retail orders (separate history)</h2>
        {d.orders.length === 0 ? <EmptyState compact title="No retail orders" description="No store checkout orders for this client." />
          : <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th>Reference</th><th>Status</th><th>Total</th><th>Date</th></tr></thead><tbody>{d.orders.map((o) => <tr key={o.id} data-testid={`row-order-${o.id}`}><td className="font-mono text-[11.5px]">{o.reference}</td><td className="capitalize">{o.status}</td><td>{o.formattedTotal}</td><td>{when(o.createdAt)}</td></tr>)}</tbody></table></div>}
      </Card>
    </div>
  );
}

export function ClientGroupAssign({ id, d }: { id: string; d: ResellerClientDetail }) {
  const g = useClientGroups();
  const { assign } = useClientGroupMutations();
  const cur = ((d.client as unknown as { groupId?: string | null }).groupId) ?? '';
  const [sel, setSel] = useState(cur);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const save = async (groupId: string | null) => { try { await assign.mutateAsync({ id, data: { groupId } }); setMsg({ ok: true, t: groupId ? 'Group assigned.' : 'Removed from group.' }); if (!groupId) setSel(''); } catch (e) { setMsg({ ok: false, t: errText(e) }); } };
  return (
    <Card className="mt-3 space-y-2 p-3.5" data-testid="client-group-assign"><h2 className="text-[13px] font-semibold">Client group</h2>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto min-w-[200px]" value={sel} onChange={(e) => { setSel(e.target.value); setMsg(null); }} aria-label="Client group" data-testid="select-client-group"><option value="">No group</option>{(g.rows ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <Btn sm v="brand" disabled={assign.isPending || !sel} onClick={() => void save(sel)} data-testid="button-group-assign">Assign</Btn>
        <Btn sm disabled={assign.isPending || (!cur && !sel)} onClick={() => void save(null)} data-testid="button-group-remove">Remove from group</Btn>
      </div>
      {g.isError && <p role="alert" className="text-[12px] text-danger">{errText(g.error)}</p>}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-[12px] ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.t}</p>}
    </Card>
  );
}

export function ClientGroupsPage() {
  const g = useClientGroups();
  const { create } = useClientGroupMutations();
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const add = async () => { const n = name.trim(); if (!n) return setErr('Enter a group name.'); try { await create.mutateAsync({ data: { name: n } }); setName(''); setErr(''); } catch (e) { setErr(errText(e)); } };
  return (
    <div data-testid="client-groups-page">
      <div className="mb-3"><h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">Client Group</h1><p className="text-[12.5px] text-[hsl(var(--text-secondary))]">Create groups, then assign clients from their profile.</p></div>
      <Card className="mb-3 space-y-2 p-3"><form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}><input className="input w-auto min-w-[220px] flex-1" maxLength={100} value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder="New group name" aria-label="Group name" data-testid="input-client-group-name" /><Btn type="submit" v="brand" disabled={create.isPending} data-testid="button-client-group-create">Create group</Btn></form>{err && <p role="alert" className="text-[12px] text-danger">{err}</p>}</Card>
      <Card>{g.isLoading ? <div className="h-20 animate-pulse rounded bg-white/5" aria-busy="true" />
        : g.isError || !g.rows ? <div role="alert" className="flex flex-col items-center gap-2 p-6 text-center"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(g.error)}</p><Btn sm onClick={() => void g.refetch()}>Try again</Btn></div>
          : g.rows.length === 0 ? <EmptyState compact title="No client groups" description="Create your first group above." />
            : <ul className="divide-y">{g.rows.map((x) => <li key={x.id} className="p-3 text-[12.5px]" data-testid={`row-client-group-${x.id}`}>{x.name}</li>)}</ul>}</Card>
    </div>
  );
}
