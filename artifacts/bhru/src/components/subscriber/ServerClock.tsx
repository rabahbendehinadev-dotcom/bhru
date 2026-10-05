import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/** Synchronize with the existing API's HTTP Date header, without changing its contract. */
export function ServerClock() {
  const [clock, setClock] = useState<{ server: number; received: number } | null>(null);
  const [now, setNow] = useState(Date.now);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const sync = async () => {
      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, '');
        const response = await fetch(`${base}/api/healthz`, { method: 'HEAD', cache: 'no-store', signal: controller.signal });
        const server = Date.parse(response.headers.get('Date') || '');
        if (!response.ok || !Number.isFinite(server)) throw new Error('Server clock unavailable');
        setClock({ server, received: Date.now() });
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) { setClock(null); setFailed(true); }
      }
    };
    void sync();
    const syncTimer = window.setInterval(() => void sync(), 60000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { controller.abort(); window.clearInterval(syncTimer); window.clearInterval(tick); };
  }, []);
  const date = clock ? new Date(clock.server + Math.max(0, now - clock.received)) : null;
  const label = date ? `${date.toLocaleDateString('en-GB', { timeZone: 'UTC' })} - ${date.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })}` : failed ? 'Unavailable' : 'Synchronizing…';
  return (
    <div className="hidden items-center gap-2 lg:flex" title="UTC time synchronized from the API HTTP Date header." data-testid="text-server-time">
      <Clock size={14} className="text-[hsl(var(--text-secondary))]" />
      <div className="text-[10.5px] leading-tight text-[hsl(var(--text-secondary))]">Server Time · UTC
        <div className="text-[12px] font-semibold text-[hsl(var(--text-primary))]">{label}</div>
      </div>
    </div>
  );
}