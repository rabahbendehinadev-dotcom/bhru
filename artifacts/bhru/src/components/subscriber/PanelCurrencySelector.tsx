import { useState } from 'react';
import { useCommerceWrite } from '@/hooks/use-commerce';
import { usePanelMoney } from '@/hooks/use-panel-money';
import { useStore } from '@/lib/store';

export function PanelCurrencySelector({ className = '' }: { className?: string }) {
  const { session } = useStore();
  const m = usePanelMoney();
  const w = useCommerceWrite();
  const [err, setErr] = useState(false);
  if (session.role !== 'subscriber' || !m.cfg || m.legacy || m.enabled.length === 0) return null;
  const change = async (code: string) => {
    setErr(false);
    try { await w.save('display-currency', { code }); } catch { setErr(true); }
  };
  return (
    <label className={`flex min-w-0 items-center gap-1 text-[10.5px] text-[hsl(var(--text-secondary))] ${className}`} title="Panel Display Currency">
      <span className="hidden xl:inline">Panel Display Currency</span>
      <span className="xl:hidden">Display</span>
      <select aria-label="Panel Display Currency" className="sl-field h-8 w-[72px] min-w-0 text-[12px] font-semibold text-[hsl(var(--text-primary))]" value={m.selected?.code ?? ''} disabled={w.pending}
        onChange={(e) => void change(e.target.value)} data-testid="select-panel-currency">
        {m.enabled.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
      </select>
      {err && <span role="alert" className="text-danger">Failed</span>}
    </label>
  );
}
