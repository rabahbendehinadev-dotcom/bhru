import { useState } from 'react';
import { ExternalLink, Globe, Plus, RefreshCw, Star, Trash2, Wrench, KeyRound } from 'lucide-react';
import type { CustomDomainRecord } from '@workspace/api-client-react';
import { errorMessage, fmtDate, fmtDateTime } from '@/lib/store';
import { isActive, useCustomDomains } from '@/hooks/use-custom-domains';
import { Pill } from '@/components/subscriber/custom-domains/DomainStatus';
import { DomainWizard } from '@/components/subscriber/custom-domains/DomainWizard';

type Confirm = { kind: 'delete' | 'renew'; d: CustomDomainRecord } | null;

export default function CustomDomainsPage() {
  const api = useCustomDomains();
  return <DomainPageBody key={api.identity ?? 'none'} api={api} />;
}
function DomainPageBody({api}:{api:ReturnType<typeof useCustomDomains>}) {
  const { data, query, canEdit } = api;
  const [wizard, setWizard] = useState<{ id: string | null } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [notice, setNotice] = useState<{ bad: boolean; text: string } | null>(null);
  const busy = api.remove.isPending || api.renew.isPending || api.primary.isPending || api.verify.isPending;
  const atLimit = !!data && data.domains.length >= data.limit;

  const run = (p: Promise<unknown>, ok: string) => { setNotice(null); p.then(() => setNotice({ bad: false, text: ok }), (e) => setNotice({ bad: true, text: errorMessage(e) })); };
  const doConfirm = () => {
    if (!confirm) return;
    const { kind, d } = confirm; setConfirm(null);
    if (kind === 'delete') run(api.remove.mutateAsync({ id: d.id }), `${d.hostname} was removed.`);
    else run(api.renew.mutateAsync({ id: d.id }), `A new ownership token was issued for ${d.hostname}. Update the TXT record and verify again.`);
  };

  return (
    <div className="space-y-3 min-w-0" data-testid="page-custom-domains">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">Custom Domains</h1>
          <p className="mt-0.5 text-[12.5px] text-[hsl(var(--text-secondary))]">Connect a domain or subdomain you already own to your BHRU public website.</p>
        </div>
        <button type="button" className="btn btn-brand" disabled={!canEdit || atLimit} onClick={() => setWizard({ id: null })} data-testid="button-add-domain">
          <Plus size={14} />Add domain
        </button>
      </div>

      {api.adminPreview && <p role="status" className="text-[12.5px] text-[hsl(var(--text-secondary))]" data-testid="text-readonly">Administrator preview is read-only. Custom domains are managed by the subscriber.</p>}
      {!api.adminPreview && !api.access.allowed && <p role="alert" className="text-[12.5px] text-[hsl(var(--danger))]" data-testid="text-licence-gate">Domain changes are unavailable: {api.access.reason}</p>}
      {data && !data.enabled && <p role="status" className="text-[12.5px] text-[hsl(var(--text-secondary))]" data-testid="text-disabled">Custom domains are not enabled for your plan.</p>}
      {data && data.enabled && !data.ready && <p role="status" className="text-[12.5px] text-[hsl(var(--warn))]" data-testid="text-config-message">{data.configuration_message || 'Routing infrastructure is not configured yet.'} You can still add domains and verify ownership; domains activate only when routing and SSL are ready.</p>}
      {data && <p className="text-[12px] text-[hsl(var(--muted-foreground))]" data-testid="text-domain-usage">
        {data.domains.length} of {data.limit} domains used.{data.public_url && <> Current address: <a href={data.public_url} target="_blank" rel="noopener noreferrer" className="underline" data-testid="link-public-url">{data.public_url}<ExternalLink size={11} className="ml-0.5 inline" /></a></>}
      </p>}
      {notice && <p role="status" aria-live="polite" className={`text-[12.5px] ${notice.bad ? 'text-[hsl(var(--danger))]' : 'text-[hsl(var(--ok))]'}`} data-testid="text-domain-notice">{notice.text}</p>}

      <div className="sl-surface min-w-0 p-0 overflow-hidden">
        {!api.identity && !api.adminPreview ? (
          <p className="p-4 text-[12.5px]">Custom domains are available only to subscriber accounts.</p>
        ) : api.adminPreview ? null : query.isLoading ? (
          <div className="space-y-2 p-4" aria-busy data-testid="status-loading">{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-[hsl(var(--muted))]" />)}</div>
        ) : query.isError ? (
          <div className="flex flex-wrap items-center gap-2 p-4 text-[12.5px]" role="alert">
            <span className="text-[hsl(var(--danger))]">Could not load domains. {errorMessage(query.error)}</span>
            <button type="button" className="btn btn-sm" onClick={() => void query.refetch()} data-testid="button-retry-domains">Retry</button>
          </div>
        ) : !data?.domains.length ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center" data-testid="empty-domains">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[hsl(var(--brand)/.12)] text-[hsl(var(--brand))]"><Globe size={18} /></span>
            <p className="text-[14px] font-semibold">No custom domains yet</p>
            <p className="max-w-sm text-[12.5px] text-[hsl(var(--muted-foreground))]">Add a domain you own and BHRU will show the exact DNS records to create.</p>
          </div>
        ) : (
          <table className="cd-table" data-testid="table-domains">
            <thead><tr><th>Domain</th><th>Status</th><th>DNS</th><th>SSL</th><th>Primary</th><th>Added</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {data.domains.map((d) => (
                <tr key={d.id} data-testid={`row-domain-${d.id}`}>
                  <td data-label="Domain">
                    <div className="min-w-0 text-right md:text-left">
                      <div className="break-all font-medium" data-testid={`text-hostname-${d.id}`}>{d.hostname}</div>
                      {d.last_error && <div className="text-[11.5px] text-[hsl(var(--danger))]" data-testid={`text-error-${d.id}`}>{d.last_error}</div>}
                      {d.last_checked_at && <div className="text-[11px] text-[hsl(var(--muted-foreground))]">Checked {fmtDateTime(d.last_checked_at)}</div>}
                    </div>
                  </td>
                  <td data-label="Status"><Pill value={d.status} testId={`status-domain-${d.id}`} /></td>
                  <td data-label="DNS"><Pill value={d.dns_status} testId={`status-dns-${d.id}`} /></td>
                  <td data-label="SSL"><Pill value={d.tls_status} testId={`status-ssl-${d.id}`} /></td>
                  <td data-label="Primary">{d.is_primary ? <span className="cd-pill cd-ok" data-testid={`text-primary-${d.id}`}><Star size={10} />Primary</span> : <span className="text-[hsl(var(--muted-foreground))]">-</span>}</td>
                  <td data-label="Added">{fmtDate(d.created_at)}</td>
                  <td data-label="Actions">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button type="button" className="btn btn-sm" onClick={() => setWizard({ id: d.id })} data-testid={`button-setup-${d.id}`}><Wrench size={12} />Setup</button>
                      <button type="button" className="btn btn-sm" disabled={!canEdit || busy} onClick={() => run(api.verify.mutateAsync({ id: d.id }), `Verification checked for ${d.hostname}.`)} data-testid={`button-verify-${d.id}`}><RefreshCw size={12} />Verify</button>
                      {isActive(d) && !d.is_primary && <button type="button" className="btn btn-sm" disabled={!canEdit || busy} onClick={() => run(api.primary.mutateAsync({ id: d.id }), `${d.hostname} is now your primary domain.`)} data-testid={`button-primary-${d.id}`}><Star size={12} />Set primary</button>}
                      <button type="button" className="btn btn-sm" disabled={!canEdit || busy} onClick={() => setConfirm({ kind: 'renew', d })} data-testid={`button-renew-${d.id}`}><KeyRound size={12} />New token</button>
                      <button type="button" className="btn btn-sm btn-danger" disabled={!canEdit || busy} onClick={() => setConfirm({ kind: 'delete', d })} data-testid={`button-delete-${d.id}`}><Trash2 size={12} />Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {wizard && <DomainWizard api={api} initialId={wizard.id} onClose={() => setWizard(null)} />}
      {confirm && (
        <div className="cd-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="cd-modal max-w-[440px]" role="alertdialog" aria-modal="true" aria-labelledby="cd-confirm" data-testid="dialog-confirm">
            <div className="cd-body space-y-3">
              <h2 id="cd-confirm" className="text-[15px] font-semibold">{confirm.kind === 'delete' ? 'Delete domain?' : 'Regenerate ownership token?'}</h2>
              <p className="text-[12.5px] text-[hsl(var(--muted-foreground))]">
                {confirm.kind === 'delete'
                  ? <><b>{confirm.d.hostname}</b> will stop serving your public website immediately. This cannot be undone.</>
                  : <>The current token for <b>{confirm.d.hostname}</b> is revoked and the domain is deactivated until you add the new TXT record and verify again.</>}
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn" autoFocus onClick={() => setConfirm(null)} data-testid="button-cancel-confirm">Cancel</button>
                <button type="button" className="btn btn-danger" onClick={doConfirm} data-testid="button-accept-confirm">{confirm.kind === 'delete' ? 'Delete domain' : 'Regenerate token'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
