import { useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Search, ShoppingCart } from 'lucide-react';
import { Btn, Card, ConfirmDialog, Field, Modal, Badge } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { errText } from '@/hooks/use-commerce';
import { useOrderTransition, useServiceOrder, useServiceOrders, when, type OrderDto } from '@/hooks/use-services';

const TONE: Record<string, 'orange' | 'blue' | 'green' | 'red'> = { pending: 'orange', processing: 'blue', completed: 'green', rejected: 'red' };
export const OrderBadge = ({ s }: { s: string }) => <Badge tone={TONE[s] ?? 'gray'}><span className="capitalize">{s}</span></Badge>;

function Dl({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b py-1.5 text-[12.5px] last:border-0"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{v || '-'}</dd></div>;
}

export function OrderDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useServiceOrder(id);
  const tr = useOrderTransition();
  const [result, setResult] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [rej, setRej] = useState(false);
  const o: OrderDto | undefined = q.order;
  const go = async (status: 'processing' | 'completed' | 'rejected') => {
    setErr('');
    const data = { status, ...(status === 'completed' ? { result: result.trim() } : {}), ...(status === 'rejected' ? { reason: reason.trim() } : {}), ...(note.trim() ? { internalNote: note.trim() } : {}) };
    try { await tr.mutateAsync({ id, data }); setResult(''); setReason(''); setNote(''); return true; } catch (e) { setErr(errText(e)); return false; }
  };
  const complete = () => { if (!result.trim()) return setErr('Write the result the client will receive.'); void go('completed'); };
  const askReject = () => { if (!reason.trim()) return setErr('A rejection reason is required.'); setErr(''); setRej(true); };
  const open = o && (o.status === 'pending' || o.status === 'processing');
  return (
    <Modal open onClose={onClose} title={o ? `Order ${o.reference}` : 'Order'} width={600} footer={<Btn onClick={onClose} data-testid="button-order-close">Close</Btn>}>
      {q.isLoading ? <div className="h-32 animate-pulse rounded bg-white/5" aria-busy="true" />
        : q.isError || !o ? <div role="alert" className="flex flex-col items-center gap-2 p-4 text-center"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(q.error)}</p><Btn sm onClick={() => void q.refetch()}>Try again</Btn></div>
          : <div className="space-y-3" data-testid="order-detail">
            <dl><Dl k="Status" v={<OrderBadge s={o.status} />} /><Dl k="Service" v={`${o.serviceName} (${o.serviceType.toUpperCase()})`} /><Dl k="Client" v={`${o.clientName ?? ''} ${o.clientCode ? `(${o.clientCode})` : ''}`.trim()} />
              <Dl k="Amount" v={o.amountFormatted} /><Dl k="Placed" v={when(o.createdAt)} />{o.completedAt && <Dl k="Completed" v={when(o.completedAt)} />}{o.rejectedAt && <Dl k="Rejected" v={when(o.rejectedAt)} />}</dl>
            <div><h3 className="mb-1 text-[12px] font-semibold">Customer input</h3>{o.customerInput && Object.keys(o.customerInput).length ? <dl className="rounded-md border px-2.5">{Object.entries(o.customerInput).map(([k, v]) => <Dl key={k} k={k} v={<span className="whitespace-pre-wrap">{v}</span>} />)}</dl> : <p className="text-[12px] text-muted-foreground">No input.</p>}</div>
            {o.result && <div><h3 className="mb-1 text-[12px] font-semibold">Result</h3><p className="whitespace-pre-wrap break-words rounded-md border p-2 text-[12.5px]" data-testid="text-order-result">{o.result}</p></div>}
            {o.rejectionReason && <div><h3 className="mb-1 text-[12px] font-semibold">Rejection reason</h3><p className="whitespace-pre-wrap break-words rounded-md border p-2 text-[12.5px]" data-testid="text-order-reason">{o.rejectionReason}</p><p className="mt-1 text-[11.5px] text-muted-foreground">The amount was refunded to the client wallet automatically.</p></div>}
            {o.internalNote && <div><h3 className="mb-1 text-[12px] font-semibold">Internal note</h3><p className="whitespace-pre-wrap text-[12.5px]">{o.internalNote}</p></div>}
            {open ? <div className="space-y-2 border-t pt-3">
              <Field label="Result for the client (required to complete)"><textarea className="input min-h-[70px]" maxLength={4000} value={result} onChange={(e) => { setResult(e.target.value); setErr(''); }} data-testid="input-order-result" /></Field>
              <Field label="Rejection reason (required to reject)"><textarea className="input min-h-[50px]" maxLength={1000} value={reason} onChange={(e) => { setReason(e.target.value); setErr(''); }} data-testid="input-order-reason" /></Field>
              <Field label="Internal note (optional, never shown to the client)"><textarea className="input min-h-[40px]" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-order-note" /></Field>
              {err && <p role="alert" className="text-[12px] text-danger" data-testid="text-order-error">{err}</p>}
              <div className="flex flex-wrap gap-2">
                {o.status === 'pending' && <Btn v="primary" disabled={tr.isPending} onClick={() => void go('processing')} data-testid="button-order-processing">Mark processing</Btn>}
                <Btn v="ok" disabled={tr.isPending} onClick={complete} data-testid="button-order-complete">Complete with result</Btn>
                <Btn v="danger" disabled={tr.isPending} onClick={askReject} data-testid="button-order-reject">Reject and refund</Btn>
              </div></div>
              : <p className="border-t pt-2 text-[11.5px] text-muted-foreground" data-testid="text-order-terminal">This order is {o.status}. Final states cannot be changed.</p>}
          </div>}
      <ConfirmDialog open={rej} title="Reject this order?" body="The client is refunded automatically and the order becomes final. This cannot be undone." confirmLabel="Reject and refund" danger onConfirm={async () => (await go('rejected'))} onClose={() => setRej(false)} />
    </Modal>
  );
}

export default function ServiceOrdersPage({ type, title, history }: { type?: string; title: string; history?: boolean }) {
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(history ? 'completed' : '');
  const [stype, setStype] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = useServiceOrders({ page, ...(search ? { search } : {}), ...(status ? { status } : {}), ...((type ?? stype) ? { serviceType: type ?? stype } : {}) });
  const s = q.summary;
  return (
    <div data-testid="service-orders-page">
      <div className="mb-3"><h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">{title}</h1><p className="text-[12.5px] text-[hsl(var(--text-secondary))]">Manual service orders placed from your customer panel.</p></div>
      {s && !history && <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5" data-testid="order-summary">{([['Total', s.totalOrders], ['Pending', s.pending], ['Processing', s.processing], ['Completed', s.completed], ['Rejected', s.rejected]] as const).map(([k, v]) => <Card key={k} className="p-2.5"><div className="text-[11px] text-muted-foreground">{k}</div><div className="text-[20px] font-bold" data-testid={`stat-orders-${k.toLowerCase()}`}>{v}</div></Card>)}</div>}
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b p-2.5" onSubmit={(e) => { e.preventDefault(); setSearch(text.trim()); setPage(1); }}>
          <div className="relative min-w-[200px] flex-1"><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="input pl-8" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search reference, client or service..." aria-label="Search orders" data-testid="input-order-search" /></div>
          <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status filter" data-testid="select-order-status">
            {!history && <option value="">All statuses</option>}{!history && <option value="pending">Pending</option>}{!history && <option value="processing">Processing</option>}<option value="completed">Completed</option><option value="rejected">Rejected</option></select>
          {!type && <select className="input w-auto" value={stype} onChange={(e) => { setStype(e.target.value); setPage(1); }} aria-label="Type filter" data-testid="select-order-type"><option value="">All types</option><option value="imei">IMEI</option><option value="server">Server</option><option value="file">File</option><option value="remote">Remote</option></select>}
          <Btn type="submit" v="brand" sm data-testid="button-order-search">Search</Btn><Btn type="button" sm disabled={q.isFetching} onClick={() => void q.refetch()} data-testid="button-orders-refresh">Refresh</Btn>
        </form>
        {q.isLoading ? <div className="space-y-2 p-3" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-white/5" />)}</div>
          : q.isError || !q.rows ? <div className="flex flex-col items-center gap-2 p-8 text-center" role="alert"><AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(q.error)}</p><Btn sm onClick={() => void q.refetch()} data-testid="button-orders-retry">Try again</Btn></div>
            : q.rows.length === 0 ? <EmptyState compact icon={<ShoppingCart size={18} />} title="No service orders" description="Orders appear here as soon as a client buys a service." />
              : <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th>Reference</th><th>Client</th><th>Service</th><th>Type</th><th>Amount</th><th>Status</th><th>Placed</th><th>Actions</th></tr></thead>
                <tbody>{q.rows.map((o) => <tr key={o.id} data-testid={`row-service-order-${o.id}`}><td className="font-mono text-[11.5px]">{o.reference}</td><td>{o.clientName || '-'}<div className="text-[11px] text-muted-foreground">{o.clientCode}</div></td><td>{o.serviceName}</td><td className="uppercase">{o.serviceType}</td><td>{o.amountFormatted}</td><td><OrderBadge s={o.status} /></td><td className="whitespace-nowrap">{when(o.createdAt)}</td>
                  <td><Btn sm onClick={() => setOpen(o.id)} data-testid={`button-order-open-${o.id}`}>Open</Btn></td></tr>)}</tbody></table></div>}
        <div className="flex items-center justify-between border-t p-2.5 text-[12px]"><Btn sm disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-orders-prev"><ArrowLeft size={12} /> Previous</Btn><span className="text-muted-foreground">Page {page}</span><Btn sm disabled={!q.hasMore} onClick={() => setPage(page + 1)} data-testid="button-orders-next">Next <ArrowRight size={12} /></Btn></div>
      </Card>
      {open && <OrderDetailModal id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
