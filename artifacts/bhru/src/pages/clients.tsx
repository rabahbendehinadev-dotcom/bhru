import { useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ArrowLeft, ArrowRight, Search, Users } from 'lucide-react';
import { Btn, Card } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { useClientList } from '@/hooks/use-clients';
import { errText } from '@/hooks/use-commerce';
import type { ResellerClient } from '@workspace/api-client-react';

const day = (s?: string | null) => { if (!s) return '-'; const d = new Date(s); return Number.isNaN(+d) ? '-' : d.toLocaleDateString(undefined, { dateStyle: 'medium' }); };
export const clientName = (c: ResellerClient) => `${c.firstName} ${c.lastName}`.trim() || c.email;

/** Compact registered-client table; reused by E-Commerce Customers (registered view). */
export function ClientTable({ embedded }: { embedded?: boolean }) {
  const [page, setPage] = useState(1);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | 'active' | 'blocked'>('');
  const q = useClientList({ page, ...(search ? { search } : {}), ...(status ? { status } : {}) });
  const rows = q.data?.data;
  return (
    <Card data-testid={embedded ? 'registered-clients' : 'clients-page'}>
      <form className="flex flex-wrap items-center gap-2 border-b p-2.5" onSubmit={(e) => { e.preventDefault(); setSearch(text.trim()); setPage(1); }}>
        <div className="relative min-w-[200px] flex-1">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="input pl-8" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, email, code, username or WhatsApp..." aria-label="Search clients" data-testid="input-client-search" />
        </div>
        <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} aria-label="Status filter" data-testid="select-client-status">
          <option value="">All statuses</option><option value="active">Active</option><option value="blocked">Blocked</option>
        </select>
        <Btn type="submit" v="brand" sm data-testid="button-client-search">Search</Btn>
        <Btn type="button" sm disabled={q.isFetching} onClick={() => void q.refetch()} data-testid="button-clients-refresh">Refresh</Btn>
      </form>
      {q.isLoading ? (
        <div className="space-y-2 p-3" aria-busy="true">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-8 animate-pulse rounded bg-white/5" />)}</div>
      ) : q.isError || !rows ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center" role="alert">
          <AlertTriangle size={18} className="text-danger" /><p className="text-[12.5px]">{errText(q.error)}</p>
          <Btn sm onClick={() => void q.refetch()} data-testid="button-clients-retry">Try again</Btn>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState compact icon={<Users size={18} />} title={search || status ? 'No clients match' : 'No registered clients yet'} description="Visitors who register on your public website appear here immediately, even before their first order." />
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Client / Email</th><th>Code</th><th>Username</th><th>WhatsApp</th><th>Location</th><th>Status</th><th>Currency</th><th>Orders</th><th>Available balance</th>{rows.some(c => BigInt(c.financial.lockedAmount) !== 0n) && <th>Locked balance</th>}<th>Joined</th><th>Actions</th></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id} data-testid={`row-client-${c.id}`}>
                <td className="min-w-[180px]"><Link href={`/m/clients/${c.id}`} className="font-semibold hover:text-[hsl(var(--brand))]" data-testid={`link-client-${c.id}`}>{clientName(c)}</Link><div className="text-[11px] text-muted-foreground">{c.email}</div></td>
                <td><Link href={`/m/clients/${c.id}`} className="font-mono text-[11.5px] hover:text-[hsl(var(--brand))]">{c.clientCode || c.username || '-'}</Link></td>
                <td>{c.username || '-'}</td>
                <td className="whitespace-nowrap">{c.whatsappPhone || '-'}</td>
                <td>{[c.city, c.countryCode].filter(Boolean).join(', ') || '-'}</td>
                <td><span className={`badge ${c.enabled ? 'bg-ok/20' : 'bg-danger/20'}`}>{c.enabled ? 'Active' : 'Blocked'}</span></td>
                <td>{c.effectiveCurrency || c.preferredCurrency || '-'}</td>
                <td>{c.orderCount}</td><td>{c.availableBalance}</td>{rows.some(row => BigInt(row.financial.lockedAmount) !== 0n) && <td data-testid={`text-locked-${c.id}`}>{c.financial.formattedLocked}</td>}<td className="whitespace-nowrap">{day(c.createdAt)}</td>
                <td><Link href={`/m/clients/${c.id}`} className="whitespace-nowrap font-medium text-[hsl(var(--brand))]">View / Manage</Link></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between border-t p-2.5 text-[12px]">
        <Btn sm disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-clients-prev"><ArrowLeft size={12} /> Previous</Btn>
        <span className="text-muted-foreground">Page {page}</span>
        <Btn sm disabled={!q.data?.hasMore} onClick={() => setPage(page + 1)} data-testid="button-clients-next">Next <ArrowRight size={12} /></Btn>
      </div>
    </Card>
  );
}

export default function ClientsPage() {
  return (
    <>
      <div className="mb-3"><h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">View / Search Clients</h1>
        <p className="text-[12.5px] text-[hsl(var(--text-secondary))]">Customers registered on your public website.</p></div>
      <ClientTable />
    </>
  );
}
