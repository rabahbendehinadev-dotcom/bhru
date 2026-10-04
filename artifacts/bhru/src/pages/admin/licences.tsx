import { AdminShell } from '@/components/bhru/shells';
import { Card, PlanBadge, SubStatus } from '@/components/bhru/ui';
import { SubActions } from '@/components/bhru/sub-actions';
import { accessCheck, fmtDate, fmtDateTime, useStore } from '@/lib/store';
import { Expiry } from './subscribers';
import { Badge } from '@/components/bhru/ui';

function Table({ mode }: { mode: 'licences' | 'activations' }) {
  const { subscribers } = useStore();
  const list = mode === 'licences' ? subscribers : [...subscribers].sort((a, b) => (a.licenceKey ? 1 : 0) - (b.licenceKey ? 1 : 0) || +new Date(b.registeredAt) - +new Date(a.registeredAt));
  return (
    <div className="space-y-3">
      <div><h1 className="text-[18px] font-semibold">{mode === 'licences' ? 'Licences' : 'Activations'}</h1>
        <p className="text-[12.5px] text-muted-foreground">{mode === 'licences' ? 'Licence per subscriber, derived from the same subscription records.' : 'Activation state per subscriber. Pending accounts are waiting for approval or activation.'}</p></div>
      <Card>
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl" data-testid={`table-${mode}`}>
            <thead><tr><th>Business</th>{mode === 'licences' ? <><th>Licence key</th><th>Plan</th></> : <><th>Registered</th><th>Activated</th></>}<th>Status</th><th>Expiration</th><th>Panel access</th><th>Actions</th></tr></thead>
            <tbody>
              {list.map((s) => {
                const a = accessCheck(s);
                return (
                  <tr key={s.id} data-testid={`row-${mode}-${s.id}`}>
                    <td className="font-semibold">{s.business}<div className="text-[10.5px] font-normal text-muted-foreground">{s.username}</div></td>
                    {mode === 'licences' ? <><td className="font-mono text-[11px]">{s.licenceKey || <span className="font-sans text-muted-foreground">Not issued</span>}</td><td><PlanBadge plan={s.plan} /></td></> : <><td>{fmtDateTime(s.registeredAt)}</td><td>{s.activatedAt ? fmtDate(s.activatedAt) : '-'}</td></>}
                    <td><SubStatus sub={s} /></td><td><Expiry sub={s} /></td>
                    <td><Badge tone={a.allowed ? 'green' : 'red'}>{a.allowed ? 'Allowed' : 'Blocked'}</Badge></td>
                    <td className="min-w-[260px] whitespace-normal"><SubActions sub={s} full={false} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
export function Licences() { return <AdminShell><Table mode="licences" /></AdminShell>; }
export function Activations() { return <AdminShell><Table mode="activations" /></AdminShell>; }
