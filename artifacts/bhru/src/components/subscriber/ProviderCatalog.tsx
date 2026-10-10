import { useMemo, useState } from 'react';
import { getExternalProviderCatalog, type ProviderCatalogItem, type ProviderConnection, type ProviderImportInput } from '@workspace/api-client-react';
import { Btn, Modal, Badge, Field } from '@/components/bhru/ui';
import { subReq } from '@/hooks/use-commerce';
import { useProviderCatalog, useProviderImport } from '@/hooks/use-external-providers';
import { useServiceGroups, useClientGroups } from '@/hooks/use-services';
import { errorMessage } from '@/lib/store';

const MAX = 500;
const PRICE_RE = /^\d{1,10}(\.\d{1,12})?$/;
interface Sel { item: ProviderCatalogItem; name: string; price: string }
const selectable = (i: ProviderCatalogItem) => !i.missing && i.availability !== false && !!i.serviceType && i.reviewReasons.length === 0 && !i.linkedServiceId;
const why = (i: ProviderCatalogItem) => i.missing ? 'Missing upstream' : !i.serviceType ? 'Unsupported type' : i.availability === false ? 'Unavailable' : i.reviewReasons.length ? 'Needs review' : i.linkedServiceId ? 'Already linked' : '';

export function ProviderCatalog({ provider, onClose }: { provider: ProviderConnection; onClose: () => void }) {
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [category, setCategory] = useState(''), [type, setType] = useState(''), [changed, setChanged] = useState(false);
  const [sel, setSel] = useState<Map<string, Sel>>(new Map());
  const [step, setStep] = useState<'browse' | 'review'>('browse');
  const [busy, setBusy] = useState(false), [note, setNote] = useState(''), [err, setErr] = useState('');
  const [groupMode, setGroupMode] = useState<'none' | 'existing' | 'new'>('none'), [groupId, setGroupId] = useState(''), [newGroup, setNewGroup] = useState('');
  const [confirm, setConfirm] = useState(false), [done, setDone] = useState('');
  const [prevKey, setPrevKey] = useState('');
  const params = { page, ...(search.trim() ? { search: search.trim() } : {}), ...(category ? { category } : {}),
    ...(type ? { serviceType: type as 'imei' } : {}), ...(changed ? { changedOnly: true } : {}) };
  const cat = useProviderCatalog(provider.id, params);
  const groups = useServiceGroups();
  const clientGroups = useClientGroups();
  const { preview, run } = useProviderImport();
  const rows = cat.data?.data ?? [];
  const toggle = (i: ProviderCatalogItem) => setSel(m => { const n = new Map(m); if (n.has(i.id)) n.delete(i.id); else if (n.size < MAX) n.set(i.id, { item: i, name: i.name, price: '' }); return n; });
  const addMany = (items: ProviderCatalogItem[]) => setSel(m => { const n = new Map(m); for (const i of items) if (selectable(i) && n.size < MAX) n.set(i.id, n.get(i.id) ?? { item: i, name: i.name, price: '' }); return n; });
  const selectAllMatching = async () => {
    setBusy(true); setErr(''); setNote('');
    try {
      const all: ProviderCatalogItem[] = []; let p = 1, more = true;
      const { page: _p, ...base } = params; void _p;
      while (more && p <= 100) {
        const r = await getExternalProviderCatalog(provider.id, { ...base, page: p }, subReq());
        all.push(...r.data); more = r.hasMore; p++;
      }
      const ok = all.filter(selectable);
      addMany(ok);
      setNote(`${Math.min(ok.length, MAX)} of ${ok.length} selectable items added${ok.length > MAX ? ` (limit ${MAX})` : ''}; ${all.length - ok.length} skipped as unsupported/unavailable/missing.`);
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const list = [...sel.values()];
  const badPrice = list.some(s => s.price !== '' && !PRICE_RE.test(s.price));
  const input: ProviderImportInput = useMemo(() => ({
    items: list.map(s => ({ id: s.item.id, ...(s.name.trim() && s.name !== s.item.name ? { name: s.name.trim() } : {}), ...(s.price ? { priceUsd: s.price } : {}) })),
    pricing: provider.pricingPolicy,
    groupId: groupMode === 'existing' && groupId ? groupId : null,
    ...(groupMode === 'new' && newGroup.trim() ? { newGroupName: newGroup.trim() } : {}),
  }), [list, provider.pricingPolicy, groupMode, groupId, newGroup]);
  const key = JSON.stringify(input);
  const pv = preview.data && prevKey === key ? preview.data : null;
  const groupOk = groupMode === 'none' || (groupMode === 'existing' && !!groupId) || (groupMode === 'new' && !!newGroup.trim());
  const doPreview = () => { setErr(''); setConfirm(false); preview.mutate({ id: provider.id, data: input }, { onSuccess: () => setPrevKey(key), onError: e => setErr(errorMessage(e)) }); };
  const doImport = () => { if (!pv) return; setErr(''); run.mutate({ id: provider.id, data: { ...input, previewHash: pv.previewHash } }, {
    onSuccess: r => { setDone(`Imported ${r.imported} new, ${r.existing} already linked (unchanged).`); setSel(new Map()); setStep('browse'); setPrevKey(''); setConfirm(false); },
    onError: e => setErr(errorMessage(e)) }); };
  const reset = (fn: () => void) => { fn(); setPage(1); };

  return (
    <Modal open onClose={onClose} width={1000} title={`Catalog · ${provider.name}`}
      footer={step === 'browse'
        ? <><span className="mr-auto text-[12px]" data-testid="text-selected-count">{sel.size} selected (max {MAX})</span>
            <Btn onClick={() => setSel(new Map())} disabled={!sel.size} data-testid="button-clear-selection">Clear</Btn>
            <Btn v="brand" disabled={!sel.size} onClick={() => { setStep('review'); setDone(''); }} data-testid="button-review-selection">Review selection</Btn></>
        : <><Btn onClick={() => setStep('browse')} data-testid="button-back-browse">Back</Btn>
            <Btn onClick={doPreview} disabled={!groupOk || badPrice || preview.isPending} data-testid="button-preview-import">{preview.isPending ? 'Calculating…' : 'Preview prices'}</Btn>
            <Btn v="brand" onClick={doImport} disabled={!pv || !confirm || run.isPending} data-testid="button-confirm-import">{run.isPending ? 'Importing…' : `Import ${list.length}`}</Btn></>}>
      {done && <div className="mb-2 rounded-md border border-[hsl(var(--ok)/.4)] bg-[hsl(var(--ok)/.12)] p-2 text-[12px]" data-testid="text-import-done">{done}</div>}
      {err && <div className="mb-2 rounded-md border border-[hsl(var(--danger)/.4)] bg-[hsl(var(--danger)/.12)] p-2 text-[12px]" role="alert" data-testid="text-catalog-error">{err}</div>}
      {step === 'browse' ? (<>
        <div className="mb-2 grid gap-2 sm:grid-cols-4">
          <input className="input" placeholder="Search name…" value={search} onChange={e => reset(() => setSearch(e.target.value))} data-testid="input-catalog-search" />
          <select className="input" value={category} onChange={e => reset(() => setCategory(e.target.value))} data-testid="select-catalog-category">
            <option value="">All categories</option>{cat.data?.categories.map(c => <option key={c.id} value={c.id}>{c.name} ({c.count})</option>)}
          </select>
          <select className="input" value={type} onChange={e => reset(() => setType(e.target.value))} data-testid="select-catalog-type">
            <option value="">All types</option>{['imei', 'server', 'file', 'remote'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={changed} onChange={e => reset(() => setChanged(e.target.checked))} data-testid="checkbox-changed-only" />Changed only</label>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Btn sm onClick={() => addMany(rows)} disabled={!rows.length} data-testid="button-select-page">Select page</Btn>
          <Btn sm onClick={() => void selectAllMatching()} disabled={busy} data-testid="button-select-all-matching">{busy ? 'Collecting…' : `Select all matching (all pages, up to ${MAX})`}</Btn>
          {note && <span className="text-[11.5px] text-[hsl(var(--text-secondary))]" data-testid="text-select-note">{note}</span>}
        </div>
        {cat.isLoading ? <div className="space-y-1">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-8 animate-pulse rounded bg-[hsl(var(--muted))]" />)}</div>
        : cat.isError ? <div className="p-4 text-center text-[12.5px]" data-testid="text-catalog-load-error">{errorMessage(cat.error)} <Btn sm onClick={() => void cat.refetch()}>Retry</Btn></div>
        : !rows.length ? <div className="p-6 text-center text-[12.5px] text-[hsl(var(--text-secondary))]" data-testid="text-catalog-empty">No catalog items match. Run a sync if this provider has not been synced.</div>
        : <div className="overflow-x-auto scroll-thin"><table className="tbl"><thead><tr><th></th><th>Service</th><th>Type</th><th>Category</th><th>Source cost</th><th>Previous</th><th>Status</th><th>Retail (USD)</th></tr></thead><tbody>
          {rows.map(i => { const ok = selectable(i); return (
            <tr key={i.id} data-testid={`row-catalog-${i.id}`}>
              <td><input type="checkbox" disabled={!ok} checked={sel.has(i.id)} onChange={() => toggle(i)} aria-label={`Select ${i.name}`} data-testid={`checkbox-catalog-${i.id}`} /></td>
              <td className="max-w-[260px] truncate" title={i.name}>{i.name}</td><td>{i.serviceType ?? '—'}</td><td className="max-w-[140px] truncate">{i.categoryName ?? '—'}</td>
              <td className="font-mono">{i.cost} {i.currency}</td><td className="font-mono">{i.previousCost ?? '—'}</td>
              <td className="space-x-1">{!ok && <Badge tone="gray">{why(i)}</Badge>}{i.changes.map(c => <Badge key={c} tone="orange">{c}</Badge>)}{i.reviewReasons.map(c => <Badge key={c} tone="red">{c}</Badge>)}{i.linkedServiceId && <Badge tone="blue">Linked</Badge>}</td>
              <td className="font-mono">{i.retailPriceUsd ?? '—'}</td></tr>); })}
        </tbody></table></div>}
        <div className="mt-2 flex items-center justify-end gap-2 text-[12px]">
          <Btn sm disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="button-catalog-prev">Prev</Btn><span>Page {page}</span>
          <Btn sm disabled={!cat.data?.hasMore} onClick={() => setPage(p => p + 1)} data-testid="button-catalog-next">Next</Btn>
        </div>
      </>) : (<>
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <Field label="Service group">
            <select className="input" value={groupMode} onChange={e => setGroupMode(e.target.value as typeof groupMode)} data-testid="select-group-mode">
              <option value="none">No group</option><option value="existing">Existing group</option><option value="new">Create new group</option></select></Field>
          {groupMode === 'existing' && <Field label="Existing group"><select className="input" value={groupId} onChange={e => setGroupId(e.target.value)} data-testid="select-group-existing">
            <option value="">Choose…</option>{groups.rows?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>}
          {groupMode === 'new' && <Field label="New group name"><input className="input" maxLength={100} value={newGroup} onChange={e => setNewGroup(e.target.value)} data-testid="input-group-new" /></Field>}
        </div>
        <p className="mb-2 text-[11.5px] text-[hsl(var(--text-secondary))]">Imported services start <b>inactive</b>; activation controls arrive in stage 7B. Already-linked services are never overwritten. Price override is a USD amount (e.g. 4.50); leave blank to use the pricing policy.</p>
        <div className="overflow-x-auto scroll-thin"><table className="tbl"><thead><tr><th>Name</th><th>Cost</th><th>Price override (USD)</th><th>Server preview</th><th></th></tr></thead><tbody>
          {list.map(s => { const p = pv?.items.find(x => x.id === s.item.id); return (
            <tr key={s.item.id} data-testid={`row-selected-${s.item.id}`}>
              <td><input className="input" style={{ minWidth: 200 }} maxLength={160} value={s.name} onChange={e => setSel(m => new Map(m).set(s.item.id, { ...s, name: e.target.value }))} data-testid={`input-name-${s.item.id}`} /></td>
              <td className="font-mono">{s.item.cost} {s.item.currency}</td>
              <td><input className="input" style={{ width: 110 }} inputMode="decimal" value={s.price} aria-invalid={s.price !== '' && !PRICE_RE.test(s.price)} onChange={e => setSel(m => new Map(m).set(s.item.id, { ...s, price: e.target.value }))} data-testid={`input-price-${s.item.id}`} /></td>
              <td className="font-mono text-[11.5px]">{p ? <>
                {p.sourceCost} {p.sourceCurrency} × {p.fxRate} = ${p.convertedCostUsd} → <b>${p.proposedPriceUsd}</b> (margin ${p.marginUsd}){p.currentPriceUsd && <> · current ${p.currentPriceUsd}</>}{p.linkedServiceId && <> · already linked</>}
                {p.groupPrices.map(g => <div key={g.groupId}>{clientGroups.rows?.find(c => c.id === g.groupId)?.name ?? g.groupId.slice(0, 6)}: ${g.priceUsd}</div>)}</> : <span className="text-[hsl(var(--text-secondary))]">Run preview</span>}</td>
              <td><Btn sm onClick={() => toggle(s.item)} data-testid={`button-remove-${s.item.id}`}>Remove</Btn></td></tr>); })}
        </tbody></table></div>
        {pv && <div className="mt-3 rounded-md border border-[hsl(var(--border))] p-2 text-[12px]" data-testid="text-preview-summary">
          <div>Formula: <span className="font-mono">{pv.formula}</span></div><div>Visibility: {pv.visibility}</div>
          <label className="mt-2 flex items-start gap-2"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)} data-testid="checkbox-confirm-import" />
            <span>I confirm importing {list.length} service(s) at the server-calculated prices above as inactive services.</span></label></div>}
      </>)}
    </Modal>
  );
}
