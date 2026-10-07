import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, ExternalLink, ImagePlus, Lock, Plus, Search, Trash2, X } from 'lucide-react';
import { Btn, Card, ConfirmDialog, Field, Modal } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';
import {
  errText, minorToDecimal, money, newId, slugOf, uploadCommerceAsset, useCommerceAccess, useCommerceList,
  useCommerceWrite, useRefreshAccessOnFocus,
} from '@/hooks/use-commerce';
import { formatScaled, unitsToInput, usePanelMoney, type PanelCurrency } from '@/hooks/use-panel-money';
import { commerceSettingsPayload } from '@/lib/commerce-settings';

interface Settings { enabled: boolean; title: string; currency: string; featured_first: boolean; email_mode: Mode; address_mode: Mode; show_state: boolean; show_city: boolean; show_note: boolean; whatsapp: string; confirmation_message: string; public_slug: string }
type Mode = 'hidden' | 'optional' | 'required';
interface Overview { total_products: number; active_products: number; total_orders: number; new_orders: number; completed_orders: number; recent_orders: OrderRow[]; public_slug: string }
interface Category { id: string; name: string; slug: string; description: string; image_id: string | null; image_url: string | null; enabled: boolean; sort_order: number }
interface Img { id: string; url: string }
interface Product { id: string; name: string; slug: string; short_description: string; description: string; category_id: string | null; sku: string; price_minor: string; compare_at_minor: string | null; price_usd_units?: string | null; compare_at_usd_units?: string | null; active: boolean; featured: boolean; in_stock: boolean; stock_quantity: number | null; sort_order: number; images: Img[] }
interface Snap { currency?: Partial<PanelCurrency> & { code?: string }; code?: string; prefix?: string; suffix?: string; number_format?: string; decimals?: number; presentation_version?: number; total_minor?: string; base_usd_units?: string; canonical_scale?: number; items?: { product_id: string; unit_price_minor: string; line_total_minor: string }[] }
interface OrderRow { currency_snapshot?: Snap | null; id: string; reference: string; customer_name: string; phone: string; email: string; total_minor: string; currency: string; status: string; created_at: string }
interface OrderDetail extends OrderRow { items: { product_id?: string; product_name: string; sku: string; quantity: number; unit_price_minor: string; line_total_minor: string; image_url: string | null }[]; history: { status: string; created_at: string }[] }
interface Customer { customer_name: string; phone: string; email: string; order_count: number; last_order_at: string }

const SECTIONS = ['Overview', 'Products', 'Categories', 'Orders', 'Customers', 'Settings'] as const;
type Section = typeof SECTIONS[number];
const CURRENCIES = ['DZD', 'USD', 'EUR', 'GBP', 'MAD'];
const STATUSES = ['new', 'confirmed', 'processing', 'completed', 'cancelled'];
const TONE: Record<string, string> = { new: 'bg-primary/20 text-[hsl(217_95%_72%)]', confirmed: 'bg-violet/20 text-[hsl(262_90%_77%)]', processing: 'bg-warn/20 text-[hsl(30_95%_62%)]', completed: 'bg-ok/20 text-[hsl(152_60%_58%)]', cancelled: 'bg-danger/20 text-[hsl(0_90%_72%)]' };
const when = (s: string) => { const d = new Date(s); return Number.isNaN(+d) ? '-' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
const DECIMAL = /^\d{1,12}(\.\d{1,2})?$/;
const DECIMAL12 = /^\d{1,10}(\.\d{1,12})?$/;
/** Historical order money: always the snapshot's converted customer amount, never current panel rates. */
function orderMoney(o: { currency: string; currency_snapshot?: Snap | null }, minor: string | undefined | null): string {
  if (minor == null) return '-';
  const sn = o.currency_snapshot;
  if (!sn) return money(minor, o.currency);
  const c = sn.currency ?? sn;
  return formatScaled(BigInt(minor), c.decimals ?? 2, { prefix: c.prefix ?? '', suffix: c.suffix ?? '', number_format: c.number_format ?? '1,234.56', decimals: c.decimals ?? 2 }, c.code ?? o.currency, c.presentation_version !== 2);
}

const StatusPill = ({ s }: { s: string }) => <span className={`badge capitalize ${TONE[s] ?? ''}`}>{s}</span>;

function Loading({ rows = 5 }: { rows?: number }) {
  return <div className="space-y-2 p-3" aria-busy="true" data-testid="commerce-loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-9 animate-pulse rounded-md bg-[hsl(var(--muted))]" />)}</div>;
}
function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <EmptyState compact icon={<AlertTriangle size={18} />} title="Could not load this data" description={message}
    action={<Btn onClick={onRetry} data-testid="button-commerce-retry">Try again</Btn>} />;
}
function Banner({ error }: { error: string }) {
  return error ? <div role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[12px] text-[hsl(0_85%_72%)]" data-testid="text-commerce-error">{error}</div> : null;
}
function Toolbar({ search, onSearch, children, placeholder }: { search?: string; onSearch?: (v: string) => void; children?: ReactNode; placeholder?: string }) {
  const [v, setV] = useState(search ?? '');
  useEffect(() => { if (!onSearch) return; const t = window.setTimeout(() => onSearch(v.trim()), 300); return () => window.clearTimeout(t); }, [v, onSearch]);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b p-3">
      {onSearch && <div className="relative min-w-[180px] flex-1"><Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" /><input className="input pl-8" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} aria-label="Search" data-testid="input-commerce-search" /></div>}
      {children}
    </div>
  );
}
function Paging({ page, hasMore, onPage }: { page: number; hasMore: boolean; onPage: (p: number) => void }) {
  if (page === 1 && !hasMore) return null;
  return (
    <div className="flex items-center justify-between border-t p-3 text-[12px] text-muted-foreground">
      <Btn sm disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="button-page-prev"><ArrowLeft size={12} />Previous</Btn>
      <span>Page {page}</span>
      <Btn sm disabled={!hasMore} onClick={() => onPage(page + 1)} data-testid="button-page-next">Next<ArrowRight size={12} /></Btn>
    </div>
  );
}
function Toggle({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return <label className="flex cursor-pointer items-center gap-2 text-[12.5px]"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={id} />{label}</label>;
}

function usePublicLink(slug?: string) {
  if (!slug) return null;
  const path = `/${slug}`;
  return { path, url: `${window.location.origin}${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}${path}` };
}
function PublicLink({ slug }: { slug?: string }) {
  const l = usePublicLink(slug);
  if (!l) return <span className="text-[12px] text-muted-foreground">The subscriber public address is unavailable.</span>;
  return <a className="link inline-flex items-center gap-1 break-all" href={l.url} target="_blank" rel="noopener noreferrer" data-testid="link-public-store">{l.url}<ExternalLink size={11} /></a>;
}

/* ---------------- Overview ---------------- */
function OverviewSection({ go }: { go: (s: Section) => void }) {
  const q = useCommerceList<Overview>('overview');
  const o = q.rows;
  if (q.isLoading) return <Card><Loading rows={4} /></Card>;
  if (q.isError || !o) return <Card><Failure message={errText(q.error)} onRetry={() => void q.refetch()} /></Card>;
  const stats: [string, number][] = [['Products', o.total_products], ['Active products', o.active_products], ['Orders', o.total_orders], ['New orders', o.new_orders], ['Completed', o.completed_orders]];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map(([l, n]) => <Card key={l} className="p-3" data-testid={`stat-${slugOf(l)}`}><div className="text-[20px] font-semibold tabular-nums leading-none">{n}</div><div className="mt-1 text-[11px] text-muted-foreground">{l}</div></Card>)}
      </div>
      <Card className="p-3"><div className="mb-1 text-[11.5px] font-semibold">Public store address</div><PublicLink slug={o.public_slug} /></Card>
      <Card>
        <div className="flex items-center justify-between border-b p-3"><div className="text-[13px] font-semibold">Recent orders</div><button className="link" onClick={() => go('Orders')}>View all</button></div>
        {o.recent_orders.length === 0 ? <EmptyState compact title="No orders yet" description="Orders placed from your public store will appear here." /> : (
          <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th>Reference</th><th>Customer</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead>
            <tbody>{o.recent_orders.map((r) => <tr key={r.id} data-testid={`row-recent-order-${r.id}`}><td className="font-mono">{r.reference}</td><td>{r.customer_name}</td><td>{orderMoney(r, r.currency_snapshot?.total_minor ?? r.total_minor)}</td><td><StatusPill s={r.status} /></td><td>{when(r.created_at)}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Image picker ---------------- */
function ImageUploader({ images, max, onChange, setError }: { images: Img[]; max: number; onChange: (i: Img[]) => void; setError: (m: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setError('');
    let next = images;
    try {
      for (const f of Array.from(files)) { if (next.length >= max) break; const r = await uploadCommerceAsset(f); next = [...next, { id: r.id, url: r.url }]; onChange(next); }
    } catch (e) { setError(errText(e)); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  const move = (i: number, d: number) => { const n = [...images]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {images.map((im, i) => (
          <div key={im.id} className="w-[84px]" data-testid={`image-slot-${i}`}>
            <div className="relative"><img src={im.url} alt="" className="h-[84px] w-[84px] rounded-md border object-cover" />
              {i === 0 && <span className="badge absolute left-1 top-1 bg-black/70 text-[9.5px]">Main</span>}
              <button type="button" className="absolute right-1 top-1 rounded bg-black/70 p-0.5" aria-label="Remove image" onClick={() => onChange(images.filter((x) => x.id !== im.id))} data-testid={`button-remove-image-${i}`}><X size={12} /></button></div>
            <div className="mt-1 flex justify-between"><Btn sm className="w-9 px-0" type="button" disabled={i === 0} aria-label="Move earlier" onClick={() => move(i, -1)}><ArrowLeft size={12} /></Btn><Btn sm className="w-9 px-0" type="button" disabled={i === images.length - 1} aria-label="Move later" onClick={() => move(i, 1)}><ArrowRight size={12} /></Btn></div>
          </div>
        ))}
        {images.length < max && (
          <button type="button" disabled={busy} onClick={() => ref.current?.click()} className="grid h-[84px] w-[84px] place-items-center rounded-md border border-dashed text-[11px] text-muted-foreground hover:bg-accent/50" data-testid="button-upload-image">
            <span className="flex flex-col items-center gap-1"><ImagePlus size={16} />{busy ? 'Uploading' : 'Add image'}</span>
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg" multiple={max > 1} hidden onChange={(e) => void pick(e.target.files)} data-testid="input-image-file" />
    </div>
  );
}

/* ---------------- Products ---------------- */
function ProductForm({ initial, categories, currency, onClose }: { initial: Product | null; categories: Category[]; currency: string; onClose: () => void }) {
  const w = useCommerceWrite();
  const pm = usePanelMoney();
  const legacy = pm.legacy;
  const v2 = pm.v2||currency==='USD';
  const [id] = useState(() => initial?.id ?? newId());
  const [f, setF] = useState({
    name: initial?.name ?? '', slug: initial?.slug ?? '', short_description: initial?.short_description ?? '', description: initial?.description ?? '',
    category_id: initial?.category_id ?? '', sku: initial?.sku ?? '', price: initial?.price_usd_units != null ? unitsToInput(initial.price_usd_units) : minorToDecimal(initial?.price_minor), compare_at: initial?.compare_at_usd_units != null ? unitsToInput(initial.compare_at_usd_units) : minorToDecimal(initial?.compare_at_minor),
    active: initial?.active ?? true, featured: initial?.featured ?? false, in_stock: initial?.in_stock ?? true,
    stock_quantity: initial?.stock_quantity == null ? '' : String(initial.stock_quantity), sort_order: String(initial?.sort_order ?? 0),
  });
  const [images, setImages] = useState<Img[]>(initial?.images ?? []);
  const [slugTouched, setSlugTouched] = useState(!!initial);
  const [err, setErr] = useState('');
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const submit = async () => {
    if (!f.name.trim()) return setErr('Enter a product name.');
    if (!f.slug.trim()) return setErr('Enter a URL slug.');
    if (legacy) return setErr('Prices cannot be saved until your account is migrated to USD base pricing.');
    const RX = v2 ? DECIMAL12 : DECIMAL; const dp = v2 ? 'twelve' : 'two';
    if (!RX.test(f.price)) return setErr(`Selling price must be a USD number with up to ${dp} decimals.`);
    if (f.compare_at && !RX.test(f.compare_at)) return setErr(`Compare-at price must be a USD number with up to ${dp} decimals.`);
    if (f.stock_quantity !== '' && !/^\d{1,9}$/.test(f.stock_quantity)) return setErr('Stock must be a whole number or empty.');
    if (!/^-?\d{1,6}$/.test(f.sort_order)) return setErr('Sort order must be a whole number.');
    setErr('');
    try {
      await w.save('products', {
        ...(initial ? { id } : {}), name: f.name.trim(), slug: f.slug.trim(), short_description: f.short_description.trim(), description: f.description.trim(),
        category_id: f.category_id || null, sku: f.sku.trim(), price: f.price, compare_at: f.compare_at || null,
        active: f.active, featured: f.featured, in_stock: f.in_stock, stock_quantity: f.stock_quantity === '' ? null : Number(f.stock_quantity),
        sort_order: Number(f.sort_order), image_ids: images.map((i) => i.id),
      });
      onClose();
    } catch (e) { setErr(errText(e)); }
  };
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit product' : 'New product'} width={640}
      footer={<><Btn onClick={onClose} data-testid="button-product-cancel">Cancel</Btn><Btn v="primary" disabled={w.pending || legacy} onClick={() => void submit()} data-testid="button-product-save">{w.pending ? 'Saving...' : 'Save product'}</Btn></>}>
      <div className="max-h-[68dvh] space-y-3 overflow-y-auto pr-1 scroll-thin">
        <Banner error={err} />
        {legacy && <div role="status" className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-[12px]" data-testid="text-product-legacy">Prices are shown in the legacy model. New price writes are blocked pending migration.</div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className="input" maxLength={160} value={f.name} onChange={(e) => { set('name', e.target.value); if (!slugTouched) set('slug', slugOf(e.target.value)); }} data-testid="input-product-name" /></Field>
          <Field label="URL slug"><input className="input" value={f.slug} onChange={(e) => { setSlugTouched(true); set('slug', slugOf(e.target.value)); }} data-testid="input-product-slug" /></Field>
          <Field label={v2 ? 'Selling Price (USD)' : `Price (${currency})`}><input className="input" inputMode="decimal" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="0.00" data-testid="input-product-price" /></Field>
          <Field label={v2 ? 'Compare-at Price (USD)' : 'Compare-at price'} hint="Optional original price shown struck through."><input className="input" inputMode="decimal" value={f.compare_at} onChange={(e) => set('compare_at', e.target.value)} placeholder="0.00" data-testid="input-product-compare" /></Field>
          <Field label="Category"><select className="input" value={f.category_id} onChange={(e) => set('category_id', e.target.value)} data-testid="select-product-category"><option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.enabled ? '' : ' (disabled)'}</option>)}</select></Field>
          <Field label="SKU"><input className="input" value={f.sku} onChange={(e) => set('sku', e.target.value)} data-testid="input-product-sku" /></Field>
          <Field label="Stock quantity" hint="Leave empty to not track stock."><input className="input" inputMode="numeric" value={f.stock_quantity} onChange={(e) => set('stock_quantity', e.target.value)} data-testid="input-product-stock" /></Field>
          <Field label="Sort order"><input className="input" inputMode="numeric" value={f.sort_order} onChange={(e) => set('sort_order', e.target.value)} data-testid="input-product-sort" /></Field>
        </div>
        <Field label="Short description"><input className="input" maxLength={240} value={f.short_description} onChange={(e) => set('short_description', e.target.value)} data-testid="input-product-short" /></Field>
        <Field label="Description"><textarea className="input" rows={4} value={f.description} onChange={(e) => set('description', e.target.value)} data-testid="input-product-description" /></Field>
        <Field label={`Images (${images.length}/8)`} hint="PNG or JPEG. The first image is the main image."><ImageUploader images={images} max={8} onChange={setImages} setError={setErr} /></Field>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Toggle id="toggle-product-active" label="Active (visible in store)" checked={f.active} onChange={(v) => set('active', v)} />
          <Toggle id="toggle-product-featured" label="Featured" checked={f.featured} onChange={(v) => set('featured', v)} />
          <Toggle id="toggle-product-instock" label="In stock" checked={f.in_stock} onChange={(v) => set('in_stock', v)} />
        </div>
      </div>
    </Modal>
  );
}

function ProductsSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const params = { page, ...(search ? { search } : {}), ...(status ? { status } : {}) };
  const q = useCommerceList<Product[]>('products', params);
  const cats = useCommerceList<Category[]>('categories');
  const set = useCommerceList<Settings>('settings');
  const w = useCommerceWrite();
  const [edit, setEdit] = useState<Product | 'new' | null>(null);
  const [del, setDel] = useState<Product | null>(null);
  const [err, setErr] = useState('');
  const cur = set.rows?.currency ?? 'USD';
  const pm = usePanelMoney();
  const catName = (id: string | null) => cats.rows?.find((c) => c.id === id)?.name ?? '-';
  return (
    <Card>
      <Toolbar onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Search name or SKU...">
        <select className="input w-auto" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Filter" data-testid="filter-product-status"><option value="">All products</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        <Btn v="primary" onClick={() => setEdit('new')} data-testid="button-new-product"><Plus size={14} />New product</Btn>
      </Toolbar>
      {err && <div className="p-3"><Banner error={err} /></div>}
      {q.isLoading ? <Loading /> : q.isError || !q.rows ? <Failure message={errText(q.error)} onRetry={() => void q.refetch()} /> :
        q.rows.length === 0 ? <EmptyState compact title={search || status ? 'No products match' : 'No products yet'} description={search || status ? 'Try a different search or filter.' : 'Add your first product to start selling.'} action={!search && !status ? <Btn v="primary" onClick={() => setEdit('new')}>New product</Btn> : undefined} /> : (
          <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th></th><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th></th></tr></thead>
            <tbody>{q.rows.map((p) => (
              <tr key={p.id} className="hov" onClick={() => setEdit(p)} data-testid={`row-product-${p.id}`}>
                <td>{p.images[0] ? <img src={p.images[0].url} alt="" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-[hsl(var(--muted))]" />}</td>
                <td><div className="font-semibold">{p.name}</div><div className="text-[10.5px] text-muted-foreground">{p.sku || p.slug}</div></td>
                <td>{catName(p.category_id)}</td>
                <td>{pm.v2 ? pm.formatUsd(p.price_usd_units) : money(p.price_minor, cur)}{pm.v2 ? (p.compare_at_usd_units && <div className="text-[10.5px] text-muted-foreground line-through">{pm.formatUsd(p.compare_at_usd_units)}</div>) : (p.compare_at_minor && <div className="text-[10.5px] text-muted-foreground line-through">{money(p.compare_at_minor, cur)}</div>)}</td>
                <td>{p.in_stock ? (p.stock_quantity == null ? 'In stock' : p.stock_quantity) : <span className="text-danger">Out</span>}</td>
                <td><span className={`badge ${p.active ? TONE.completed : TONE.cancelled}`}>{p.active ? 'Active' : 'Inactive'}</span>{p.featured && <span className="badge ml-1 bg-brand/20">Featured</span>}</td>
                <td><Btn sm className="w-8 px-0" aria-label="Archive product" onClick={(e) => { e.stopPropagation(); setDel(p); }} data-testid={`button-archive-product-${p.id}`}><Trash2 size={13} /></Btn></td>
              </tr>))}</tbody></table></div>
        )}
      <Paging page={page} hasMore={q.hasMore} onPage={setPage} />
      {edit && <ProductForm key={edit === 'new' ? 'new' : edit.id} initial={edit === 'new' ? null : edit} categories={cats.rows ?? []} currency={cur} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!del} danger title="Archive product" confirmLabel="Archive" onClose={() => setDel(null)}
        body={<>Archive <b>{del?.name}</b>? It will no longer appear in your public store. Existing orders keep their records.</>}
        onConfirm={async () => { try { setErr(''); await w.archive('products', del!.id); return true; } catch (e) { setErr(errText(e)); return false; } }} />
    </Card>
  );
}

/* ---------------- Categories ---------------- */
function CategoryForm({ initial, onClose }: { initial: Category | null; onClose: () => void }) {
  const w = useCommerceWrite();
  const [id] = useState(() => initial?.id ?? newId());
  const [f, setF] = useState({ name: initial?.name ?? '', slug: initial?.slug ?? '', description: initial?.description ?? '', enabled: initial?.enabled ?? true, sort_order: String(initial?.sort_order ?? 0) });
  const [img, setImg] = useState<Img[]>(initial?.image_id && initial.image_url ? [{ id: initial.image_id, url: initial.image_url }] : []);
  const [touched, setTouched] = useState(!!initial);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (!f.name.trim()) return setErr('Enter a category name.');
    if (!f.slug.trim()) return setErr('Enter a URL slug.');
    if (!/^-?\d{1,6}$/.test(f.sort_order)) return setErr('Sort order must be a whole number.');
    try { await w.save('categories', { ...(initial ? { id } : {}), name: f.name.trim(), slug: f.slug.trim(), description: f.description.trim(), image_id: img[0]?.id ?? null, enabled: f.enabled, sort_order: Number(f.sort_order) }); onClose(); } catch (e) { setErr(errText(e)); }
  };
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit category' : 'New category'} width={480}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn v="primary" disabled={w.pending} onClick={() => void submit()} data-testid="button-category-save">{w.pending ? 'Saving...' : 'Save category'}</Btn></>}>
      <Banner error={err} />
      <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF((p) => ({ ...p, name: e.target.value, slug: touched ? p.slug : slugOf(e.target.value) }))} data-testid="input-category-name" /></Field>
      <Field label="URL slug"><input className="input" value={f.slug} onChange={(e) => { setTouched(true); setF((p) => ({ ...p, slug: slugOf(e.target.value) })); }} data-testid="input-category-slug" /></Field>
      <Field label="Description"><textarea className="input" rows={3} value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} data-testid="input-category-description" /></Field>
      <Field label="Image"><ImageUploader images={img} max={1} onChange={setImg} setError={setErr} /></Field>
      <div className="flex items-end justify-between gap-3">
        <Toggle id="toggle-category-enabled" label="Enabled" checked={f.enabled} onChange={(v) => setF((p) => ({ ...p, enabled: v }))} />
        <div className="w-28"><Field label="Sort order"><input className="input" inputMode="numeric" value={f.sort_order} onChange={(e) => setF((p) => ({ ...p, sort_order: e.target.value }))} data-testid="input-category-sort" /></Field></div>
      </div>
    </Modal>
  );
}

function CategoriesSection() {
  const q = useCommerceList<Category[]>('categories');
  const w = useCommerceWrite();
  const [edit, setEdit] = useState<Category | 'new' | null>(null);
  const [del, setDel] = useState<Category | null>(null);
  const [err, setErr] = useState('');
  return (
    <Card>
      <Toolbar><div className="flex-1 text-[13px] font-semibold">Categories</div><Btn v="primary" onClick={() => setEdit('new')} data-testid="button-new-category"><Plus size={14} />New category</Btn></Toolbar>
      {err && <div className="p-3"><Banner error={err} /></div>}
      {q.isLoading ? <Loading rows={4} /> : q.isError || !q.rows ? <Failure message={errText(q.error)} onRetry={() => void q.refetch()} /> :
        q.rows.length === 0 ? <EmptyState compact title="No categories yet" description="Group products so customers can browse them." action={<Btn v="primary" onClick={() => setEdit('new')}>New category</Btn>} /> : (
          <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th></th><th>Name</th><th>Slug</th><th>Order</th><th>Status</th><th></th></tr></thead>
            <tbody>{q.rows.map((c) => (
              <tr key={c.id} className="hov" onClick={() => setEdit(c)} data-testid={`row-category-${c.id}`}>
                <td>{c.image_url ? <img src={c.image_url} alt="" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-[hsl(var(--muted))]" />}</td>
                <td className="font-semibold">{c.name}</td><td className="text-muted-foreground">{c.slug}</td><td>{c.sort_order}</td>
                <td><span className={`badge ${c.enabled ? TONE.completed : TONE.cancelled}`}>{c.enabled ? 'Enabled' : 'Disabled'}</span></td>
                <td>{c.enabled && <Btn sm onClick={(e) => { e.stopPropagation(); setDel(c); }} data-testid={`button-disable-category-${c.id}`}>Disable</Btn>}</td>
              </tr>))}</tbody></table></div>
        )}
      {edit && <CategoryForm key={edit === 'new' ? 'new' : edit.id} initial={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      <ConfirmDialog open={!!del} danger title="Disable category" confirmLabel="Disable" onClose={() => setDel(null)}
        body={<>Disable <b>{del?.name}</b>? It will be hidden from your public store. You can enable it again by editing it.</>}
        onConfirm={async () => { try { setErr(''); await w.archive('categories', del!.id); return true; } catch (e) { setErr(errText(e)); return false; } }} />
    </Card>
  );
}

/* ---------------- Orders ---------------- */
const snapItem = (o: OrderDetail, it: OrderDetail['items'][number]) => it.product_id ? o.currency_snapshot?.items?.find((x) => x.product_id === it.product_id) : undefined;

function OrderDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useCommerceList<OrderDetail>('orders', { id });
  const w = useCommerceWrite();
  const [err, setErr] = useState('');
  const o = q.rows;
  const change = async (status: string) => { try { setErr(''); await w.save('orders', { id, status }); } catch (e) { setErr(errText(e)); } };
  return (
    <Modal open onClose={onClose} title={o ? `Order ${o.reference}` : 'Order'} width={560} footer={<Btn onClick={onClose} data-testid="button-order-close">Close</Btn>}>
      {q.isLoading ? <Loading rows={3} /> : q.isError || !o ? <Failure message={errText(q.error)} onRetry={() => void q.refetch()} /> : (
        <div className="max-h-[66dvh] space-y-3 overflow-y-auto scroll-thin" data-testid="order-detail">
          <Banner error={err} />
          <div className="grid gap-2 text-[12.5px] sm:grid-cols-2">
            <div><div className="lbl">Customer</div>{o.customer_name}</div><div><div className="lbl">Phone</div>{o.phone}</div>
            <div><div className="lbl">Email</div>{o.email || '-'}</div><div><div className="lbl">Placed</div>{when(o.created_at)}</div>
          </div>
          <div className="flex items-center gap-2"><label className="lbl mb-0" htmlFor="order-status">Status</label>
            <select id="order-status" className="input w-auto capitalize" value={o.status} disabled={w.pending} onChange={(e) => void change(e.target.value)} data-testid="select-order-status">{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="space-y-1.5">{o.items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border p-2 text-[12px]">
              {it.image_url ? <img src={it.image_url} alt="" className="h-9 w-9 rounded object-cover" /> : <div className="h-9 w-9 rounded bg-[hsl(var(--muted))]" />}
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{it.product_name}</div><div className="text-[10.5px] text-muted-foreground">{it.sku && `${it.sku} - `}{it.quantity} x {orderMoney(o, snapItem(o, it)?.unit_price_minor ?? it.unit_price_minor)}</div></div>
              <div className="font-medium">{orderMoney(o, snapItem(o, it)?.line_total_minor ?? it.line_total_minor)}</div></div>))}
            <div className="flex justify-between px-1 text-[13px] font-semibold"><span>Total</span><span data-testid="text-order-total">{orderMoney(o, o.currency_snapshot?.total_minor ?? o.total_minor)}</span></div></div>
          <div><div className="lbl">History</div><ul className="space-y-1 text-[12px]">{o.history.map((h, i) => <li key={i} className="flex items-center gap-2"><StatusPill s={h.status} /><span className="text-muted-foreground">{when(h.created_at)}</span></li>)}</ul></div>
        </div>
      )}
    </Modal>
  );
}

function OrdersSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = useCommerceList<OrderRow[]>('orders', { page, ...(search ? { search } : {}), ...(status ? { status } : {}) });
  return (
    <Card>
      <Toolbar onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Search reference, name, phone...">
        <select className="input w-auto capitalize" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} aria-label="Status filter" data-testid="filter-order-status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
      </Toolbar>
      {q.isLoading ? <Loading /> : q.isError || !q.rows ? <Failure message={errText(q.error)} onRetry={() => void q.refetch()} /> :
        q.rows.length === 0 ? <EmptyState compact title={search || status ? 'No orders match' : 'No orders yet'} description={search || status ? 'Try a different search or filter.' : 'Orders from your public store will appear here.'} /> : (
          <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th>Reference</th><th>Customer</th><th>Phone</th><th>Total</th><th>Status</th><th>Placed</th></tr></thead>
            <tbody>{q.rows.map((r) => <tr key={r.id} className="hov" onClick={() => setOpen(r.id)} data-testid={`row-order-${r.id}`}><td className="font-mono">{r.reference}</td><td>{r.customer_name}</td><td>{r.phone}</td><td>{orderMoney(r, r.currency_snapshot?.total_minor ?? r.total_minor)}</td><td><StatusPill s={r.status} /></td><td>{when(r.created_at)}</td></tr>)}</tbody></table></div>
        )}
      <Paging page={page} hasMore={q.hasMore} onPage={setPage} />
      {open && <OrderDetailModal id={open} onClose={() => setOpen(null)} />}
    </Card>
  );
}

/* ---------------- Customers ---------------- */
function CustomersSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useCommerceList<Customer[]>('customers', { page, ...(search ? { search } : {}) });
  return (
    <Card>
      <Toolbar onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Search name, phone or email..." />
      {q.isLoading ? <Loading /> : q.isError || !q.rows ? <Failure message={errText(q.error)} onRetry={() => void q.refetch()} /> :
        q.rows.length === 0 ? <EmptyState compact title={search ? 'No customers match' : 'No customers yet'} description="Customers are created from their orders." /> : (
          <div className="scroll-thin overflow-x-auto"><table className="tbl"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Orders</th><th>Last order</th></tr></thead>
            <tbody>{q.rows.map((c, i) => <tr key={`${c.phone}-${c.email}-${i}`} data-testid={`row-customer-${i}`}><td className="font-semibold">{c.customer_name}</td><td>{c.phone}</td><td>{c.email || '-'}</td><td>{c.order_count}</td><td>{when(c.last_order_at)}</td></tr>)}</tbody></table></div>
        )}
      <Paging page={page} hasMore={q.hasMore} onPage={setPage} />
    </Card>
  );
}

/* ---------------- Settings ---------------- */
function SettingsForm({ initial }: { initial: Settings }) {
  const w = useCommerceWrite();
  const pm = usePanelMoney();
  const [f, setF] = useState<Settings>(initial);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setF(initial); }, [initial]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setSaved(false); setF((p) => ({ ...p, [k]: v })); };
  const save = async () => {
    if (!f.title.trim()) return setErr('Enter a store title.');
    setErr('');
    try { await w.save('settings', commerceSettingsPayload(f, pm.v2)); setSaved(true); } catch (e) { setErr(errText(e)); }
  };
  const mode = (label: string, k: 'email_mode' | 'address_mode') => (
    <Field label={label}><select className="input capitalize" value={f[k]} onChange={(e) => set(k, e.target.value as Mode)} data-testid={`select-${k}`}>{(['hidden', 'optional', 'required'] as Mode[]).map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
  );
  return (
    <Card className="space-y-3 p-3.5">
      <Banner error={err} />
      <div className="rounded-md border bg-background p-2.5 text-[12px]"><div className="mb-0.5 font-semibold">Public store address</div><PublicLink slug={initial.public_slug} /></div>
      <Toggle id="toggle-store-enabled" label="Store is open to customers" checked={f.enabled} onChange={(v) => set('enabled', v)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Store title"><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} data-testid="input-store-title" /></Field>
        pm.v2 ? <Field label="Currency" hint="Prices are stored in USD. Display currencies are managed under Currencies."><div className="input flex items-center gap-2" data-testid="text-currency-base"><b>USD</b><span className="badge">BASE / REFERENCE</span></div></Field> : <Field label="Currency" hint="Cannot be changed once products or orders exist."><select className="input" value={f.currency} onChange={(e) => set('currency', e.target.value)} data-testid="select-currency">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        {mode('Customer email', 'email_mode')}{mode('Customer address', 'address_mode')}
        <Field label="WhatsApp number"><input className="input" value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} data-testid="input-whatsapp" /></Field>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Toggle id="toggle-featured-first" label="Show featured products first" checked={f.featured_first} onChange={(v) => set('featured_first', v)} />
        <Toggle id="toggle-show-state" label="Ask for state" checked={f.show_state} onChange={(v) => set('show_state', v)} />
        <Toggle id="toggle-show-city" label="Ask for city" checked={f.show_city} onChange={(v) => set('show_city', v)} />
        <Toggle id="toggle-show-note" label="Ask for order note" checked={f.show_note} onChange={(v) => set('show_note', v)} />
      </div>
      <Field label="Order confirmation message"><textarea className="input" rows={3} value={f.confirmation_message} onChange={(e) => set('confirmation_message', e.target.value)} data-testid="input-confirmation" /></Field>
      <div className="flex items-center gap-3"><Btn v="primary" disabled={w.pending} onClick={() => void save()} data-testid="button-save-settings">{w.pending ? 'Saving...' : 'Save settings'}</Btn>{saved && <span className="text-[12px] text-ok" role="status" data-testid="text-settings-saved">Settings saved.</span>}</div>
    </Card>
  );
}
function SettingsSection() {
  const q = useCommerceList<Settings>('settings');
  if (q.isLoading) return <Card><Loading rows={6} /></Card>;
  if (q.isError || !q.rows) return <Card><Failure message={errText(q.error)} onRetry={() => void q.refetch()} /></Card>;
  return <SettingsForm initial={q.rows} />;
}

/* ---------------- Page ---------------- */
export default function EcommercePage() {
  const { active } = useWorkspacePage();
  const access = useCommerceAccess();
  const [section, setSection] = useState<Section>('Overview');
  useRefreshAccessOnFocus();
  const refetchAccess = access.refetch;
  useEffect(() => { if (active) void refetchAccess(); }, [active, refetchAccess]);

  const header = (
    <div className="mb-3"><h1 className="text-[18px] font-semibold" data-testid="text-page-title">E-Commerce</h1><p className="text-[12.5px] text-muted-foreground">Manage your online store: products, categories, orders, customers and settings.</p></div>
  );
  if (access.isLoading) return <div>{header}<Card><Loading rows={4} /></Card></div>;
  if (access.isError) return <div>{header}<Card><Failure message={errText(access.error)} onRetry={() => void access.refetch()} /></Card></div>;
  if (access.data?.enabled !== true) {
    return <div className="sl-surface mx-auto mt-6 max-w-md" data-testid="commerce-restricted"><EmptyState icon={<Lock size={18} />} title="E-Commerce is not enabled" description="This module is not active for your account. Contact BHRU support to have it enabled." action={<Btn onClick={() => void access.refetch()} data-testid="button-recheck-access">Check again</Btn>} /></div>;
  }
  return (
    <div className="space-y-3" data-testid="commerce-module">
      {header}
      <div role="tablist" aria-label="E-Commerce sections" className="scroll-thin flex gap-1 overflow-x-auto border-b">
        {SECTIONS.map((s) => (
          <button key={s} role="tab" aria-selected={section === s} onClick={() => setSection(s)} data-testid={`tab-commerce-${s.toLowerCase()}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[12.5px] font-medium ${section === s ? 'border-[hsl(var(--brand))] text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{s}</button>
        ))}
      </div>
      {section === 'Overview' && <OverviewSection go={setSection} />}
      {section === 'Products' && <ProductsSection />}
      {section === 'Categories' && <CategoriesSection />}
      {section === 'Orders' && <OrdersSection />}
      {section === 'Customers' && <CustomersSection />}
      {section === 'Settings' && <SettingsSection />}
    </div>
  );
}
