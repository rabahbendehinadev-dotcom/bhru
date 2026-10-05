import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronDown, FileText, Monitor, Server, Smartphone, Info } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SubscriberShell } from '@/components/bhru/shells';
import { PageHeader } from '@/components/subscriber/PageHeader';

const RANGES = [3, 6, 12, 24] as const;
const SERIES = [
  { key: 'IMEI', label: 'IMEI Orders', token: '--c-imei' },
  { key: 'Server', label: 'Server Orders', token: '--c-server' },
  { key: 'Remote', label: 'Remote Orders', token: '--c-remote' },
  { key: 'Retail', label: 'Retail Orders', token: '--c-retail' },
] as const;
const mlabel = (d: Date) => `${d.toLocaleDateString('en-GB', { month: 'short' })} ${d.getFullYear()}`;

// No business order dataset exists in the platform state yet, so every count is a true zero.
const CARDS = [
  { title: 'IMEI ORDER', token: '--c-imei', icon: Smartphone, id: 'imei' },
  { title: 'SERVER ORDER', token: '--c-server', icon: Server, id: 'server' },
  { title: 'REMOTE ORDER', token: '--c-remote', icon: Monitor, id: 'remote' },
] as const;

function usePhone() {
  const q = '(max-width: 639px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const l = window.matchMedia(q); const f = () => setM(l.matches); l.addEventListener('change', f); return () => l.removeEventListener('change', f); }, []);
  return m;
}

function Dash() {
  const phone = usePhone();
  const [months, setMonths] = useState<number>(12);
  const { data, label } = useMemo(() => {
    const now = new Date();
    const rows = [];
    for (let k = months - 1; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      rows.push({ month: mlabel(d), IMEI: 0, Server: 0, Remote: 0, Retail: 0 });
    }
    return { data: rows, label: `${rows[0].month} - ${rows[rows.length - 1].month}` };
  }, [months]);

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your business and orders"
        actions={
          <label className="sl-field relative h-9 cursor-pointer text-[hsl(var(--text-primary))]" data-testid="select-date-range-wrap">
            <CalendarDays size={14} className="text-[hsl(var(--text-secondary))]" />
            <span className="font-medium">{label}</span>
            <ChevronDown size={13} className="text-[hsl(var(--text-secondary))]" />
            <select aria-label="Date range" data-testid="select-date-range" value={months} onChange={(e) => setMonths(Number(e.target.value))} className="absolute inset-0 cursor-pointer opacity-0">
              {RANGES.map((r) => <option key={r} value={r}>Last {r} months</option>)}
            </select>
          </label>
        } />

      <section className="sl-surface p-4 sm:p-5" aria-label="Orders chart">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[16px] font-bold" data-testid="text-chart-title">Last {months} Months Orders</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[hsl(var(--text-secondary))]">
            {SERIES.map((s) => <li key={s.key} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: `hsl(var(${s.token}))` }} />{s.label}</li>)}
          </ul>
        </div>
        <div className="sl-chart mt-3 h-[230px] sm:h-[340px]" data-testid="chart-orders">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={phone ? { left: -22, right: 8, top: 8 } : { left: -12, right: 12, top: 8 }}>
              <defs>
                {SERIES.map((s) => (
                  <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" style={{ stopColor: `hsl(var(${s.token}))`, stopOpacity: 0.35 }} />
                    <stop offset="100%" style={{ stopColor: `hsl(var(${s.token}))`, stopOpacity: 0.02 }} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={phone ? 28 : 18} tickFormatter={phone ? (v: string) => v.split(' ')[0] : undefined} tick={phone ? { fontSize: 10 } : undefined} />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} />
              <Tooltip contentStyle={{ background: 'hsl(var(--surface))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--text-primary))' }} />
              {SERIES.map((s) => (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={`hsl(var(${s.token}))`} fill={`url(#g-${s.key})`} strokeWidth={2}
                  dot={phone ? false : { r: 3, strokeWidth: 0, fill: `hsl(var(${s.token}))` }} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-[hsl(var(--text-secondary))]" data-testid="text-chart-note">
          <Info size={13} className="mt-px shrink-0" />No order data yet. Business modules are not enabled, so every month shows zero.
        </p>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {CARDS.map((c) => (
          <section key={c.id} className="sl-surface overflow-hidden" data-testid={`card-${c.id}-order`}>
            <div className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold tracking-wide text-white" style={{ background: `hsl(var(${c.token}))` }}>
              <c.icon size={16} />{c.title}
            </div>
            <div className="grid grid-cols-2 divide-x divide-[hsl(var(--border))] py-4">
              {[['New', FileText], ['Accepted', CheckCircle2]].map(([l, Icon]) => {
                const I = Icon as typeof FileText;
                return (
                  <div key={l as string} className="flex items-center justify-center gap-3 px-2">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-[hsl(var(--surface-secondary))] text-[hsl(var(--text-secondary))]"><I size={17} /></span>
                    <div><div className="text-[24px] font-bold leading-none tabular-nums" data-testid={`text-${c.id}-${(l as string).toLowerCase()}`}>0</div><div className="mt-1 text-[11.5px] text-[hsl(var(--text-secondary))]">{l as string}</div></div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
export default function Dashboard() { return <SubscriberShell><Dash /></SubscriberShell>; }
