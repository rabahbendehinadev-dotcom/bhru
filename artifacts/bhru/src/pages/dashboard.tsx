import { useMemo } from 'react';
import { Link } from 'wouter';
import { ShoppingCart, Smartphone, Server, Monitor, Users, TrendingUp, Database, CircleDollarSign, UserPlus, Layers, Plug, RefreshCw, LayoutGrid, Tags, BarChart3, CalendarDays } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SubscriberShell } from '@/components/bhru/shells';
import { Card, CardHead, Metric, Badge } from '@/components/bhru/ui';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/utils';

const p2 = (n: number) => String(n).padStart(2, '0');
const dm = (d: Date) => `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
const dmt = (d: Date) => `${dm(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
const ago = (min: number) => new Date(Date.now() - min * 60000);
const ST: Record<string, string> = { Completed: 'green', Processing: 'blue', Pending: 'orange', Rejected: 'red', Success: 'green', Error: 'red', Credit: 'green', Debit: 'red' };
const TONE_BG = (s: string) => ({ green: 'bg-ok/20 text-[hsl(152_60%_58%)]', blue: 'bg-primary/20 text-[hsl(217_95%_72%)]', orange: 'bg-warn/20 text-[hsl(30_95%_62%)]', red: 'bg-danger/20 text-[hsl(0_90%_72%)]' } as Record<string, string>)[ST[s]];
const Pill = ({ s }: { s: string }) => <span className={cn('badge', TONE_BG(s))}>{s}</span>;

const COLORS = { c: 'hsl(152 60% 42%)', p: 'hsl(217 91% 56%)', w: 'hsl(38 95% 55%)', r: 'hsl(0 72% 56%)' };

function Dash() {
  const st = useStore();
  const sub = st.subscribers.find((s) => s.id === st.session.subscriberId)!;
  const month = useMemo(() => {
    const n = new Date();
    const start = new Date(n.getTime() - 29 * 86400000);
    const format = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${format(start)} - ${format(n)}`;
  }, []);
  const series = useMemo(() => {
    const days = 30; const out = [];
    for (let k = days - 1; k >= 0; k--) {
      const d = new Date(Date.now() - k * 86400000);
      out.push({ day: dm(d), IMEI: 0, Server: 0, Remote: 0, Retail: 0 });
    }
    return out;
  }, []);
  const status = [{ n: 'Completed', v: 0, c: COLORS.c }, { n: 'Processing', v: 0, c: COLORS.p }, { n: 'Pending', v: 0, c: COLORS.w }, { n: 'Rejected', v: 0, c: COLORS.r }];
  const top: [string, number, string][] = [];
  const orders: [string, string, string, string, string, number][] = [];
  const custs: [string, string, string, number, number][] = [];
  const sup: [string, string, string, number, number][] = [];
  const tx: [string, string, string, string, number][] = [];
  const logs: [number, string, string, string][] = [];
  const qa = [['Add Customer', UserPlus, 'bg-ok', 'add-customer'], ['Manage Services', Layers, 'bg-primary', 'manage-services'], ['Manage APIs', Plug, 'bg-warn', 'manage-apis'], ['Sync Services', RefreshCw, 'bg-violet', 'sync-services'], ['Categories', LayoutGrid, 'bg-primary/80', 'categories'], ['Pricing', Tags, 'bg-secondary', 'pricing'], ['Reports', BarChart3, 'bg-primary', 'reports-graphs']] as const;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-[20px] font-semibold">Dashboard</h1></div>
          <p className="text-[12.5px] text-muted-foreground">Welcome back, {sub.business}. Here is your server overview.</p>
          <p className="text-[11px] text-muted-foreground">Business modules are not enabled yet. No orders, services or financial data are available.</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-[12px]"><CalendarDays size={13} className="text-muted-foreground" />{month}</div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total Orders" value="—" delta={0} icon={<ShoppingCart size={18} />} tone="bg-primary" />
        <Metric label="IMEI Orders" value="—" delta={0} icon={<Smartphone size={18} />} tone="bg-ok" />
        <Metric label="Server Orders" value="—" delta={0} icon={<Server size={18} />} tone="bg-violet" />
        <Metric label="Remote Orders" value="—" delta={0} icon={<Monitor size={18} />} tone="bg-warn" />
        <Metric label="Total Customers" value="—" delta={0} icon={<Users size={18} />} tone="bg-primary" />
        <Metric label="Revenue" value="—" delta={0} icon={<TrendingUp size={18} />} tone="bg-ok" />
        <Metric label="Supplier Cost" value="—" delta={0} icon={<Database size={18} />} tone="bg-danger" />
        <Metric label="Estimated Profit" value="—" delta={0} icon={<CircleDollarSign size={18} />} tone="bg-ok" />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.7fr_1fr_1fr]">
        <Card className="pb-2">
          <CardHead title="Orders Overview" right={<span className="flex gap-3 text-[11px] text-muted-foreground">{[['IMEI', COLORS.p], ['Server', 'hsl(262 70% 62%)'], ['Remote', COLORS.w], ['Retail', COLORS.c]].map(([l, c]) => <span key={l} className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ background: c }} />{l}</span>)}</span>} />
          <div className="h-[210px] px-2 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ left: -18, right: 8, top: 4 }}>
                <CartesianGrid stroke="hsl(222 24% 18%)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: 'hsl(218 15% 62%)', fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: 'hsl(218 15% 62%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(222 36% 11%)', border: '1px solid hsl(222 24% 22%)', borderRadius: 6, fontSize: 12 }} />
                <Area type="monotone" dataKey="IMEI" stroke={COLORS.p} fill={COLORS.p} fillOpacity={0.25} strokeWidth={1.5} isAnimationActive={false} />
                <Area type="monotone" dataKey="Server" stroke="hsl(262 70% 62%)" fill="hsl(262 70% 62%)" fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false} />
                <Area type="monotone" dataKey="Remote" stroke={COLORS.w} fill={COLORS.w} fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false} />
                <Area type="monotone" dataKey="Retail" stroke={COLORS.c} fill={COLORS.c} fillOpacity={0.2} strokeWidth={1.5} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="pb-3">
          <CardHead title="Orders by Status" />
          <div className="flex items-center gap-3 px-3 pt-3">
            <div className="relative h-[150px] w-[150px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={status} dataKey="v" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none" isAnimationActive={false}>{status.map((s) => <Cell key={s.n} fill={s.c} />)}</Pie></PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-[18px] font-semibold leading-none">—</div><div className="text-[10px] text-muted-foreground">Orders</div></div></div>
            </div>
            <ul className="flex-1 space-y-2 text-[12px]">{status.map((s) => <li key={s.n} className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.c }} />{s.n}<b className="ml-auto font-medium">{s.v}%</b></li>)}</ul>
          </div>
        </Card>
        <Card className="pb-3">
          <CardHead title="Top Services" right={<span className="link">View all</span>} />
          <ul className="space-y-2.5 px-3.5 pt-3">
            {top.map(([n, v, c], k) => (
              <li key={n} className="flex items-center gap-2 text-[12px]">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-primary/30 text-[9px] font-bold">{k + 1}</span><span className="w-[88px] truncate">{n}</span>
                <span className="h-1.5 flex-1 rounded bg-muted"><span className={cn('block h-full rounded', c)} style={{ width: `${(v / 450) * 100}%` }} /></span><b className="w-8 text-right font-medium tabular-nums">{v}</b>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="overflow-x-auto pb-1">
          <CardHead title="Recent Orders" demo right={<span className="link">View all</span>} />
          <table className="tbl mt-1"><thead><tr><th>#ID</th><th>Customer</th><th>Service</th><th>Price</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>{orders.map((o) => <tr key={o[0]}><td className="text-muted-foreground">{o[0]}</td><td>{o[1]}</td><td>{o[2]}</td><td>{o[3]}</td><td><Pill s={o[4]} /></td><td className="text-muted-foreground">{dmt(ago(o[5]))}</td></tr>)}</tbody></table>
        </Card>
        <Card className="overflow-x-auto pb-1">
          <CardHead title="Recent Customers" demo right={<span className="link">View all</span>} />
          <p className="px-3.5 text-[10.5px] text-muted-foreground">Customers of {sub.business} (not BHRU subscribers)</p>
          <table className="tbl"><thead><tr><th>Name</th><th>Group</th><th>Balance</th><th>Orders</th><th>Date</th></tr></thead>
            <tbody>{custs.map((c) => <tr key={c[0]}><td>{c[0]}</td><td><Badge tone={c[1] === 'VIP' ? 'violet' : c[1] === 'Reseller' ? 'blue' : 'gray'}>{c[1]}</Badge></td><td>{c[2]}</td><td>{c[3]}</td><td className="text-muted-foreground">{dm(ago(c[4]))}</td></tr>)}</tbody></table>
        </Card>
        <Card className="overflow-x-auto pb-1">
          <CardHead title="Supplier / API Status" demo right={<span className="link">View all</span>} />
          <table className="tbl mt-1"><thead><tr><th>Supplier</th><th>Balance</th><th>Status</th><th>Errors</th><th>Stuck</th></tr></thead>
            <tbody>{sup.map((s) => <tr key={s[0]}><td>{s[0]}</td><td>{s[1]}</td><td><span className="flex items-center gap-1.5"><i className={cn('h-1.5 w-1.5 rounded-full', s[2] === 'Online' ? 'bg-ok' : 'bg-danger')} />{s[2]}</span></td><td className={s[3] ? 'text-warn' : 'text-muted-foreground'}>{s[3]}</td><td className={s[4] ? 'text-danger' : 'text-muted-foreground'}>{s[4]}</td></tr>)}</tbody></table>
          <p className="px-3.5 pb-2 pt-1 text-[10.5px] text-muted-foreground">Supplier connections are planned for a later stage.</p>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_1fr_1fr]">
        <Card className="overflow-x-auto pb-1">
          <CardHead title="Latest Transactions" demo right={<span className="link">View all</span>} />
          <table className="tbl mt-1"><thead><tr><th>#ID</th><th>Type</th><th>Description</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>{tx.map((t) => <tr key={t[0]}><td className="text-muted-foreground">{t[0]}</td><td><Pill s={t[1]} /></td><td>{t[2]}</td><td className={t[3].startsWith('+') ? 'text-ok' : 'text-danger'}>{t[3]}</td><td className="text-muted-foreground">{dmt(ago(t[4]))}</td></tr>)}</tbody></table>
        </Card>
        <Card className="overflow-x-auto pb-1">
          <CardHead title="Recent API Logs" demo right={<span className="link">View all</span>} />
          <table className="tbl mt-1"><thead><tr><th>Time</th><th>Supplier</th><th>Message</th><th>Status</th></tr></thead>
            <tbody>{logs.map((l, k) => <tr key={k}><td className="text-muted-foreground">{p2(ago(l[0]).getHours())}:{p2(ago(l[0]).getMinutes())}</td><td>{l[1]}</td><td>{l[2]}</td><td><Pill s={l[3]} /></td></tr>)}</tbody></table>
        </Card>
        <Card className="pb-3">
          <CardHead title="Quick Actions" />
          <div className="grid grid-cols-3 gap-2 px-3 pt-3">
            {qa.map(([l, Icon, c, slug]) => (
              <Link key={l} href={`/m/${slug}`} data-testid={`quick-${slug}`} className={cn('flex h-[62px] flex-col items-center justify-center gap-1 rounded-lg text-[11.5px] font-medium text-white hover:brightness-110', c)}><Icon size={17} />{l}</Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
export default function Dashboard() { return <SubscriberShell><Dash /></SubscriberShell>; }
