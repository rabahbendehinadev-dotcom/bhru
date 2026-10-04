import { useLocation } from 'wouter';
import { useAdminPath } from '@/lib/admin-entry';
import { Clock, PauseCircle, CalendarX, Ban, CheckCircle2, ArrowLeftRight, LogOut } from 'lucide-react';
import { Logo, Card, Btn, StatusBadge, Badge } from '@/components/bhru/ui';
import { accessCheck, effectiveStatus, fmtDate, fmtDateTime, logout, returnToAdmin, type Subscriber } from '@/lib/store';

const COPY: Record<string, { icon: typeof Clock; title: string; tone: string; next: string }> = {
  PENDING: { icon: Clock, title: 'Account pending approval', tone: 'text-warn', next: 'A BHRU administrator will review your registration and issue a licence. Sign in again after approval.' },
  SUSPENDED: { icon: PauseCircle, title: 'Subscription suspended', tone: 'text-danger', next: 'Panel access is blocked until BHRU reactivates your subscription. Nothing has been deleted.' },
  EXPIRED: { icon: CalendarX, title: 'Subscription expired', tone: 'text-danger', next: 'Panel access is blocked until the subscription is extended. Nothing has been deleted.' },
  REVOKED: { icon: Ban, title: 'Licence revoked', tone: 'text-muted-foreground', next: 'Panel access is blocked. Contact BHRU if you believe this is a mistake. Nothing has been deleted.' },
};

export default function AccountStatus({ sub, preview }: { sub: Subscriber; preview: boolean }) {
  const adminPath = useAdminPath();
  const [, nav] = useLocation();
  const a = accessCheck(sub);
  const eff = effectiveStatus(sub);
  const c = COPY[eff] ?? COPY.EXPIRED;
  const Icon = c.icon;
  const steps = [
    { l: 'Registration submitted', d: fmtDateTime(sub.registeredAt), done: true },
    { l: 'Admin review and licence', d: sub.licenceKey ? 'Licence issued' : 'Waiting', done: !!sub.licenceKey },
    { l: 'Server panel access', d: a.allowed ? 'Enabled' : 'Blocked', done: a.allowed },
  ];
  return (
    <div className="grid min-h-[100dvh] place-items-center p-4" data-testid="screen-account-status">
      <div className="w-full max-w-[460px]">
        <div className="mb-4 flex items-center justify-between"><Logo sub="SaaS for Unlock Servers" size={34} /></div>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <Icon size={26} className={c.tone} />
            <div className="flex-1">
              <div className="flex items-center gap-2"><h1 className="text-[16px] font-semibold" data-testid="text-status-title">{c.title}</h1><StatusBadge status={eff} /></div>
              <p className="mt-1 text-[12.5px] text-muted-foreground">{a.reason || c.next}</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">{c.next}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-background p-3 text-[12px]">
            <dt className="text-muted-foreground">Business / Server</dt><dd>{sub.business}</dd>
            <dt className="text-muted-foreground">Owner</dt><dd>{sub.owner}</dd>
            <dt className="text-muted-foreground">Username</dt><dd>{sub.username}</dd>
            <dt className="text-muted-foreground">Plan</dt><dd>{sub.plan}</dd>
            <dt className="text-muted-foreground">Registered</dt><dd>{fmtDate(sub.registeredAt)}</dd>
            <dt className="text-muted-foreground">Expiration</dt><dd>{fmtDate(sub.expiresAt)}</dd>
          </dl>
          <ol className="mt-4 space-y-2">
            {steps.map((s) => (
              <li key={s.l} className="flex items-center gap-2 text-[12px]">
                <CheckCircle2 size={15} className={s.done ? 'text-ok' : 'text-muted-foreground/50'} />
                <span className={s.done ? '' : 'text-muted-foreground'}>{s.l}</span><span className="ml-auto text-muted-foreground">{s.d}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex gap-2">
            {preview ? (
              <Btn v="warn" className="flex-1" data-testid="button-return-admin" onClick={() => { returnToAdmin(); nav(`${adminPath}/subscribers`); }}><ArrowLeftRight size={14} /> Return to admin</Btn>
            ) : (
              <Btn className="flex-1" data-testid="button-signout" onClick={async () => { try { await logout(); nav('/login'); } catch { alert('Sign out failed. Please retry.'); } }}><LogOut size={14} /> Sign out</Btn>
            )}
          </div>
        </Card>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">Your subscription status is verified by BHRU. This page updates automatically.</p>
      </div>
    </div>
  );
}
