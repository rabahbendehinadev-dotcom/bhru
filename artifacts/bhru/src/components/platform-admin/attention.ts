import { useMemo } from 'react';
import { daysLeft, effectiveStatus, useStore } from '@/lib/store';

export interface AttentionItem {
  key: string;
  tone: 'warn' | 'danger' | 'ok';
  title: string;
  detail: string;
  subscriberId?: string;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const names = (l: { business: string }[]) => l.slice(0, 2).map((s) => s.business).join(', ') + (l.length > 2 ? ` +${l.length - 2}` : '');

/** Real attention entries derived from live subscriber records. */
export function useAttention() {
  const { subscribers } = useStore();
  const minute=Math.floor(Date.now()/60000);
  return useMemo(() => {
    const pending = subscribers.filter((s) => effectiveStatus(s) === 'PENDING');
    const suspended = subscribers.filter((s) => effectiveStatus(s) === 'SUSPENDED');
    const expired = subscribers.filter((s) => effectiveStatus(s) === 'EXPIRED');
    const live = subscribers.filter((s) => ['ACTIVE','TRIAL'].includes(effectiveStatus(s)));
    const exp7 = live.filter((s) => { const d = daysLeft(s.expiresAt); return d !== null && d >= 0 && d <= 7; });
    const exp30 = live.filter((s) => { const d = daysLeft(s.expiresAt); return d !== null && d >= 0 && d <= 30; });
    const items: AttentionItem[] = [];
    if (pending.length) items.push({ key: 'pending', tone: 'warn', title: `${plural(pending.length, 'pending subscriber approval')}`, detail: names(pending), subscriberId: pending[0].id });
    if (suspended.length) items.push({ key: 'suspended', tone: 'danger', title: plural(suspended.length, 'suspended subscriber'), detail: names(suspended), subscriberId: suspended[0].id });
    if (exp30.length) items.push({ key: 'expiring', tone: 'warn', title: `${plural(exp30.length, 'subscription')} expiring within 30 days`, detail: exp7.length ? `${exp7.length} within 7 days: ${names(exp7)}` : names(exp30), subscriberId: (exp7[0] || exp30[0]).id });
    else items.push({ key: 'expiring-ok', tone: 'ok', title: 'No expiring subscriptions', detail: 'Nothing ends within 30 days' });
    if (expired.length) items.push({ key: 'expired', tone: 'danger', title: plural(expired.length, 'expired subscriber'), detail: names(expired), subscriberId: expired[0].id });
    else items.push({ key: 'expired-ok', tone: 'ok', title: 'No expired subscriptions', detail: 'All subscriptions are current' });
    return { items, count: items.filter((x) => x.tone !== 'ok').length, exp7: exp7.length, exp30: exp30.length };
  }, [subscribers,minute]);
}
