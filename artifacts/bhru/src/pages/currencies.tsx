import { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, AlertCircle, Coins } from 'lucide-react';
import { Btn, Badge, Modal, ConfirmDialog, Field } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';
import { useCommerceList, useCommerceWrite, errText } from '@/hooks/use-commerce';
import { useStore } from '@/lib/store';

interface CurrencyRow { code: string; name: string; prefix: string; suffix: string; number_format: string; rate: string; enabled: boolean; client_default: boolean; decimals: number; is_base?: boolean; rate_configured?: boolean }
interface CurrencyConfig { base_currency: string; money_model_version?: 1 | 2; requires_conversion?: boolean; currencies: CurrencyRow[]; catalog: { code: string; name: string; decimals: number }[] }

const FORMATS = ['1,234.56', '1.234,56', '1 234,56', '1234.56'];
const RATE_RE = /^\d{1,9}(\.\d{1,6})?$/;

function preview(fmt: string, decimals: number) {
  const [i, f] = (1234.5678).toFixed(Math.max(0, decimals)).split('.');
  const [th, dec] = fmt === '1.234,56' ? ['.', ','] : fmt === '1 234,56' ? [' ', ','] : fmt === '1234.56' ? ['', '.'] : [',', '.'];
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, th) + (f ? dec + f : '');
}

type Form = { code: string; name: string; prefix: string; suffix: string; number_format: string; rate: string; enabled: boolean; client_default: boolean; decimals: number; isNew: boolean };

export default function CurrenciesPage() {
  const { session } = useStore();
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
  const blank: Form = { code: '', name: '', prefix: '', suffix: '', number_format: FORMATS[0], rate: '', enabled: true, client_default: false, decimals: 2, isNew: true };
  const [add, setAdd] = useState<Form>(blank);
  const [addErr, setAddErr] = useState('');

  const rows = cfg?.currencies ?? [];
  const legacy = cfg?.requires_conversion === true;
  const adminPreview = session.role === 'admin';
  const locked = legacy || adminPreview;
  const unconf = (r: CurrencyRow) => r.rate_configured === false;
  const base = cfg?.base_currency ?? '';
  const available = useMemo(() => {
    const have = new Set(rows.map((r) => r.code));
    const s = search.trim().toLowerCase();
    return (cfg?.catalog ?? []).filter((c) => !have.has(c.code) && (!s || c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s))).slice(0, 80);
  }, [cfg, rows, search]);

  const openEdit = (r: CurrencyRow) => { if (locked) return; setErr(''); setFieldErr(''); setForm({ ...r, rate: unconf(r) ? '' : r.rate, isNew: false }); };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const payload = (f: Form) => ({ code: f.code, name: f.name.trim(), prefix: f.prefix, suffix: f.suffix, number_format: f.number_format, rate: f.code === base ? '1.000000' : f.rate.trim(), enabled: f.enabled, client_default: f.client_default });

  const submit = async () => {
    if (!form || locked) return;
    setErr(''); setFieldErr('');
    if (!form.code) { setErr('Choose a currency from the catalog.'); return; }
    const isBase = form.code === base;
    const rate = isBase ? '1.000000' : form.rate.trim();
    if (!isBase && (!RATE_RE.test(rate) || Number(rate) <= 0)) { setFieldErr('Enter a positive rate with up to 6 decimal places.'); return; }
    try { await w.save('currencies', payload({ ...form, rate })); setForm(null); } catch (e) { setErr(errText(e)); }
  };

  const quick = async (r: CurrencyRow, patch: Partial<CurrencyRow>) => {
    setRowErr('');
    if (locked) return;
    if (unconf(r) && patch.enabled) { setRowErr(`${r.code}: Enter a rate first (Edit), then enable.`); return; }
    try { await w.save('currencies', payload({ ...r, ...patch, isNew: false })); } catch (e) { setRowErr(`${r.code}: ${errText(e)}`); }
  };

  const fmtLabel = (f: string) => ({ '1,234.56': '1,000.99', '1.234,56': '1.000,99', '1 234,56': '1 000,99', '1234.56': '1000.99' }[f] ?? f);
  const pick = (code: string) => {
    const c = (cfg?.catalog ?? []).find((x) => x.code === code);
    setAdd((f) => ({ ...f, code, name: c?.name ?? '', decimals: c?.decimals ?? 2 }));
  };
  const setA = <K extends keyof Form>(k: K, v: Form[K]) => setAdd((f) => ({ ...f, [k]: v }));
  const submitAdd = async () => {
    if (locked) return;
    setAddErr('');
    if (!add.code) { setAddErr('Choose a currency from the catalog.'); return; }
    const rate = add.rate.trim();
    if (!RATE_RE.test(rate) || Number(rate) <= 0) { setAddErr('Enter a positive rate with up to 6 decimal places.'); return; }
    try { await w.save('currencies', payload({ ...add, rate, client_default: false })); setAdd(blank); setSearch(''); } catch (e) { setAddErr(errText(e)); }
  };
  const inp = 'input !h-8 !text-[12.5px]';
  const addFields = (
    <>
      <div className="min-w-0">
        <input className={`${inp} mb-1`} placeholder="Search code or name" aria-label="Search catalog" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-currency-search" />
        <select className={inp} aria-label="Currency" value={add.code} onChange={(e) => pick(e.target.value)} data-testid="select-add-currency">
          <option value="">Select currency</option>
          {available.map((c) => <option key={c.code} value={c.code}>{c.code} - {c.name}</option>)}
        </select>
      </div>
    </>
  );
  const head = ['Code', 'Prefix', 'Suffix', 'Format', 'Rate', 'Live', 'Client Default', 'Action'];
  return (
    <div className="min-w-0 max-w-full space-y-3" data-testid="page-currencies">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight" data-testid="text-page-title">Currencies</h1>
        <p className="mt-0.5 text-[12.5px] text-[hsl(var(--text-secondary))]">{legacy ? 'Legacy reference rates are preserved pending approved conversion.' : 'Set your own manual exchange rates relative to USD.'}</p>
      </div>
      {base && <div className="flex flex-wrap items-center gap-2 text-[12px] text-[hsl(var(--text-secondary))]" data-testid="text-reference"><Badge tone="violet">{cfg?.money_model_version === 2 ? 'Base / Reference' : 'Accounting Reference'}</Badge><b className="text-[hsl(var(--foreground))]">{base}</b> fixed at rate 1.000000. Client Default below is chosen independently.</div>}
      {adminPreview && <p role="status" className="text-[12.5px] text-[hsl(var(--text-secondary))]">Administrator preview is read-only.</p>}
      {legacy && <div role="status" className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[12.5px]" data-testid="text-conversion-required"><b>Currency conversion required.</b> Legacy prices are still stored in the old currency model. Currency and product reference edits are disabled until your account is migrated to USD base pricing.</div>}
      {rowErr && <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger" data-testid="text-row-error"><AlertCircle size={14} className="mt-0.5 shrink-0" />{rowErr}</div>}

      <div className="sl-surface min-w-0 max-w-full overflow-hidden" data-testid="currencies-list">
        {q.isLoading ? (
          <div className="space-y-2 p-4" aria-busy="true" data-testid="currencies-loading">{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-md bg-white/5" />)}</div>
        ) : q.isError || !cfg ? (
          <EmptyState icon={<AlertCircle size={18} />} title="Currencies could not be loaded" description={errText(q.error)} action={<Btn onClick={() => void q.refetch()} data-testid="button-retry-currencies">Retry</Btn>} />
        ) : (
          <>
            <div className={`space-y-2 border-b border-[hsl(var(--border))] p-3 md:hidden ${locked ? 'hidden' : ''}`} data-testid="add-currency-mobile">
              <div className="text-[12.5px] font-semibold">Add currency</div>
              <div><label className="lbl">Currency</label>{addFields}</div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="lbl" htmlFor="m-prefix">Prefix</label><input id="m-prefix" className={inp} maxLength={24} value={add.prefix} onChange={(e) => setA('prefix', e.target.value)} /></div>
                <div><label className="lbl" htmlFor="m-suffix">Suffix</label><input id="m-suffix" className={inp} maxLength={24} value={add.suffix} onChange={(e) => setA('suffix', e.target.value)} /></div>
                <div><label className="lbl" htmlFor="m-format">Format</label><select id="m-format" className={inp} value={add.number_format} onChange={(e) => setA('number_format', e.target.value)}>{FORMATS.map((f) => <option key={f} value={f}>{fmtLabel(f)}</option>)}</select></div>
                <div><label className="lbl" htmlFor="m-rate">Rate</label><input id="m-rate" className={`${inp} tabular-nums`} inputMode="decimal" value={add.rate} onChange={(e) => setA('rate', e.target.value)} /></div>
              </div>
              <label className="flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={add.enabled} onChange={(e) => setA('enabled', e.target.checked)} />Live</label>
              {addErr && <p role="alert" className="text-[11.5px] text-danger">{addErr}</p>}
              <Btn v="brand" className="w-full" disabled={w.pending} onClick={() => void submitAdd()}><Plus size={14} />Add currency</Btn>
            </div>
            <div className="max-w-full overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))] text-[11px] uppercase tracking-wide text-[hsl(var(--text-secondary))]">
                    {head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="[&>tr>td]:px-3 [&>tr>td]:py-1.5 [&>tr>td]:align-middle">
                  <tr className={`hidden border-b border-[hsl(var(--border))] bg-[hsl(var(--brand)/.06)] ${locked ? '' : 'md:table-row'}`} data-testid="row-add-currency">
                    <td className="min-w-[200px]">{addFields}</td>
                    <td><input className={`${inp} w-16`} aria-label="Prefix" maxLength={24} value={add.prefix} onChange={(e) => setA('prefix', e.target.value)} data-testid="input-add-prefix" /></td>
                    <td><input className={`${inp} w-20`} aria-label="Suffix" maxLength={24} value={add.suffix} onChange={(e) => setA('suffix', e.target.value)} data-testid="input-add-suffix" /></td>
                    <td><select className={`${inp} w-28`} aria-label="Format" value={add.number_format} onChange={(e) => setA('number_format', e.target.value)} data-testid="select-add-format">{FORMATS.map((f) => <option key={f} value={f}>{fmtLabel(f)}</option>)}</select></td>
                    <td><input className={`${inp} w-24 tabular-nums`} aria-label="Rate" inputMode="decimal" placeholder="Rate" value={add.rate} onChange={(e) => setA('rate', e.target.value)} data-testid="input-add-rate" /></td>
                    <td><input type="checkbox" aria-label="Live" checked={add.enabled} onChange={(e) => setA('enabled', e.target.checked)} /></td>
                    <td className="text-[11px] text-[hsl(var(--text-secondary))]">Set after adding</td>
                    <td><Btn v="brand" sm disabled={w.pending} onClick={() => void submitAdd()} data-testid="button-add-currency"><Plus size={12} />Add</Btn>{addErr && <p role="alert" className="mt-1 max-w-[180px] text-[11px] text-danger">{addErr}</p>}</td>
                  </tr>
                  {rows.length === 0 && <tr><td colSpan={8} className="!py-6 text-center text-[12.5px] text-[hsl(var(--text-secondary))]"><Coins size={16} className="mx-auto mb-1 opacity-60" />No currencies yet. Add one above and enter its rate yourself.</td></tr>}
                  {rows.map((r) => {
                    const isBase = r.is_base === true || r.code === base;
                    return (
                      <tr key={r.code} className="border-b border-[hsl(var(--border))] last:border-0 hover:bg-white/[.03]" data-testid={`row-currency-${r.code}`}>
                        <td><div className="flex flex-wrap items-center gap-1.5"><b>{r.code}</b><span className="text-[hsl(var(--text-secondary))]">{r.name}</span>{isBase && <Badge tone="violet">Accounting Reference</Badge>}</div></td>
                        <td>{r.prefix || '-'}</td>
                        <td>{r.suffix || '-'}</td>
                        <td className="tabular-nums" title={r.number_format}>{r.prefix}{preview(r.number_format, r.decimals)}{r.suffix}</td>
                        <td className="tabular-nums">{isBase ? '1.000000' : unconf(r) ? <Badge tone="violet">Require rate</Badge> : r.rate}</td>
                        <td><input type="checkbox" aria-label={`Live ${r.code}`} checked={r.enabled} disabled={locked || w.pending || r.client_default || isBase || (unconf(r) && !r.enabled)} title={r.client_default ? 'Choose another default first' : undefined} onChange={(e) => void quick(r, { enabled: e.target.checked })} data-testid={`switch-enabled-${r.code}`} /></td>
                        <td><input type="radio" name="client-default" className="accent-[hsl(var(--brand))]" aria-label={`Client default ${r.code}`} checked={r.client_default} disabled={locked || w.pending || !r.enabled} onChange={() => { if (!r.client_default) void quick(r, { client_default: true }); }} data-testid={`button-default-${r.code}`} /></td>
                        <td><div className="flex gap-1.5">
                          <Btn sm disabled={locked} onClick={() => openEdit(r)} data-testid={`button-edit-${r.code}`}><Pencil size={12} />Edit</Btn>
                          <Btn sm v="danger" disabled={locked || w.pending || r.client_default || isBase} onClick={() => setDel(r)} aria-label={`Delete ${r.code}`} data-testid={`button-delete-${r.code}`}><Trash2 size={12} /></Btn>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <Modal open={!!form && !locked} onClose={() => setForm(null)} title={`Edit ${form?.code ?? ''}`} width={520}
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
                  {FORMATS.map((f) => <option key={f} value={f}>{fmtLabel(f)}</option>)}
                </select>
              </Field>
              <Field label={`Rate (1 ${base} = ? ${form.code || 'unit'})`} error={fieldErr} hint={form.code === base ? 'Base currency rate is always 1.000000 and cannot be changed.' : 'Enter manually, up to 6 decimals.'}>
                <input className="input w-full tabular-nums" inputMode="decimal" value={form.code === base ? '1.000000' : form.rate} placeholder={form.code === base ? '' : 'Require rate'} disabled={form.code === base} onChange={(e) => set('rate', e.target.value)} data-testid="input-currency-rate" />
              </Field>
            </div>
            <p className="text-[12px] text-[hsl(var(--text-secondary))]" data-testid="text-format-preview">Preview: {form.prefix}{preview(form.number_format, form.decimals)}{form.suffix}</p>
            <div className="flex flex-wrap gap-4 text-[12.5px]">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.enabled} disabled={form.client_default} onChange={(e) => set('enabled', e.target.checked)} data-testid="check-currency-enabled" />Enabled</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={form.client_default} disabled={!form.enabled || rows.some(r=>r.code===form.code&&r.client_default)} onChange={(e) => set('client_default', e.target.checked)} data-testid="check-currency-default" />Client default</label>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog open={!!del && !locked} danger title="Delete currency" confirmLabel="Delete" onClose={() => setDel(null)}
        body={<>Delete {del?.code} ({del?.name})? Storefront prices will no longer be offered in this currency.</>}
        onConfirm={async () => { if (!del) return false; try { setRowErr(''); await w.archive('currencies', del.code); return true; } catch (e) { setRowErr(`${del.code}: ${errText(e)}`); return false; } }} />
    </div>
  );
}
