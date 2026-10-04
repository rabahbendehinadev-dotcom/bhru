import { useRoute, Link } from 'wouter';
import { Construction } from 'lucide-react';
import { SubscriberShell, MODULES } from '@/components/bhru/shells';
import { Card, Btn } from '@/components/bhru/ui';

export default function Module() {
  const [, p] = useRoute('/m/:slug');
  const name = (p && MODULES[p.slug]) || 'Module';
  return (
    <SubscriberShell>
      <Card className="mx-auto mt-10 max-w-md p-6 text-center" data-testid="module-placeholder">
        <Construction className="mx-auto text-warn" size={28} />
        <h1 className="mt-3 text-[16px] font-semibold">{name}</h1>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Planned for a later stage. This business module is not enabled yet.</p>
        <Link href="/"><Btn className="mt-4" data-testid="button-back-dashboard">Back to dashboard</Btn></Link>
      </Card>
    </SubscriberShell>
  );
}
