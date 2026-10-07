import { type ReactNode, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import {
  Users, UserCheck, Clock, Hourglass, PauseCircle, XCircle, Layers, CalendarClock, CalendarX, UserRoundCheck, ShoppingCart, Globe,
  Eye, ChevronRight, AlertTriangle, CheckCircle2, CreditCard, KeyRound, Puzzle, UserPlus, MoreHorizontal, ArrowRight, Inbox,
} from 'lucide-react';
import { useAdminPath } from '@/lib/admin-entry';
import { AdminShell } from '@/components/bhru/shells';
import { PlanBadge, SubStatus } from '@/components/bhru/ui';
import { useAttention } from '@/components/platform-admin/attention';
import { useAdminSummary } from '@/hooks/use-admin-summary';
import { cn } from '@/lib/utils';
import { effectiveStatus, fmtDate, fmtDateTime, previewAs, useStore, type Subscriber } from '@/lib/store';

const DASH = '—';
const MODULE_LABEL: Record<string, string> = { ecommerce: 'E-Commerce' };
const label = (k: string) => MODULE_LABEL[k] || k.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const STATUS_COLORS: Record<string, string> = { ACTIVE: '#16a34a', TRIAL: '#2563eb', PENDING: '#f59e0b', SUSPENDED: '#dc2626', EXPIRED: '#94a3b8', REVOKED: '#64748b' };
const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Active', TRIAL: 'Trial', PENDING: 'Pending', SUSPENDED: 'Suspended', EXPIRED: 'Expired', REVOKED: 'Revoked' };
const tick = { fontSize: 11, style: { fill: 'hsl(var(--muted-foreground))' } };

function Panel({ title, right, children, className }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('card flex min-w-0 flex-col', className)}>
      <div className="card-h pb-2"><span className="flex items-center gap-2">{title}</span>{right}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

function Kpi({ label: l, value, icon, tint, href, id }: { label: string; value: ReactNode; icon: ReactNode; tint: string; href?: string; id: string }) {
  const body = (
    <>
      <div className={cn('ae-kpi-ic', tint)}>{icon}</div>
      <div className="min-w-0">
        <div className="truncate text-[11.5px] text-muted-foreground">{l}</div>
        <div className="text-[22px] font-semibold leading-tight tabular-nums">{value}</div>
        {href && <div className="text-[10.5px] font-medium text-primary">View all <ArrowRight size={9} className="inline" /></div>}
      </div>
    </>
  );
  return href
    ? <Link href={href} className="card ae-kpi" data-testid={`kpi-${id}`}>{body}</Link>
    : <div className="card ae-kpi" data-testid={`kpi-${id}`}>{body}</div>;
}

function Page() {
  const adminPath = useAdminPath();
  const [, nav] = useLocation();
  const { subscribers, plans, logs } = useStore();
  const summary = useAdminSummary();
  const sd = summary.isError ? undefined : summary.data;
  const attention = useAttention();
  const subsHref = `${adminPath}/subscribers`;
  const c = (s: string) => subscribers.filter((x) => effectiveStatus(x) === s).length;
  const num = (n: number | undefined) => (n === undefined ? DASH : n);

  const mods = useMemo(() => new Map((sd?.subscribers ?? []).map((s) => [s.id, s.modules])), [sd]);
  const ecommerce = sd?.modules.find((m) => m.key === 'ecommerce')?.enabled;
  const total = subscribers.length;

  const recent = useMemo(() => [...subscribers].sort((a, b) => +new Date(b.registeredAt) - +new Date(a.registeredAt)).slice(0, 6), [subscribers]);
  const statusData = (['ACTIVE', 'TRIAL', 'PENDING', 'SUSPENDED', 'EXPIRED', 'REVOKED'] as const).map((k) => ({ key: k, name: STATUS_LABEL[k], value: c(k) }));
  const planData = useMemo(() => {
    const m = new Map<string, number>();
    subscribers.forEach((s) => { const n = s.planId && s.plan ? s.plan : 'Unassigned'; m.set(n, (m.get(n) || 0) + 1); });
    return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [subscribers, plans]);
  const activity = useMemo(() => [...logs].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 6), [logs]);

  const preview = (s: Subscriber) => { previewAs(s.id); nav('/'); };
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  const usage: { key: string; name: string; used: number; icon: ReactNode; tint: string; color: string; note: string }[] = [
    ...(sd?.modules ?? []).map((m) => ({ key: m.key, name: label(m.key), used: m.enabled, icon: <ShoppingCart size={16} />, tint: 'ae-tint-green', color: '#16a34a', note: 'Module grants' })),
    ...(sd ? [{ key: 'websites', name: 'Public Websites Configured', used: sd.publicWebsites, icon: <Globe size={16} />, tint: 'ae-tint-violet', color: '#7c3aed', note: 'Configuration only, not a licence grant' }] : []),
  ];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Platform Dashboard</h1>
        <p className="text-[12.5px] text-muted-foreground">Overview of BHRU subscribers and platform activity.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi id="total" label="Total Subscribers" value={total} icon={<Users size={19} />} tint="ae-tint-blue" href={subsHref} />
        <Kpi id="active" label="Active" value={c('ACTIVE')} icon={<UserCheck size={19} />} tint="ae-tint-green" href={subsHref} />
        <Kpi id="trial" label="Trial" value={c('TRIAL')} icon={<Clock size={19} />} tint="ae-tint-blue" href={subsHref} />
        <Kpi id="pending" label="Pending" value={c('PENDING')} icon={<Hourglass size={19} />} tint="ae-tint-orange" href={subsHref} />
        <Kpi id="suspended" label="Suspended" value={c('SUSPENDED')} icon={<PauseCircle size={19} />} tint="ae-tint-red" href={subsHref} />
        <Kpi id="expired" label="Expired" value={c('EXPIRED')} icon={<XCircle size={19} />} tint="ae-tint-gray" href={subsHref} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi id="live" label="Active Subscriptions" value={subscribers.filter((s) => s.allowed).length} icon={<Layers size={19} />} tint="ae-tint-violet" />
        <Kpi id="exp7" label="Expiring in 7 days" value={attention.exp7} icon={<CalendarClock size={19} />} tint="ae-tint-orange" />
        <Kpi id="exp30" label="Expiring in 30 days" value={attention.exp30} icon={<CalendarX size={19} />} tint="ae-tint-orange" />
        <Kpi id="approvals" label="Pending Approvals" value={c('PENDING')} icon={<UserRoundCheck size={19} />} tint="ae-tint-blue" />
        <Kpi id="ecommerce" label="E-Commerce Enabled" value={sd ? (ecommerce ?? 0) : DASH} icon={<ShoppingCart size={19} />} tint="ae-tint-green" />
        <Kpi id="websites" label="Public Websites Configured" value={num(sd?.publicWebsites)} icon={<Globe size={19} />} tint="ae-tint-violet" />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Recent Subscribers" right={<Link href={subsHref} className="link">View all subscribers <ChevronRight size={11} className="inline" /></Link>}>
          {recent.length ? (
            <div className="scroll-thin overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>Business</th><th>Owner</th><th>Plan</th><th>Status</th><th>Modules</th><th>Registered</th><th>Expiry</th><th className="text-right">Actions</th></tr></thead>
                <tbody>
                  {recent.map((s) => {
                    const m = mods.get(s.id);
                    return (
                      <tr key={s.id} data-testid={`row-recent-${s.id}`}>
                        <td className="font-semibold">{s.business}</td><td>{s.owner}</td>
                        <td><PlanBadge plan={s.plan} /></td><td><SubStatus sub={s} /></td>
                        <td>{!sd ? DASH : m && m.length ? <span className="flex gap-1">{m.map((k) => <span key={k} className="badge bg-[hsl(var(--ok)/.13)] text-[hsl(152_62%_24%)]">{label(k)}</span>)}</span> : <span className="text-muted-foreground">None</span>}</td>
                        <td>{fmtDateTime(s.registeredAt)}</td><td>{fmtDate(s.expiresAt)}</td>
                        <td><span className="flex justify-end gap-1.5">
                          <button className="ae-iconbtn !h-7 !w-7" title="Preview as this subscriber" aria-label={`Preview ${s.business}`} onClick={() => preview(s)}><Eye size={13} /></button>
                          <Link href={`${subsHref}?subscriber=${encodeURIComponent(s.id)}`} className="ae-iconbtn !h-7 !w-7" title="Manage subscriber" aria-label={`Manage ${s.business}`}><MoreHorizontal size={13} /></Link>
                        </span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <Empty text="No subscribers have registered yet." />}
        </Panel>

        <Panel title={<>Needs Attention {attention.count > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[hsl(var(--danger))] px-1 text-[10.5px] font-bold text-white">{attention.count}</span>}</>}
          right={<Link href={subsHref} className="link">View all</Link>}>
          <ul className="space-y-1 px-2 pb-2">
            {attention.items.map((n) => {
              const inner = (
                <>
                  <span className={cn('ae-kpi-ic !h-9 !w-9', n.tone === 'ok' ? 'ae-tint-green' : n.tone === 'danger' ? 'ae-tint-red' : 'ae-tint-orange')}>{n.tone === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{n.title}</span><span className="block truncate text-[11px] text-muted-foreground">{n.detail}</span></span>
                  {n.tone !== 'ok' && <ChevronRight size={14} className="text-muted-foreground" />}
                </>
              );
              return <li key={n.key}>{n.tone === 'ok'
                ? <div className="ae-row rounded-lg" style={{ cursor: 'default' }}>{inner}</div>
                : <Link href={`${subsHref}?subscriber=${encodeURIComponent(n.subscriberId || '')}`} className="ae-row rounded-lg" data-testid={`attention-${n.key}`}>{inner}</Link>}</li>;
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr]">
        <Panel title="Subscription Status">
          {total ? (
            <div className="flex items-center gap-3 px-3 pb-3">
              <div className="relative h-[150px] w-[150px] flex-none">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={statusData.filter((d) => d.value)} dataKey="value" innerRadius={48} outerRadius={70} paddingAngle={2} stroke="none">
                    {statusData.filter((d) => d.value).map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key]} />)}
                  </Pie><Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} /></PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><div className="text-[22px] font-semibold leading-none">{total}</div><div className="text-[10px] text-muted-foreground">Subscribers</div></div></div>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5 text-[12px]">
                {statusData.map((d) => (
                  <li key={d.key} className="flex items-center gap-2"><i className="h-2 w-2 flex-none rounded-full" style={{ background: STATUS_COLORS[d.key] }} /><span className="flex-1 truncate">{d.name}</span><b className="tabular-nums">{d.value}</b><span className="w-9 text-right tabular-nums text-muted-foreground">{pct(d.value)}%</span></li>
                ))}
              </ul>
            </div>
          ) : <Empty text="No subscriber data to chart." />}
        </Panel>

        <Panel title="Top Plans" right={<Link href={`${adminPath}/plans`} className="link">View all</Link>}>
          {planData.length ? (
            <div className="h-[170px] px-2 pb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={planData} margin={{ top: 14, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={tick} tickLine={false} axisLine={false} interval={0} />
                  <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(100,116,139,.08)' }} contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v) => [v as number, 'Subscribers']} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>{planData.map((d, i) => <Cell key={d.name} fill={d.name === 'Unassigned' ? '#93c5fd' : i === 0 ? '#f97316' : '#fdba74'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty text="No plan assignments yet." />}
        </Panel>

        <Panel title="Module Usage" right={<Link href={subsHref} className="link">Manage per subscriber</Link>}>
          <div className="space-y-3 px-3.5 pb-3.5">
            {summary.isLoading ? [0, 1].map((k) => <div key={k} className="ae-skel h-9" />)
              : !sd ? <div className="py-5 text-center text-[12px] text-muted-foreground">Usage unavailable {DASH} <button className="link ml-1" onClick={() => void summary.refetch()}>Retry</button></div>
              : usage.map((u) => {
                const p = total ? Math.min(100, Math.round((u.used / total) * 100)) : 0;
                return (
                  <div key={u.key} className="flex items-center gap-3" data-testid={`usage-${u.key}`}>
                    <div className={cn('ae-kpi-ic !h-9 !w-9', u.tint)}>{u.icon}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-[12px]"><span className="truncate font-semibold">{u.name}</span><span className="tabular-nums text-muted-foreground">{u.used} / {total} <b className="text-foreground">{p}%</b></span></div>
                      <div className="ae-bar mt-1"><i style={{ width: `${p}%`, background: u.color }} /></div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">{u.note}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Recent Activity" right={<Link href={`${adminPath}/logs`} className="link">View all</Link>}>
          {activity.length ? (
            <div className="scroll-thin overflow-x-auto">
              <table className="tbl"><thead><tr><th>Date</th><th>Actor</th><th>Event</th><th>Target</th></tr></thead>
                <tbody>{activity.map((l) => <tr key={l.id}><td>{fmtDateTime(l.at)}</td><td>{l.actor}</td><td className="font-medium">{l.action}</td><td className="text-muted-foreground">{l.target}</td></tr>)}</tbody></table>
            </div>
          ) : <Empty text="No activity has been logged yet." />}
        </Panel>

        <Panel title="Quick Actions">
          <div className="grid grid-cols-1 gap-2.5 px-3.5 pb-3.5 sm:grid-cols-2">
            {[
              { t: 'Review Subscribers', d: 'Approve, edit and manage', i: <UserPlus size={17} />, tint: 'ae-tint-blue', h: subsHref },
              { t: 'Manage Plans', d: 'View and edit plans', i: <CreditCard size={17} />, tint: 'ae-tint-green', h: `${adminPath}/plans` },
              { t: 'Manage Licences', d: 'View and manage licences', i: <KeyRound size={17} />, tint: 'ae-tint-violet', h: `${adminPath}/licences` },
              { t: 'Module Grants', d: 'Set per subscriber', i: <Puzzle size={17} />, tint: 'ae-tint-orange', h: `${subsHref}?view=modules` },
            ].map((a) => (
              <Link key={a.t} href={a.h} className="ae-action" data-testid={`action-${a.t.toLowerCase().replace(/\s+/g, '-')}`}>
                <span className={cn('ae-kpi-ic !h-9 !w-9', a.tint)}>{a.i}</span>
                <span className="min-w-0 flex-1"><span className="block text-[12px] font-semibold">{a.t}</span><span className="block truncate text-[10.5px] text-muted-foreground">{a.d}</span></span>
                <ArrowRight size={13} className="text-muted-foreground" />
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="grid place-items-center gap-1.5 px-4 py-8 text-center text-[12px] text-muted-foreground"><span className="ae-kpi-ic ae-tint-gray"><Inbox size={18} /></span>{text}</div>;
}

export default function Overview() { return <AdminShell><Page /></AdminShell>; }
