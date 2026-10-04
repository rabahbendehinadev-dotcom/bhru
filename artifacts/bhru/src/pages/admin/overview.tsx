import { Link } from 'wouter';
import { AdminShell } from '@/components/bhru/shells';
import { Card, CardHead, PlanBadge, SubStatus } from '@/components/bhru/ui';
import { StatCards } from './subscribers';
import { effectiveStatus, fmtDateTime, useStore, fmtDate, daysLeft } from '@/lib/store';

function Page() {
  const { subscribers, plans } = useStore();
  const recent = [...subscribers].sort((a, b) => +new Date(b.registeredAt) - +new Date(a.registeredAt)).slice(0, 6);
  const expiring = subscribers.filter((s) => ['ACTIVE', 'TRIAL'].includes(effectiveStatus(s)) && daysLeft(s.expiresAt)! <= 30).sort((a, b) => +new Date(a.expiresAt!) - +new Date(b.expiresAt!));
  const mrr = subscribers.filter((s) => effectiveStatus(s) === 'ACTIVE').reduce((n, s) => n + (plans.find((p) => p.name === s.plan)?.price || 0), 0);
  const attention = subscribers.filter((s) => effectiveStatus(s) === 'PENDING');
  return (
    <div className="space-y-3">
      <div><h1 className="text-[18px] font-semibold">Platform Dashboard</h1><p className="text-[12.5px] text-muted-foreground">Overview of BHRU subscribers. Figures come from the demo subscribers in this browser.</p></div>
      <StatCards />
      <div className="grid gap-3 xl:grid-cols-[1.6fr_1fr]">
        <Card className="pb-1">
          <CardHead title="Recent registrations" right={<Link href="/admin/subscribers" className="link">View all</Link>} />
          <div className="scroll-thin mt-1 overflow-x-auto"><table className="tbl"><thead><tr><th>Business</th><th>Owner</th><th>Country</th><th>Plan</th><th>Status</th><th>Registered</th></tr></thead>
            <tbody>{recent.map((s) => <tr key={s.id} data-testid={`row-recent-${s.id}`}><td className="font-semibold">{s.business}</td><td>{s.owner}</td><td>{s.country}</td><td><PlanBadge plan={s.plan} /></td><td><SubStatus sub={s} /></td><td>{fmtDateTime(s.registeredAt)}</td></tr>)}</tbody></table></div>
        </Card>
        <div className="space-y-3">
          <Card className="p-3.5"><div className="text-[12px] text-muted-foreground">Provisional monthly recurring (Active x plan price)</div><div className="mt-1 text-[24px] font-semibold tabular-nums" data-testid="text-mrr">${mrr.toLocaleString()}</div><div className="text-[11px] text-muted-foreground">Demo prices, not billing data</div></Card>
          <Card className="pb-2"><CardHead title={`Awaiting approval (${attention.length})`} />
            <ul className="space-y-1 px-3.5 pt-2 text-[12.5px]">{attention.length ? attention.map((s) => <li key={s.id} className="flex justify-between"><span>{s.business}</span><span className="text-muted-foreground">{fmtDate(s.registeredAt)}</span></li>) : <li className="text-muted-foreground">Nothing pending.</li>}</ul></Card>
          <Card className="pb-2"><CardHead title="Expiring within 30 days" />
            <ul className="space-y-1 px-3.5 pt-2 text-[12.5px]">{expiring.length ? expiring.map((s) => <li key={s.id} className="flex justify-between"><span>{s.business}</span><span className="text-warn">{fmtDate(s.expiresAt)} ({daysLeft(s.expiresAt)}d)</span></li>) : <li className="text-muted-foreground">None.</li>}</ul></Card>
        </div>
      </div>
    </div>
  );
}
export default function Overview() { return <AdminShell><Page /></AdminShell>; }
