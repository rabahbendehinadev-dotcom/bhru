import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCurrentPublicWebsite, updateCurrentPublicWebsite, previewCurrentPublicWebsite,
  uploadPublicWebsiteAsset, deleteUnusedPublicWebsiteAsset, getCurrentPublicPresentation,
  type PublicWebsiteConfiguration, type PublicWebsiteValues, type PublicPresentationValues, type PublicPresentationConfiguration,
} from '@workspace/api-client-react';
import { errorMessage, useStore } from '@/lib/store';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';

export type AssetKind = 'logo' | 'hero';
export type Notice = { kind: 'error' | 'success' | 'info'; text: string } | null;
const _requestOptions = (extra: { signal?: AbortSignal; headers?: Record<string, string> } = {}) => ({
  credentials: 'same-origin' as const, signal: extra.signal,
  headers: { 'X-BHRU-Request': '1', 'X-BHRU-Auth': 'subscriber', ...extra.headers },
});
const ASSET_FIELD = { logo: 'logo_asset_id', hero: 'hero_asset_id' } as const;
const MAX_BYTES = 5 * 1024 * 1024;
const LIMITS: Partial<Record<keyof PublicWebsiteValues, number>> = {
  display_name: 120, business_description: 500, hero_badge: 120, hero_title: 180, hero_description: 1000,
  primary_cta_label: 60, primary_cta_destination: 512, secondary_cta_label: 60, secondary_cta_destination: 512,
};

export function validDestination(v: string): boolean {
  if (!v) return true;
  if (/\s/.test(v)) return false;
  if (v.startsWith('#')) return true;
  if (/^(mailto|tel):./i.test(v)) return true;
  if (/^https:\/\//i.test(v)) {
    try { const u = new URL(v); return !u.username && !u.password && !!u.hostname; } catch { return false; }
  }
  return false;
}

export function validateValues(v: PublicWebsiteValues): Record<string, string> {
  const e: Record<string, string> = {};
  for (const [k, max] of Object.entries(LIMITS)) {
    if (((v as unknown as Record<string, string>)[k] ?? '').length > max!) e[k] = `Use at most ${max} characters.`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(v.primary_color)) e.primary_color = 'Use a 6-digit HEX colour such as #1A7F64.';
  for (const k of ['primary_cta_destination', 'secondary_cta_destination'] as const) {
    if (!validDestination(v[k])) e[k] = 'Use a #fragment, an https:// address without credentials or spaces, mailto: or tel:.';
  }
  return e;
}

export const MAX_LOGOS = 10, MAX_BARS = 8, MAX_BANNERS = 8, MAX_HTML = 4096;
export const validLink = (v: string) => validDestination(v) || /^\/[a-z0-9][a-z0-9-]*(#[^\s]*)?$/i.test(v);
const HEX = /^#[0-9a-fA-F]{6}$/;
export function validatePresentation(p: PublicPresentationValues): Record<string, string> {
  const e: Record<string, string> = {};
  const link = (k: string, v: string) => { if (v.length > 512) e[k] = 'Use at most 512 characters.'; else if (!validLink(v)) e[k] = 'Use #anchor, /page, https:// (no credentials), mailto: or tel:.'; };
  p.logos.forEach(l => { if (!l.asset_id) e[`${l.id}.image`] = 'Image required.'; if (l.label.length > 120) e[`${l.id}.label`] = 'Use at most 120 characters.'; link(`${l.id}.destination`, l.destination); });
  p.announcements.forEach(a => {
    if ((a.icon_text?.length ?? 0) > 32) e[`${a.id}.icon_text`] = 'Use at most 32 characters.';
    if (!a.text.trim()) e[`${a.id}.text`] = 'Text is required.'; else if (a.text.length > 500) e[`${a.id}.text`] = 'Use at most 500 characters.';
    if (!HEX.test(a.background_color)) e[`${a.id}.background_color`] = 'Use a 6-digit HEX colour.';
    if (!HEX.test(a.text_color)) e[`${a.id}.text_color`] = 'Use a 6-digit HEX colour.';
    link(`${a.id}.destination`, a.destination);
  });
  p.banners.forEach(b => { if (!b.asset_id) e[`${b.id}.image`] = 'Image required.'; if (b.alt_text.length > 180) e[`${b.id}.alt_text`] = 'Use at most 180 characters.'; link(`${b.id}.destination`, b.destination); });
  if (p.custom_html.length > MAX_HTML) e.custom_html = `Use at most ${MAX_HTML} characters.`;
  if (p.logos.length > MAX_LOGOS) e.limits = 'A maximum of 10 partner logos is supported. Replace or delete a logo before adding another.';
  else if (p.announcements.length > MAX_BARS || p.banners.length > MAX_BANNERS) e.limits = 'An item limit was exceeded.';
  return e;
}
const assetRefs = (v: PublicWebsiteValues | null, p: PublicPresentationValues | null) => {
  const r = new Set<string>();
  if (v) { if (v.logo_asset_id) r.add(v.logo_asset_id); if (v.hero_asset_id) r.add(v.hero_asset_id); }
  if (p) { p.logos.forEach(x => r.add(x.asset_id)); p.banners.forEach(x => r.add(x.asset_id)); }
  return r;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const fieldErrors = (error: unknown): Record<string, string> => {
  const d = (error as { data?: { fields?: Record<string, string> } } | null)?.data?.fields;
  return d && typeof d === 'object' ? d : {};
};

export function usePublicWebsite() {
  const { session } = useStore();
  const { active } = useWorkspacePage();
  const identity = session.role === 'subscriber' ? session.subscriberId : null;
  const [config, setConfig] = useState<PublicWebsiteConfiguration | null>(null);
  const [draft, setDraft] = useState<PublicWebsiteValues | null>(null);
  const [urls, setUrls] = useState<Record<AssetKind, string | null>>({ logo: null, hero: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<AssetKind, boolean>>({ logo: false, hero: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [assetErrors, setAssetErrors] = useState<Record<AssetKind, string>>({ logo: '', hero: '' });
  const [notice, setNotice] = useState<Notice>(null);
  const [preview, setPreview] = useState<{ html: string | null; stale: boolean; error: string | null; loading: boolean }>({ html: null, stale: false, error: null, loading: false });
  const [pConfig, setPConfig] = useState<PublicPresentationConfiguration | null>(null);
  const [pDraft, setPDraft] = useState<PublicPresentationValues | null>(null);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [itemUploading, setItemUploading] = useState(false);
  const [presErrors, setPresErrors] = useState<Record<string, string>>({});
  const [itemError, setItemError] = useState('');
  const pDraftRef = useRef<PublicPresentationValues | null>(null); pDraftRef.current = pDraft;
  const generation = useRef(0);
  const uploaded = useRef(new Set<string>());
  const busy = useRef({ saving: false, uploading: { logo: false, hero: false } });
  const itemBusy = useRef(false);
  const draftRef = useRef(draft); draftRef.current = draft;
  const configRef = useRef(config); configRef.current = config;
  const ready = !!identity && !!config && !!draft && !!pConfig && !!pDraft;
  const dirty = ready && (!same(draft!, config!.values) || !same(pDraft!, pConfig!.values));
  const anyUploading = uploading.logo || uploading.hero || itemUploading;

  const cleanup = useCallback((keep: PublicWebsiteValues | null, keepP: PublicPresentationValues | null = null) => {
    const refs = assetRefs(keep, keepP);
    for (const id of Array.from(uploaded.current)) {
      if (refs.has(id)) continue;
      uploaded.current.delete(id);
      void deleteUnusedPublicWebsiteAsset(id, _requestOptions()).catch(() => undefined);
    }
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!identity) return;
    const version = generation.current;
    setLoading(true); setNotice(null);
    try {
      const r = await getCurrentPublicWebsite(_requestOptions({ signal }));
      if (signal?.aborted || version !== generation.current) return;
      const pc = r.presentation ?? await getCurrentPublicPresentation(_requestOptions({ signal }));
      if (signal?.aborted || version !== generation.current) return;
      setConfig(r); setDraft(r.values); setUrls({ logo: r.logo_url, hero: r.hero_image_url }); setErrors({});
      setPConfig(pc); setPDraft(pc.values); setAssetUrls(pc.asset_urls ?? {}); setPresErrors({}); setItemError('');
    } catch (error) {
      if (!signal?.aborted && version === generation.current) setNotice({ kind: 'error', text: `Could not load your public website. ${errorMessage(error)}` });
    } finally {
      if (!signal?.aborted && version === generation.current) setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    generation.current++;
    cleanup(null);
    setConfig(null); setDraft(null); setPConfig(null); setPDraft(null); setAssetUrls({}); setPresErrors({}); setItemError(''); setItemUploading(false); setSaving(false); setErrors({}); setNotice(null);
    setUploading({ logo: false, hero: false }); setUrls({ logo: null, hero: null });
    setPreview({ html: null, stale: false, error: null, loading: false });
    busy.current = { saving: false, uploading: { logo: false, hero: false } }; itemBusy.current = false;
    if (!identity) {
      setLoading(false);
      setNotice({ kind: 'error', text: 'Public website management is available only to subscriber accounts.' });
      return;
    }
    const abort = new AbortController();
    void load(abort.signal);
    return () => { abort.abort(); generation.current++; };
  }, [identity, load, cleanup]);

  const edit = <K extends keyof PublicWebsiteValues>(key: K, value: PublicWebsiteValues[K]) => {
    if (!ready || busy.current.saving) return;
    { const n = { ...draftRef.current!, [key]: value }; draftRef.current = n; setDraft(n); }
    setPreview(p => p.html ? { ...p, stale: true } : p);
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
    setNotice(null);
  };

  // Debounced server-rendered preview of the draft, from the frozen template.
  const previewKey = ready && active ? JSON.stringify({ v: draft, p: pDraft }) : null;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active || !ready) return;
    const t = window.setInterval(() => setTick(n => n + 1), 8 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [active, ready]);
  useEffect(() => {
    if (!previewKey) return;
    const parsed = JSON.parse(previewKey) as { v: PublicWebsiteValues; p: PublicPresentationValues };
    const values = parsed.v;
    const version = generation.current;
    const abort = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreview(p => ({ ...p, loading: true }));
      try {
        const r = await previewCurrentPublicWebsite({ values, presentation: parsed.p }, _requestOptions({ signal: abort.signal }));
        if (abort.signal.aborted || version !== generation.current) return;
        setPreview({ html: r.html, stale: false, error: null, loading: false });
        // Refresh field-preview URLs only if the draft is still exactly the one previewed.
        if (r.asset_urls) setAssetUrls(p => ({ ...p, ...r.asset_urls }));
        if (JSON.stringify({ v: draftRef.current, p: pDraftRef.current }) === previewKey) {
          const res = r as { logo_url?: string | null; hero_image_url?: string | null };
          setUrls(p => ({
            logo: values.logo_asset_id ? (res.logo_url ?? p.logo) : null,
            hero: values.hero_asset_id ? (res.hero_image_url ?? p.hero) : null,
          }));
        }
      } catch (error) {
        if (abort.signal.aborted || version !== generation.current) return;
        const f = Object.entries(fieldErrors(error)).map(([k, m]) => `${k.replaceAll('_', ' ')}: ${m}`).join(' ');
        setPreview(p => ({ html: p.html, stale: !!p.html, error: `${errorMessage(error)} ${f}`.trim(), loading: false }));
      }
    }, 600);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [previewKey, tick]);

  const anyBusy = () => itemBusy.current || busy.current.uploading.logo || busy.current.uploading.hero;
  const upload = async (kind: AssetKind, file: File) => {
    if (!ready || busy.current.saving || anyBusy()) return;
    const setErr = (m: string) => setAssetErrors(p => ({ ...p, [kind]: m }));
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') { setErr('Only PNG or JPEG images are accepted.'); return; }
    if (file.size > MAX_BYTES) { setErr('The image is larger than 5 MB.'); return; }
    if (file.size === 0) { setErr('The image file is empty.'); return; }
    setErr(''); setNotice(null);
    const version = generation.current;
    busy.current.uploading[kind] = true; setUploading(p => ({ ...p, [kind]: true }));
    try {
      const r = await uploadPublicWebsiteAsset(file, _requestOptions({ headers: { 'Content-Type': file.type } }));
      if (version !== generation.current) { void deleteUnusedPublicWebsiteAsset(r.id, _requestOptions()).catch(() => undefined); return; }
      const field = ASSET_FIELD[kind];
      uploaded.current.add(r.id);
      const next = { ...draftRef.current!, [field]: r.id };
      draftRef.current = next; setDraft(next);
      setUrls(p => ({ ...p, [kind]: r.url }));
      cleanup(next, pDraftRef.current);
    } catch (error) {
      if (version === generation.current) setErr(`Upload failed. ${errorMessage(error)}`);
    } finally {
      if (version === generation.current) { busy.current.uploading[kind] = false; setUploading(p => ({ ...p, [kind]: false })); }
    }
  };

  const removeAsset = (kind: AssetKind) => {
    if (!ready || busy.current.saving || anyBusy()) return;
    const field = ASSET_FIELD[kind];
    const next = { ...draftRef.current!, [field]: null };
    draftRef.current = next; setDraft(next);
    setUrls(p => ({ ...p, [kind]: null }));
    setAssetErrors(p => ({ ...p, [kind]: '' })); setNotice(null);
    cleanup(next, pDraftRef.current);
  };

  const presEdit = (fn: (p: PublicPresentationValues) => PublicPresentationValues) => {
    if (!ready || busy.current.saving) return;
    const next = fn(pDraftRef.current!);
    pDraftRef.current = next; setPDraft(next); setPreview(p => p.html ? { ...p, stale: true } : p); setPresErrors({}); setNotice(null);
  };
  // Upload an item image; resolves to the new asset id (staged, unreferenced until the caller adds it) or null.
  const uploadItem = async (file: File, usage: 'logo' | 'banner' = 'logo'): Promise<string | null> => {
    if (!ready || busy.current.saving || anyBusy()) return null;
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') { setItemError('Only PNG or JPEG images are accepted.'); return null; }
    if (file.size > MAX_BYTES) { setItemError('The image is larger than 5 MB.'); return null; }
    if (file.size === 0) { setItemError('The image file is empty.'); return null; }
    setItemError(''); setNotice(null);
    const version = generation.current;
    itemBusy.current = true; setItemUploading(true);
    try {
      const r = await uploadPublicWebsiteAsset(file, _requestOptions({ headers: { 'Content-Type': file.type, 'X-BHRU-Image-Usage': usage } }));
      if (version !== generation.current) { void deleteUnusedPublicWebsiteAsset(r.id, _requestOptions()).catch(() => undefined); return null; }
      uploaded.current.add(r.id);
      setAssetUrls(p => ({ ...p, [r.id]: r.url }));
      return r.id;
    } catch (error) {
      if (version === generation.current) setItemError(`Upload failed. ${errorMessage(error)}`);
      return null;
    } finally {
      if (version === generation.current) { itemBusy.current = false; setItemUploading(false); }
    }
  };
  // Delete staged (unsaved) uploads no longer referenced anywhere; saved media waits for Save.
  const sweep = () => cleanup(draftRef.current, pDraftRef.current);

  const save = async () => {
    if (!ready || busy.current.saving || !draft || !config || !pDraft || !pConfig || anyBusy()) return;
    const local = validateValues(draft);
    const pl = validatePresentation(pDraft);
    setErrors(local); setPresErrors(pl);
    if (Object.keys(local).length || Object.keys(pl).length) { setNotice({ kind: 'error', text: 'Nothing was saved. Correct the marked fields.' }); return; }
    const version = generation.current;
    busy.current.saving = true; setSaving(true); setNotice(null);
    try {
      const r = await updateCurrentPublicWebsite({ values: draft, revision: config.revision, presentation: pDraft, presentation_revision: pConfig.revision }, _requestOptions());
      if (version !== generation.current) return;
      setConfig(r); setDraft(r.values); setUrls(p => ({ logo: r.logo_url ?? (r.values.logo_asset_id ? p.logo : null), hero: r.hero_image_url ?? (r.values.hero_asset_id ? p.hero : null) }));
      let pc = r.presentation;
      if (!pc) { try { pc = await getCurrentPublicPresentation(_requestOptions()); } catch { pc = undefined; } }
      if (version !== generation.current) return;
      if (pc) { setPConfig(pc); setPDraft(pc.values); setAssetUrls(p => ({ ...p, ...pc!.asset_urls })); }
      const keepP = pc?.values ?? pDraft;
      cleanup(r.values, keepP);
      // These images are now persisted, not staged uploads to delete on a draft edit.
      assetRefs(r.values,keepP).forEach(id=>uploaded.current.delete(id));
      setPresErrors({});
      setNotice({ kind: 'success', text: 'Public website saved.' });
    } catch (error) {
      if (version !== generation.current) return;
      const status = (error as { status?: number }).status;
      const f = fieldErrors(error);
      setErrors(f); setPresErrors(f);
      if (status === 409) setNotice({ kind: 'error', text: 'Not saved: this website was changed elsewhere (revision conflict). Reset to load the latest saved version, then re-apply your edits.' });
      else setNotice({ kind: 'error', text: `Not saved. ${errorMessage(error)} Your changes are still here.` });
    } finally {
      if (version === generation.current) { busy.current.saving = false; setSaving(false); }
    }
  };

  const reset = async () => {
    if (!ready || busy.current.saving || !config) return;
    const cfg = config;
    if (anyBusy()) return;
    cleanup(cfg.values, pConfig?.values ?? null);
    if (pConfig) setPDraft(pConfig.values);
    setPresErrors({}); setItemError('');
    setDraft(cfg.values); setUrls({ logo: cfg.logo_url, hero: cfg.hero_image_url });
    setErrors({}); setAssetErrors({ logo: '', hero: '' });
    setNotice({ kind: 'info', text: 'Unsaved changes were discarded.' });
    // A conflict means the stored revision is stale: refetch the saved version.
    if (notice?.text.includes('revision conflict')) {
      const version = generation.current;
      try {
        const r = await getCurrentPublicWebsite(_requestOptions());
        if (version !== generation.current) return;
        const pc = r.presentation ?? await getCurrentPublicPresentation(_requestOptions());
        if (version !== generation.current) return;
        setConfig(r); setDraft(r.values); setUrls({ logo: r.logo_url, hero: r.hero_image_url });
        setPConfig(pc); setPDraft(pc.values); setAssetUrls(pc.asset_urls ?? {});
        setNotice({ kind: 'info', text: 'Loaded the latest saved version.' });
      } catch (error) {
        if (version === generation.current) setNotice({ kind: 'error', text: `Could not reload. ${errorMessage(error)}` });
      }
    }
  };

  return {
    config, draft, pres: pDraft, presErrors, assetUrls, itemError, itemUploading, presEdit, uploadItem, sweep, urls, loading, saving, uploading, anyUploading, errors, assetErrors, notice, preview, ready, dirty,
    canRetry: !!identity, edit, upload, removeAsset, save, reset, reload: () => void load(),
  };
}
