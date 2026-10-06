import { useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, ImagePlus, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import type { PublicAnnouncement, PublicBanner, PublicPartnerLogo, PublicPresentationValues } from '@workspace/api-client-react';
import { SettingsRow, SettingToggle } from '@/components/subscriber/general-settings/settings-ui';
import { MAX_BANNERS, MAX_BARS, MAX_HTML, MAX_LOGOS, usePublicWebsite } from '@/hooks/use-public-website';
import { TickerControls, TickerColours, defaultStrip, defaultTicker } from './TickerControls';
import { PartnerImageControls } from './PartnerImageControls';

type W = ReturnType<typeof usePublicWebsite>;
const err = (m?: string) => m ? <p className="gs-err" role="alert">{m}</p> : null;
const swap = <T,>(a: T[], i: number, d: number) => { const n = [...a]; const j = i + d; if (j < 0 || j >= n.length) return a; [n[i], n[j]] = [n[j], n[i]]; return n; };

export function CollapsibleCard({ id, title, description, defaultOpen = false, children }: { id: string; title: string; description: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="gs-section" data-testid={`section-${id}`}>
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open} aria-controls={`card-${id}`} onClick={() => setOpen(o => !o)} data-testid={`button-toggle-${id}`}>
        <span><h2>{title}</h2><span className="gs-help block">{description}</span></span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      <div id={`card-${id}`} hidden={!open} className="mt-3">{children}</div>
    </section>
  );
}

function Thumb({ url, alt }: { url?: string; alt: string }) {
  return <div className="flex h-14 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[hsl(var(--border))]">
    {url ? <img src={url} alt={alt} className="max-h-full max-w-full object-contain" /> : <span className="gs-help px-1 text-center">No preview</span>}</div>;
}

function FilePick({ w, label, onId, icon, usage = 'logo', className = '', touchFriendly = false, disabled = false }: { w: W; label: string; onId: (id: string) => void; icon?: 'add' | 'replace'; usage?: 'logo' | 'banner'; className?: string; touchFriendly?: boolean; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return <>
    <input ref={ref} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`${label} file`}
      onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const id = await w.uploadItem(f, usage); if (id) onId(id); }} />
    <button type="button" className={`btn btn-sm ${className}`} style={touchFriendly ? { height: 44, minHeight: 44 } : undefined} disabled={disabled || w.itemUploading || w.saving} onClick={() => ref.current?.click()} data-testid={`button-${label.toLowerCase().replace(/\W+/g, '-')}`}>
      {icon === 'replace' ? <Upload size={13} /> : <ImagePlus size={13} />}{w.itemUploading ? 'Uploading…' : label}</button>
  </>;
}

function Actions({ i, n, enabled, onToggle, onEdit, onMove, onDelete, name, editing }: { i: number; n: number; enabled: boolean; onToggle: (v: boolean) => void; onEdit: () => void; onMove: (d: number) => void; onDelete: () => void; name: string; editing: boolean }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="gs-help m-0">{enabled ? 'Enabled' : 'Disabled'}</span>
      <SettingToggle id={`sw-${name}`} label={`Enable ${name}`} checked={enabled} onChange={onToggle} />
      <button type="button" className="btn btn-sm" aria-expanded={editing} onClick={onEdit} data-testid={`button-edit-${name}`}><Pencil size={13} />Edit</button>
      <button type="button" className="btn btn-sm" disabled={i === 0} aria-label="Move up" onClick={() => onMove(-1)} data-testid={`button-up-${name}`}><ChevronUp size={13} /></button>
      <button type="button" className="btn btn-sm" disabled={i === n - 1} aria-label="Move down" onClick={() => onMove(1)} data-testid={`button-down-${name}`}><ChevronDown size={13} /></button>
      {confirm ? (
        <span className="flex items-center gap-1.5" role="alertdialog" aria-label="Confirm delete">
          <span className="gs-help m-0">Delete this item?</span>
          <button type="button" className="btn btn-sm" onClick={() => { setConfirm(false); onDelete(); }} data-testid={`button-confirm-delete-${name}`}>Yes, delete</button>
          <button type="button" className="btn btn-sm" onClick={() => setConfirm(false)}>Cancel</button>
        </span>
      ) : <button type="button" className="btn btn-sm" onClick={() => setConfirm(true)} data-testid={`button-delete-${name}`}><Trash2 size={13} />Delete</button>}
    </div>
  );
}

const Empty = ({ text, hint }: { text: string; hint: string }) => (
  <div className="rounded-md border border-dashed border-[hsl(var(--border))] p-5 text-center" data-testid="empty-state"><p className="text-[13px] font-semibold">{text}</p><p className="gs-help">{hint}</p></div>
);
const Check = ({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={id} />{label}</label>
);
const Field = ({ label, error, children }: { label: string; error?: string; children: ReactNode }) => (
  <label className="block space-y-1"><span className="gs-label">{label}</span>{children}{err(error)}</label>
);

export function PresentationEditor({ w, classic }: { w: W; classic?: ReactNode }) {
  const p = w.pres;
  const [editing, setEditing] = useState<string | null>(null);
  if (!p) return null;
  const E = w.presErrors;
  const strip = p.logo_strip_settings ?? defaultStrip;
  const set = (patch: Partial<PublicPresentationValues>) => w.presEdit(v => ({ ...v, ...patch }));
  const url = (id: string) => w.assetUrls[id];
  const toggleEdit = (id: string) => setEditing(e => e === id ? null : id);
  const patch = <T extends { id: string }>(list: T[], id: string, x: Partial<T>) => list.map(i => i.id === id ? { ...i, ...x } : i);
  const after = () => w.sweep();
  const enabledBanners = p.banners.filter(b => b.enabled).length;

  return (
    <>
      <CollapsibleCard id="top-area" title="Top Area" description="Partner images and announcements above your header. No HTML needed." defaultOpen>
        <div className="space-y-5">
          {w.itemError && <p className="gs-err" role="alert" data-testid="text-item-error">{w.itemError}</p>}
          {err(E.limits)}
          <div className="min-w-0 space-y-3" data-testid="group-logos">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-[13px] font-semibold">1. Partner / Image Strip</h3><p className="gs-help">Show uploaded partner or tool images. {p.logos.length}/{MAX_LOGOS} used.</p></div>
              <SettingToggle id="sw-logo-strip" label="Logo strip" checked={p.logo_strip_enabled} onChange={(v) => set({ logo_strip_enabled: v })} />
            </div>
            <div className="min-w-0">
              <FilePick w={w} label="Upload Image / Add Image" className="btn-brand w-full sm:w-auto" touchFriendly disabled={p.logos.length >= MAX_LOGOS}
                onId={(id) => { const l: PublicPartnerLogo = { id: crypto.randomUUID(), asset_id: id, label: '', destination: '', new_tab: true, enabled: true }; w.presEdit(v => ({ ...v, logos: [...v.logos, l] })); setEditing(l.id); }} />
              <p className="gs-help">{p.logos.length >= MAX_LOGOS ? 'Image limit reached. Replace or delete an image to add another.' : 'Upload a PNG or JPEG directly here. No Custom HTML needed.'}</p>
            </div>
            <TickerControls id="image-strip" image settings={strip} onChange={value => set({ logo_strip_settings: value })} />
            {p.logos.length === 0 ? <Empty text="No logos added yet." hint="Upload a PNG or JPEG to start your partner strip." /> :
              p.logos.map((l, i) => (
                <div key={l.id} className="min-w-0 space-y-3 rounded-md border border-[hsl(var(--border))] p-2.5" data-testid={`card-logo-${i}`}>
                  <div className="flex min-w-0 items-center gap-3"><Thumb url={url(l.asset_id)} alt={l.label || `Partner image ${i + 1}`} />
                    <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-medium">{l.label || `Image ${i + 1}`}</p>
                      <p className="gs-help">{l.enabled ? 'Enabled' : 'Disabled'}</p></div></div>
                  <PartnerImageControls index={i} count={p.logos.length} enabled={l.enabled} editing={editing === l.id} onEdit={() => toggleEdit(l.id)}
                    replace={<FilePick w={w} label="Replace" icon="replace" className="w-full" touchFriendly onId={(id) => {
                      w.presEdit(v => ({ ...v, logos: patch(v.logos, l.id, { asset_id: id }) })); after();
                    }} />}
                    onToggle={() => set({ logos: patch(p.logos, l.id, { enabled: !l.enabled }) })} onMove={(d) => set({ logos: swap(p.logos, i, d) })}
                    onDelete={() => { set({ logos: p.logos.filter(x => x.id !== l.id) }); after(); }} />
                  {err(E[`${l.id}.image`])}
                  {editing === l.id && <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    <Field label="Label (optional)" error={E[`${l.id}.label`]}><input className="input" value={l.label} onChange={(e) => set({ logos: patch(p.logos, l.id, { label: e.target.value }) })} data-testid={`input-logo-label-${i}`} /></Field>
                    <Field label="Link (optional)" error={E[`${l.id}.destination`]}><input className="input" value={l.destination} placeholder="https://… or /page" onChange={(e) => set({ logos: patch(p.logos, l.id, { destination: e.target.value }) })} data-testid={`input-logo-link-${i}`} /></Field>
                    <Check id={`check-logo-newtab-${i}`} label="Open link in a new tab" checked={l.new_tab} onChange={(v) => set({ logos: patch(p.logos, l.id, { new_tab: v }) })} />
                  </div>}
                </div>))}
          </div>

          <div className="min-w-0 space-y-3" data-testid="group-announcements">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-[13px] font-semibold">2. Announcement Ticker</h3><p className="gs-help">Each enabled message appears in its own full-width bar. {p.announcements.length}/{MAX_BARS} used.</p></div>
              <SettingToggle id="sw-announcements" label="Announcements" checked={p.announcements_enabled} onChange={(v) => set({ announcements_enabled: v })} />
            </div>
            <button type="button" className="btn btn-brand w-full sm:w-auto" style={{ height: 44, minHeight: 44 }} disabled={p.announcements.length >= MAX_BARS}
              data-testid="button-add-announcement" onClick={() => {
                const a: PublicAnnouncement = { id: crypto.randomUUID(), enabled: true, text: '', icon_text: '', destination: '', background_color: defaultTicker.background_color, text_color: defaultTicker.text_color, movement: 'static', direction: 'left', speed: 'normal' };
                w.presEdit(v => ({ ...v, announcements: [...v.announcements, a] })); setEditing(a.id);
              }}><Plus size={16} />Add Message</button>
            {p.announcements.length >= MAX_BARS && <p className="gs-help">Message limit reached. Edit or delete an existing announcement.</p>}
            {p.announcements.length === 0 ? <Empty text="No messages yet." hint="Add a message for offers, notices or opening hours." /> :
              p.announcements.map((a, i) => {
                const settings = { ...defaultTicker, display: a.movement === 'scrolling' ? 'moving' as const : 'static' as const, speed: a.speed, direction: a.direction, pause_on_hover: false, background_color: a.background_color, text_color: a.text_color };
                return (
                <div key={a.id} className="min-w-0 space-y-3 rounded-md border border-[hsl(var(--border))] p-3" data-testid={`card-announcement-${i}`}>
                  <h4 className="text-[13px] font-semibold">Announcement {i + 1}</h4>
                  <p dir="auto" className="truncate rounded-md px-3 py-2 text-center text-[13px] font-semibold" style={{ background: a.background_color, color: a.text_color }}>{a.icon_text} {a.text || 'No text yet'}</p>
                      <Actions name={`announcement-${i}`} i={i} n={p.announcements.length} enabled={a.enabled} editing={editing === a.id} onEdit={() => toggleEdit(a.id)}
                        onToggle={(v) => set({ announcements: patch(p.announcements, a.id, { enabled: v }) })} onMove={(d) => set({ announcements: swap(p.announcements, i, d) })}
                        onDelete={() => set({ announcements: p.announcements.filter(x => x.id !== a.id) })} />
                  {editing === a.id && <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2"><Field label="Message text (emoji allowed)" error={E[`${a.id}.text`]}><textarea className="input" dir="auto" rows={2} value={a.text} onChange={(e) => set({ announcements: patch(p.announcements, a.id, { text: e.target.value }) })} data-testid={`input-bar-text-${i}`} /></Field><p className="gs-help">{a.text.length}/500</p></div>
                    <div className="sm:col-span-2"><TickerControls id={`announcement-${a.id}`} settings={settings} showPauseOnHover={false}
                      onChange={value => set({ announcements: patch(p.announcements, a.id, { movement: value.display === 'moving' ? 'scrolling' : 'static', speed: value.speed, direction: value.direction }) })} /></div>
                    <div className="sm:col-span-2"><TickerColours settings={settings} errors={E} errorPrefix={a.id} showSeparator={false}
                      onChange={value => set({ announcements: patch(p.announcements, a.id, { background_color: value.background_color, text_color: value.text_color }) })} /></div>
                    <Field label="Link (optional)" error={E[`${a.id}.destination`]}><input className="input" value={a.destination} placeholder="https://… or /page" onChange={(e) => set({ announcements: patch(p.announcements, a.id, { destination: e.target.value }) })} data-testid={`input-bar-link-${i}`} /></Field>
                  </div>}
                </div>);})}
          </div>

          <details className="rounded-md border border-[hsl(var(--border))] p-2.5" data-testid="details-advanced-html">
             <summary className="cursor-pointer text-[13px] font-semibold">3. Advanced Custom HTML (optional)</summary>
            <div className="mt-2 space-y-2">
              <p className="gs-help">Most people can skip this. Only simple paragraphs, headings, bold/italic, lists and links are kept. Styles, images, forms, frames and scripts are removed for safety.</p>
              <div className="flex items-center gap-2"><SettingToggle id="sw-custom-html" label="Custom HTML" checked={p.custom_html_enabled} onChange={(v) => set({ custom_html_enabled: v })} /></div>
              <SettingsRow id="custom-html" label="HTML" error={E.custom_html} help={`${p.custom_html.length}/${MAX_HTML} characters`}>
                <textarea id="custom-html" className="input font-mono" rows={5} value={p.custom_html} onChange={(e) => set({ custom_html: e.target.value })} data-testid="textarea-custom-html" />
              </SettingsRow>
            </div>
          </details>
        </div>
      </CollapsibleCard>

      <CollapsibleCard id="hero-banner" title="Hero / Banner" description="Choose a classic hero or a banner slider.">
        <div className="space-y-3">
          <div role="radiogroup" aria-label="Hero display mode" className="grid gap-3 sm:grid-cols-2">
            {(['classic', 'banner'] as const).map(m => (
              <label key={m} className="cursor-pointer">
                <input type="radio" name="hero-display-mode" value={m} checked={p.hero_mode === m}
                  onChange={() => set({ hero_mode: m })} className="peer sr-only" data-testid={`button-hero-mode-${m}`} />
                <div className={`flex min-h-[76px] items-center justify-between gap-3 rounded-lg border-2 p-3 text-left peer-focus-visible:ring-2 peer-focus-visible:ring-[hsl(var(--ring))] peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-60 ${p.hero_mode === m ? 'border-[hsl(var(--brand))] bg-[hsl(var(--brand)/.08)]' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--brand)/.5)]'}`}>
                  <span>
                    <span className="block text-[13px] font-semibold">{m === 'classic' ? 'Classic Hero' : 'Banner Slider'}</span>
                    <span className="gs-help block">{m === 'classic' ? 'Text + image' : 'Full-width banners'}</span>
                  </span>
                  <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${p.hero_mode === m ? 'border-[hsl(var(--brand))]' : 'border-[hsl(var(--border))]'}`}>
                    {p.hero_mode === m && <span className="h-2 w-2 rounded-full bg-[hsl(var(--brand))]" />}
                  </span>
                </div>
              </label>
            ))}
          </div>
          {p.hero_mode === 'classic' && classic && <div data-testid="group-classic-hero"><h3 className="text-[13px] font-semibold">Classic hero content</h3>{classic}</div>}
          {p.hero_mode === 'banner' && <>
            {enabledBanners === 0 && <p className="gs-help" role="status" style={{ color: 'hsl(var(--danger))' }} data-testid="text-banner-warning">No banner is enabled, so your website will show the Classic Hero instead.</p>}
            {enabledBanners === 1 && <p className="gs-help">One enabled banner is shown as a static image.</p>}
            {enabledBanners >= 2 && <p className="gs-help">{enabledBanners} enabled banners are shown as a slider.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Check id="check-slider-autoplay" label="Autoplay slider" checked={p.slider_autoplay} onChange={(v) => set({ slider_autoplay: v })} />
              <label className="flex items-center gap-2 text-[13px]">Change every
                <select className="input w-auto" value={p.slider_interval} onChange={(e) => set({ slider_interval: Number(e.target.value) as PublicPresentationValues['slider_interval'] })} data-testid="select-slider-interval">
                  {[3, 5, 7, 10].map(s => <option key={s} value={s}>{s} seconds</option>)}</select></label>
            </div>
            <div className="flex items-center justify-between"><p className="gs-help">{p.banners.length}/{MAX_BANNERS} banners.</p>
              {p.banners.length < MAX_BANNERS && <FilePick w={w} label="Add banner" usage="banner" onId={(id) => { const b: PublicBanner = { id: crypto.randomUUID(), asset_id: id, alt_text: '', destination: '', enabled: true }; w.presEdit(v => ({ ...v, banners: [...v.banners, b] })); setEditing(b.id); }} />}</div>
            {p.banners.length === 0 ? <Empty text="No banners added yet." hint="Upload a wide PNG or JPEG image." /> :
              p.banners.map((b, i) => (
                <div key={b.id} className="space-y-2 rounded-md border border-[hsl(var(--border))] p-2.5" data-testid={`card-banner-${i}`}>
                  <div className="flex flex-wrap items-center gap-3"><Thumb url={url(b.asset_id)} alt={b.alt_text || 'Banner'} />
                    <div className="min-w-0 flex-1 space-y-1.5"><p className="truncate text-[13px] font-medium">{b.alt_text || `Banner ${i + 1}`}</p>
                      <Actions name={`banner-${i}`} i={i} n={p.banners.length} enabled={b.enabled} editing={editing === b.id} onEdit={() => toggleEdit(b.id)}
                        onToggle={(v) => set({ banners: patch(p.banners, b.id, { enabled: v }) })} onMove={(d) => set({ banners: swap(p.banners, i, d) })}
                        onDelete={() => { set({ banners: p.banners.filter(x => x.id !== b.id) }); after(); }} /></div></div>
                  {editing === b.id && <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Description for accessibility" error={E[`${b.id}.alt_text`]}><input className="input" value={b.alt_text} onChange={(e) => set({ banners: patch(p.banners, b.id, { alt_text: e.target.value }) })} data-testid={`input-banner-alt-${i}`} /></Field>
                    <Field label="Link (optional)" error={E[`${b.id}.destination`]}><input className="input" value={b.destination} placeholder="https://… or /page" onChange={(e) => set({ banners: patch(p.banners, b.id, { destination: e.target.value }) })} data-testid={`input-banner-link-${i}`} /></Field>
                    <div><FilePick w={w} label="Replace image" icon="replace" usage="banner" onId={(id) => { set({ banners: patch(p.banners, b.id, { asset_id: id }) }); after(); }} />{err(E[`${b.id}.image`])}</div>
                  </div>}
                </div>))}
          </>}
        </div>
      </CollapsibleCard>
    </>
  );
}
