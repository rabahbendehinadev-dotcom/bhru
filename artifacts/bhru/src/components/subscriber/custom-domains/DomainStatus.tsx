import type { CustomDomainRecord } from '@workspace/api-client-react';
import './custom-domains.css';

const TONES: Record<string, 'cd-ok' | 'cd-warn' | 'cd-bad' | 'cd-mute'> = {
  // status
  'active': 'cd-ok', 'ssl pending': 'cd-warn', 'ssl error': 'cd-bad', 'dns error': 'cd-bad', 'pending setup': 'cd-mute', 'waiting for dns': 'cd-warn',
  // dns_status / tls_status
  'ready': 'cd-ok', 'waiting': 'cd-warn', 'pending': 'cd-warn', 'error': 'cd-bad',
};
const tone = (v: string) => TONES[v.trim().toLowerCase()] ?? 'cd-mute';
const LABELS: Record<string, string> = { ready: 'Ready', waiting: 'Waiting', pending: 'Pending', error: 'Error' };
const label = (v: string) => LABELS[v.trim().toLowerCase()] ?? (v || 'Unknown');

export function Pill({ value, testId }: { value: string; testId?: string }) {
  return <span className={`cd-pill ${tone(value)}`} data-testid={testId}>{label(value)}</span>;
}

/** Honest SSL wording: "active" only when tls_status is ready (certificate verified). */
export function sslSummary(d: CustomDomainRecord): { text: string; kind: 'ok' | 'warn' | 'bad' | 'mute' } {
  const tls = d.tls_status.toLowerCase(), dns = d.dns_status.toLowerCase();
  if (tls === 'ready') return { text: 'SSL certificate verified. Your domain is served over HTTPS.', kind: 'ok' };
  if (tls === 'error') return { text: `SSL certificate could not be issued.${d.last_error ? ` ${d.last_error}` : ''}`, kind: 'bad' };
  if (dns === 'error') return { text: `DNS check failed.${d.last_error ? ` ${d.last_error}` : ''} SSL is requested after DNS is ready.`, kind: 'bad' };
  if (dns !== 'ready') return { text: 'SSL will be requested after DNS is ready.', kind: 'mute' };
  return { text: 'SSL certificate pending. Issuance can take a few minutes; this page refreshes automatically.', kind: 'warn' };
}
