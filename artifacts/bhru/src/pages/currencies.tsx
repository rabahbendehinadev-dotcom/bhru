import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Star, Search, AlertCircle, Coins } from 'lucide-react';
import { Btn, Badge, Modal, ConfirmDialog, Field } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';
import { useCommerceList, useCommerceWrite, errText } from '@/hooks/use-commerce';

interface CurrencyRow { code: string; name: string; prefix: string; suffix: string; number_format: string; rate: string; enabled: boolean; client_default: boolean; decimals: number }
interface CurrencyConfig { base_currency: string; currencies: CurrencyRow[]; catalog: { code: string; name: string; decimals: number }[] }

const FORMATS = ['1,234.56', '1.234,56', '1 234,56', '1234.56'];
const RATE_RE = /^\d{1,9}(\.\d{1,5})?$/;

function preview(fmt: string, decimals: number) {
  const [i, f] = (1234.5678).toFixed(Math.max(0, decimals)).split('.');
  const [th, dec] = fmt === '1.234,56' ? ['.', ','] : fmt === '1 234,56' ? [' ', ','] : fmt === '1234.56' ? ['', '.'] : [',', '.'];
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, th) + (f ? dec + f : '');
}

type Form = { code: string; name: string; prefix: string; suffix: string; number_format: string; rate: string; enabled: boolean; client_default: boolean; decimals: number; isNew: boolean };

export default function CurrenciesPage() {
  const { active } = useWorkspacePage();
  const q = useCommerceList<CurrencyConfig>('currencies', undefined, active);
  const w = useCommerceWrite();
  const cfg = q.rows;
  const [form, setForm] = useState<Form | null>(null);
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState('');
  const [del, setDel] = useState<CurrencyRow | null>(null);
  const [rowErr, setRowErr] = useState('');
  const [search, setSearch] = useState('');

  const rows = cfg?.currencies ?? [];
  const base = cfg?.base_currency ?? '';
  const available = useMemo(() => {
    const have = new Set(rows.map((r) => r.code));
    const s = search.trim().toLowerCase();
    return (cfg?.catalog ?? []).filter((c) => !have.has(c.code) && (!s || c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s))).slice(0, 80);
  }, [cfg, rows, search]);

  const openNew = () => { setErr(''); setFieldErr(''); setSearch(''); setForm({ code: '', name: '', prefix: '', suffix: '', number_format: FORMATS[0], rate: '', enabled: true, client_default: false, decimals: 2, isNew: true }); };
  const openEdit = (r: CurrencyRow) => { setErr(''); setFieldErr(''); setForm({ ...r, isNew: false }); };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const payload = (f: Form) => ({ code: f.code, name: f.name.trim(), prefix: f.prefix, suffix: f.suffix, number_format: f.number_format, rate: f.rate.trim(), enabled: f.enabled, client_default: f.client_default });

  const submit = async () => {
    if (!form) return;
    setErr(''); setFieldErr('');
    if (!form.code) { setErr('Choose a currency from the catalog.'); return; }
    const isBase = form.code === base;
    const rate = isBase ? '1.00000' : form.rate.trim();
    if (!isBase && (!RATE_RE.test(rate) || Number(rate) <= 0)) { setFieldErr('Enter a positive rate with up to 5 decimal places.'); return; }
    try { await w.save('currencies', payload({ ...form, rate })); setForm(null); } catch (e) { setErr(errText(e)); }
  };

  const quick = async (r: CurrencyRow, patch: Partial<CurrencyRow>) => {
    setRowErr('');
    try { await w.save('currencies', payload({ ...r, ...patch, isNew: false })); } catch (e) { setRowErr(`${r.code}: ${errText(e)}`); }
  };

  return (
    <div className="min-w-0 space-y-3" data-testid="page-currencies">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">Currencies</h1>
          <p className="mt-0.5 text-[12.5px] text-[hsl(var(--text-secondary))]">Rates you set for your storefront, relative to base currency{base ? ` ${base}` : ''}. They are not bank exchange rates.</p>
        </div>
        <Btn v="brand" onClick={openNew} disabled={!cfg} data-testid="button-add-currency"><Plus size={14} />Add currency</Btn>
      </div>

      {rowErr && <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger" data-testid="text-row-error"><AlertCircle size={14} className="mt-0.5 shrink-0" />{rowErr}</div>}

      <div className="sl-surface min-w-0 overflow-hidden" data-testid="currencies-list">
        {q.isLoading ? (
          <div className="space-y-2 p-4" aria-busy="true" data-testid="currencies-loading">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-white/5" />)}</div>
        ) : q.isError || !cfg ? (
          <EmptyState icon={<AlertCircle size={18} />} title="Currencies could not be loaded" description={errText(q.error)} action={<Btn onClick={() => void q.refetch()} data-testid="button-retry-currencies">Retry</Btn>} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Coins size={18} />} title="No currencies yet" description="Add the currencies your storefront will offer and enter each rate yourself." action={<Btn v="brand" onClick={openNew}>Add currency</Btn>} />
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {rows.map((r) => {
              const isBase = r.code === base;
              return (
                <li key={r.code} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" data-testid={`row-currency-${r.code}`}>
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13.5px] font-semibold">{r.code}</span>
                      <span className="truncate text-[12.5px] text-[hsl(var(--text-secondary))]">{r.name}</span>
                      {isBase && <Badge tone="violet">Base</Badge>}
                      {r.client_default && <Badge tone="blue">Client default</Badge>}
                      {!r.enabled && <Badge tone="gray">Disabled</Badge>}
                    </div>
                    <div className="mt-0.5 text-[11.5px] text-[hsl(var(--text-secondary))] tabular-nums">
                      Rate {r.rate} · {r.prefix}{preview(r.number_format, r.decimals)}{r.suffix}
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 text-[12px]">
                    <input type="checkbox" checked={r.enabled} disabled={w.pending || r.client_default} onChange={(e) => void quick(r, { enabled: e.target.checked })} data-testid={`switch-enabled-${r.code}`} />Enabled
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    <Btn sm disabled={w.pending || r.client_default || !r.enabled} onClick={() => void quick(r, { client_default: true })} data-testid={`button-default-${r.code}`}><Star size={12} />Set default</Btn>
                    <Btn sm onClick={() => openEdit(r)} data-testid={`button-edit-${r.code}`}><Pencil size={12} />Edit</Btn>
                    <Btn sm v="danger" disabled={r.client_default} onClick={() => setDel(r)} aria-label={`Delete ${r.code}`} data-testid={`button-delete-${r.code}`}><Trash2 size={12} /></Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.isNew ? 'Add currency' : `Edit ${form?.code ?? ''}`} width={520}
        footer={<><Btn onClick={() => setForm(null)} data-testid="button-currency-cancel">Cancel</Btn><Btn v="brand" disabled={w.pending} onClick={() => void submit()} data-testid="button-currency-save">{w.pending ? 'Saving...' : 'Save'}</Btn></>}>
        {form && (
          <>
            {err && <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger" data-testid="text-form-error">{err}</div>}
            {form.isNew ? (
              <div>
                <label className="lbl" htmlFor="cur-search">Currency</label>
                <div className="relative">
                  <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 opacity-60" />
                  <input id="cur-search" className="input w-full !pl-8" placeholder="Search code or name" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-currency-search" />
                </div>
                <div className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-[hsl(var(--border))]" role="listbox">
                  {available.length === 0 ? <p className="p-3 text-[12px] text-[hsl(var(--text-secondary))]">No matching currencies.</p> : available.map((c) => (
                    <button key={c.code} type="button" role="option" aria-selected={form.code === c.code}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-white/5 ${form.code === c.code ? 'bg-[hsl(var(--brand)/.15)]' : ''}`}
                      onClick={() => setForm((f) => f && ({ ...f, code: c.code, name: c.name, decimals: c.decimals }))} data-testid={`option-currency-${c.code}`}>
                      <span className="truncate"><b>{c.code}</b> {c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <Field label="Code"><input className="input w-full" value={form.code} readOnly disabled data-testid="input-currency-code" /></Field>
            )}
            <Field label="Name"><input className="input w-full" value={form.name} maxLength={100} onChange={(e) => set('name', e.target.value)} data-testid="input-currency-name" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prefix"><input className="input w-full" value={form.prefix} maxLength={24} onChange={(e) => set('prefix', e.target.value)} data-testid="input-currency-prefix" /></Field>
              <Field label="Suffix"><input className="input w-full" value={form.suffix} maxLength={24} onChange={(e) => set('suffix', e.target.value)} data-testid="input-currency-suffix" /></Field>
              <Field label="Number format">
                <select className="input w-full" value={form.number_format} onChange={(e) => set('number_format', e.target.value)} data-testid="select-currency-format">
                  {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label={`Rate (1 ${base} = ? ${form.code || 'unit'})`} error={fieldErr} hint={form.code === base ? 'Base currency rate is always 1.' : 'Enter manually, up to 5 decimals.'}>
                <input className="input w-full tabular-nums" inputMode="decimal" value={form.code === base ? '1.00000' : form.rate} disabled={form.code === base} onChange={(e) => set('rate', e.target.value)} data-testid="input-currency-rate" />
              </Field>
            </div>
            <p className="text-[12px] text-[hsl(var(--text-secondary))]" data-testid="text-format-preview">Preview: {form.prefix}{preview(form.number_format, form.decimals)}{form.suffix}</p>
            <div className="flex flex-wrap gap-4 text-[12.5px]">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.enabled} disabled={form.client_default} onChange={(e) => set('enabled', e.target.checked)} data-testid="check-currency-enabled" />Enabled</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.client_default} onChange={(e) => set('client_default', e.target.checked)} data-testid="check-currency-default" />Client default</label>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog open={!!del} danger title="Delete currency" confirmLabel="Delete" onClose={() => setDel(null)}
        body={<>Delete {del?.code} ({del?.name})? Storefront prices will no longer be offered in this currency.</>}
        onConfirm={async () => { if (!del) return false; try { setRowErr(''); await w.archive('currencies', del.code); return true; } catch (e) { setRowErr(`${del.code}: ${errText(e)}`); return false; } }} />
    </div>
  );
}
