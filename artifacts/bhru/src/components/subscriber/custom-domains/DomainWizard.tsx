import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Globe, RefreshCw, X } from 'lucide-react';
import type { CustomDomainRecord } from '@workspace/api-client-react';
import { errorMessage } from '@/lib/store';
import type { CustomDomainsApi } from '@/hooks/use-custom-domains';
import { Pill, sslSummary } from './DomainStatus';

type Step = 'input' | 'analyzing' | 'provider' | 'dns';
type Provider = 'cloudflare' | 'godaddy' | 'hostinger' | 'other';
const PROVIDERS: { id: Provider; name: string; hint: string }[] = [
  { id: 'cloudflare', name: 'Cloudflare', hint: 'DNS app, Records tab' },
  { id: 'godaddy', name: 'GoDaddy', hint: 'Domain Portfolio, DNS' },
  { id: 'hostinger', name: 'Hostinger', hint: 'hPanel, DNS / Nameservers' },
  { id: 'other', name: 'Other provider', hint: 'Set up DNS manually' },
];
const GUIDE: Record<Provider, string[]> = {
  cloudflare: ['Sign in to Cloudflare and open your domain.', 'Go to DNS, then Records, and click Add record.', 'Create each record below. Set Proxy status to "DNS only" (grey cloud) until SSL shows Active.', 'Save, then return here and click Verify.'],
  godaddy: ['Sign in to GoDaddy and open Domain Portfolio.', 'Select your domain, then DNS, and click Add New Record.', 'Create each record below. Remove any conflicting A or CNAME record for the same name.', 'Save, then return here and click Verify.'],
  hostinger: ['Sign in to hPanel and open Domains.', 'Select your domain, then DNS / Nameservers.', 'Add each record below and delete conflicting records with the same name.', 'Save, then return here and click Verify.'],
  other: ['Sign in to the company where you manage DNS for this domain.', 'Open its DNS or zone editor.', 'Add each record below exactly as shown. Remove conflicting records with the same name.', 'Save, then return here and click Verify.'],
};

/**
 * Display-only hint. Never rewrites the value: the original trimmed input is sent to the server,
 * which canonicalises protocol/path/IDN and rejects credentials, ports and unsupported schemes.
 */
export function inputHint(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/\s/.test(v)) return 'Domains cannot contain spaces.';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && !/^https?:\/\//i.test(v)) return 'Only a hostname is supported; this protocol will be rejected.';
  if (/@/.test(v)) return 'Credentials are not allowed and will be rejected.';
  if (/^(https?:\/\/)?[^/?#]*:\d+/i.test(v)) return 'Ports are not allowed and will be rejected.';
  return '';
}

function CopyBtn({ value, id }: { value: string; id: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn btn-sm" aria-label="Copy value" data-testid={`button-copy-${id}`}
      onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1400); }); }}>
      {done ? <Check size={12} /> : <Copy size={12} />}{done ? 'Copied' : 'Copy'}
    </button>
  );
}

export function DomainWizard({ api, initialId, onClose }: { api: CustomDomainsApi; initialId: string | null; onClose: () => void }) {
  const [step, setStep] = useState<Step>(initialId ? 'provider' : 'input');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [id, setId] = useState<string | null>(initialId);
  const [provider, setProvider] = useState<Provider>('other');
  const [verifyMsg, setVerifyMsg] = useState('');
  const host = useRef('');
  const record: CustomDomainRecord | undefined = api.data?.domains.find((d) => d.id === id);
  const busy = api.add.isPending || api.verify.isPending;

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [busy, onClose]);
  // Record disappeared (deleted elsewhere / tenant switch): close.
  useEffect(() => { if (id && api.data && !record) onClose(); }, [id, api.data, record, onClose]);

  const submit = () => {
    const h = input.trim();
    if (!h) return;
    const before = new Set((api.data?.domains ?? []).map((d) => d.id));
    setError(''); host.current = h; setStep('analyzing');
    api.add.mutate({ data: { hostname: h } }, {
      onSuccess: (cfg) => {
        const found = cfg.domains.find((d) => !before.has(d.id)) ?? [...cfg.domains].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (!found) { setStep('input'); setError('The domain was not returned by the server. Refresh and try again.'); return; }
        setId(found.id); setStep('provider');
      },
      onError: (e) => { setStep('input'); setError(errorMessage(e)); },
    });
  };
  const verify = () => {
    if (!id) return;
    setVerifyMsg('');
    api.verify.mutate({ id }, {
      onSuccess: (cfg) => {
        const d = cfg.domains.find((x) => x.id === id);
        setVerifyMsg(d?.last_error ? d.last_error : d && d.dns_status.toLowerCase() === 'ready' ? 'Ownership and DNS verified.' : 'DNS records were not found yet. DNS changes can take up to 48 hours to propagate.');
      },
      onError: (e) => setVerifyMsg(errorMessage(e)),
    });
  };
  const idx = { input: 0, analyzing: 1, provider: 2, dns: 3 }[step];
  const ssl = record ? sslSummary(record) : null;

  return (
    <div className="cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="cd-modal" role="dialog" aria-modal="true" aria-labelledby="cd-title" data-testid="dialog-domain-wizard">
        <div className="cd-head">
          <h2 id="cd-title" className="text-[15px] font-semibold">{record ? record.hostname : 'Add domain'}</h2>
          <button type="button" className="btn btn-sm" onClick={onClose} disabled={busy} aria-label="Close" data-testid="button-close-wizard"><X size={14} /></button>
        </div>
        <div className="cd-body">
          <div className="cd-steps" aria-hidden>{[0, 1, 2, 3].map((i) => <span key={i} className={i <= idx ? 'on' : ''} />)}</div>

          {step === 'input' && (
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-3">
              <div>
                <h3 className="text-[14px] font-semibold">Use a domain you already own</h3>
                <p className="mt-0.5 text-[12.5px] text-[hsl(var(--muted-foreground))]">Enter a domain or subdomain, for example store.example.com or example.com.</p>
              </div>
              <input autoFocus className="input w-full" value={input} onChange={(e) => { setInput(e.target.value); setError(''); }} placeholder="store.example.com"
                aria-label="Domain" aria-invalid={!!error} maxLength={2048} data-testid="input-domain" />
              {!error && inputHint(input) && <p className="text-[12.5px] text-[hsl(var(--warn))]" data-testid="text-domain-hint">{inputHint(input)}</p>}
              {error && <p role="alert" className="text-[12.5px] text-[hsl(var(--danger))]" data-testid="text-domain-error">{error}</p>}
              <div className="flex justify-end"><button type="submit" className="btn btn-brand" disabled={!input.trim()} data-testid="button-continue-domain">Continue</button></div>
            </form>
          )}

          {step === 'analyzing' && (
            <div className="flex flex-col items-center gap-3 py-8 text-center" role="status" aria-live="polite" data-testid="status-analyzing">
              <div className="cd-spin" />
              <p className="text-[14px] font-semibold">Analyzing...</p>
              <p className="font-mono text-[13px]">{host.current}</p>
              <p className="text-[12.5px] text-[hsl(var(--muted-foreground))]">Checking the domain and preparing DNS instructions.</p>
            </div>
          )}

          {step === 'provider' && (
            <div className="space-y-3">
              <div>
                <h3 className="text-[14px] font-semibold">Choose your domain provider</h3>
                <p className="mt-0.5 text-[12.5px] text-[hsl(var(--muted-foreground))]">Select your provider to continue with DNS setup. BHRU never asks for your provider login.</p>
              </div>
              <div className="cd-providers">
                {PROVIDERS.map((p) => (
                  <button key={p.id} type="button" className="cd-provider" onClick={() => { setProvider(p.id); setStep('dns'); }} data-testid={`button-provider-${p.id}`}>
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold"><Globe size={13} />{p.name}</span>
                    <span className="text-[11.5px] text-[hsl(var(--muted-foreground))]">{p.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'dns' && record && (
            <div className="space-y-3">
              <button type="button" className="btn btn-sm" onClick={() => setStep('provider')} data-testid="button-back-provider"><ArrowLeft size={12} />Change provider</button>
              <div>
                <h3 className="text-[14px] font-semibold">Add these DNS records at {PROVIDERS.find((p) => p.id === provider)!.name}</h3>
                <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[12.5px] text-[hsl(var(--muted-foreground))]">{GUIDE[provider].map((g) => <li key={g}>{g}</li>)}</ol>
              </div>
              <div className="rounded-lg border border-[hsl(var(--border))]" data-testid="list-dns-records">
                <div className="cd-record cd-record-head text-[11.5px] font-semibold text-[hsl(var(--muted-foreground))]"><span>Type</span><span>Name</span><span>Value</span><span>TTL</span></div>
                {record.instructions.length === 0 && <p className="p-3 text-[12.5px] text-[hsl(var(--muted-foreground))]">No DNS records are required right now.</p>}
                {record.instructions.map((r, i) => (
                  <div key={i} className="cd-record" data-testid={`row-dns-${i}`}>
                    <span className="font-semibold">{r.type}</span>
                    <span className="flex items-center gap-1.5"><code>{r.name}</code><CopyBtn value={r.name} id={`name-${i}`} /></span>
                    <span className="flex items-center gap-1.5"><code>{r.value}</code><CopyBtn value={r.value} id={`value-${i}`} /></span>
                    <span>{r.ttl}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                <span>DNS</span><Pill value={record.dns_status} testId="status-wizard-dns" />
                <span className="ml-2">SSL</span><Pill value={record.tls_status} testId="status-wizard-ssl" />
              </div>
              {ssl && <p className={`text-[12.5px] ${ssl.kind === 'bad' ? 'text-[hsl(var(--danger))]' : 'text-[hsl(var(--muted-foreground))]'}`} data-testid="text-ssl-summary">{ssl.text}</p>}
              {api.data && !api.data.ready && <p className="text-[12.5px] text-[hsl(var(--warn))]" data-testid="text-wizard-config">{api.data.configuration_message || 'Routing infrastructure is not configured yet. You can verify ownership now; the domain activates only once routing and SSL are ready.'}</p>}
              {verifyMsg && <p role="status" className="text-[12.5px]" data-testid="text-verify-result">{verifyMsg}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className="btn" onClick={onClose} data-testid="button-finish-later">Finish later</button>
                <button type="button" className="btn btn-brand" onClick={verify} disabled={busy || !api.canEdit} data-testid="button-verify-wizard">
                  <RefreshCw size={13} className={api.verify.isPending ? 'animate-spin' : ''} />{api.verify.isPending ? 'Verifying...' : 'Verify ownership'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
