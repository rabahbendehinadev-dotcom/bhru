import { useEffect, useState } from 'react';
import { SubscriberShell } from '@/components/bhru/shells';
import { Card, CardHead, Btn, Field, Badge } from '@/components/bhru/ui';
import { useStore, fmtDate } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';

function Inner() {
  const st = useStore();
  const { toast } = useToast();
  const sub = st.subscribers.find((s) => s.id === st.session.subscriberId)!;
  const [d, setD] = useState({ domain: sub.domain, domainStatus: sub.domainStatus, verification: sub.verification });
  useEffect(() => { setD({ domain: sub.domain, domainStatus: sub.domainStatus, verification: sub.verification }); }, [sub.id, sub.domain, sub.domainStatus, sub.verification]);
  return (
    <div className="space-y-3">
      <div><h1 className="text-[18px] font-semibold">Settings</h1><p className="text-[12.5px] text-muted-foreground">Server settings for {sub.business}.</p></div>
      <Card className="max-w-2xl pb-4">
        <CardHead title="Custom Domain" right={<Badge tone="violet">Not enabled</Badge>} />
        <div className="space-y-3 px-3.5 pt-3">
          <p className="rounded-md border border-warn/30 bg-warn/10 p-2.5 text-[12px] text-[hsl(30_95%_70%)]">Custom-domain setup, DNS verification and SSL provisioning are planned for a later stage.</p>
          <Field label="Custom Domain"><input className="input" disabled value={d.domain} placeholder="server.yourdomain.com" data-testid="input-domain" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Domain Status"><select className="input" disabled value={d.domainStatus} data-testid="select-domain-status"><option>{d.domainStatus}</option></select></Field>
            <Field label="Verification Status"><select className="input" disabled value={d.verification} data-testid="select-verification"><option>{d.verification}</option></select></Field>
          </div>
          <Btn v="primary" disabled data-testid="button-save-domain">Save domain settings</Btn>
        </div>
      </Card>
      <Card className="max-w-2xl pb-3">
        <CardHead title="Subscription (managed by BHRU)" />
        <dl className="grid grid-cols-2 gap-2 px-3.5 pt-3 text-[12.5px] sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Plan</dt><dd>{sub.plan}</dd></div>
          <div><dt className="text-muted-foreground">Status</dt><dd>{sub.status}</dd></div>
          <div><dt className="text-muted-foreground">Expires</dt><dd>{fmtDate(sub.expiresAt)}</dd></div>
          <div><dt className="text-muted-foreground">Licence</dt><dd className="font-mono text-[11px]">{sub.licenceKey}</dd></div>
        </dl>
      </Card>
    </div>
  );
}
export default function Settings() { return <SubscriberShell><Inner /></SubscriberShell>; }
