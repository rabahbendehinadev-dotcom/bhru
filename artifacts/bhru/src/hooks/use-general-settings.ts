import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeneralSettingsInput } from '@workspace/api-client-react';
import { loadGeneralSettings, persistGeneralSettings, errorMessage, useStore } from '@/lib/store';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';

const TEXT_FIELDS = {
  'company-name': 'company_name', 'site-name': 'site_name', 'logo-link': 'logo_url', 'favicon-icon': 'favicon_url',
  'site-link': 'site_link', 'site-ssl-link': 'site_ssl_link', 'title-format': 'page_title_format',
  desc: 'site_description', keywords: 'site_keywords', 'index-redirect': 'index_redirect', 'logout-redirect': 'logout_redirect',
  'min-add-fund': 'minimum_add_fund', 'max-add-fund': 'maximum_add_fund', 'max-balance': 'maximum_balance',
} as const satisfies Record<string, keyof GeneralSettingsInput>;
const MONEY = ['min-add-fund', 'max-add-fund', 'max-balance'] as const;
const moneyPattern = /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/;
const cents = (value: string) => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0')); };
type Notice = { kind: 'error' | 'info'; text: string } | null;

export function useGeneralSettings() {
  const { session } = useStore();
  const { active } = useWorkspacePage();
  const identity = session.role === 'subscriber' ? session.subscriberId : null;
  const [owner, setOwner] = useState<string | null>(null);
  const [values, setValues] = useState<GeneralSettingsInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice>(null);
  const generation = useRef(0);
  const status = useRef({ dirty, saving, active });
  status.current = { dirty, saving, active };
  const ready = !!identity && owner === identity && !!values;

  const reload = useCallback(async (signal?: AbortSignal, background = false) => {
    if (!identity) return;
    const version = generation.current;
    if (!background) { setLoading(true); setNotice(null); }
    try {
      const response = await loadGeneralSettings(signal);
      if (signal?.aborted || version !== generation.current) return;
      if (response.subscriber_id !== identity) throw new Error('Settings ownership did not match this account.');
      // Never overwrite edits made during a background request.
      if (background && (status.current.dirty || status.current.saving)) return;
      setOwner(identity); setValues(response.values); setDirty(false); setErrors({});
      if (!background) setNotice({ kind: 'info', text: 'Loaded saved settings.' });
    } catch (error) {
      if (!signal?.aborted && version === generation.current && !background) {
        setNotice({ kind: 'error', text: `Could not load settings. ${errorMessage(error)}` });
      }
    } finally {
      if (!background && !signal?.aborted && version === generation.current) setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    generation.current++;
    setOwner(null); setValues(null); setDirty(false); setSaving(false); setErrors({}); setNotice(null);
    if (!identity) {
      setLoading(false);
      setNotice({ kind: 'error', text: 'General Settings persistence is available only to subscriber accounts. Administrator preview is read-only.' });
      return;
    }
    const abort = new AbortController();
    void reload(abort.signal);
    return () => { abort.abort(); generation.current++; };
  }, [identity, reload, session.role]);

  // Refresh clean forms on focus/activation. Unsaved workspace drafts stay intact.
  useEffect(() => {
    if (!ready || !active) return;
    const abort = new AbortController();
    const refresh = () => {
      if (!status.current.dirty && !status.current.saving && !document.hidden) void reload(abort.signal, true);
    };
    refresh();
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(refresh, 60000);
    return () => { abort.abort(); window.removeEventListener('focus', refresh); window.clearInterval(interval); };
  }, [active, ready, reload]);

  const v = (key: string) => {
    if (!ready) return '';
    const field = TEXT_FIELDS[key as keyof typeof TEXT_FIELDS];
    return field ? String(values![field] ?? '') : '';
  };
  const edit = (field: keyof GeneralSettingsInput, value: string | boolean | null) => {
    if (!ready || saving) return;
    status.current.dirty = true;
    setValues(previous => previous ? { ...previous, [field]: value } : previous);
    setDirty(true); setNotice(null); setErrors({});
  };
  const set = (key: string) => (value: string) => {
    const field = TEXT_FIELDS[key as keyof typeof TEXT_FIELDS];
    if (field) edit(field, value);
  };
  const tog = (key: string) => {
    const field = (key === 'seo' ? 'seo_friendly_url' : key === 'add-fund' ? 'add_fund_enabled' :
      key === 'tax-add-fund' ? 'add_fund_tax_enabled' : key.replaceAll('-', '_')) as keyof GeneralSettingsInput;
    return { checked: ready && values![field] === true, onChange: (checked: boolean) => edit(field, checked) };
  };

  const save = async () => {
    if (!ready || saving || !values) return;
    const fieldErrors: Record<string, string> = {};
    const payload: GeneralSettingsInput = { ...values };
    for (const key of MONEY) {
      const value = v(key).trim();
      if (value && !moneyPattern.test(value)) fieldErrors[key] = 'Use a non-negative decimal with at most 16 whole digits and 2 decimal places.';
      payload[TEXT_FIELDS[key]] = value || null;
    }
    if (!fieldErrors['min-add-fund'] && !fieldErrors['max-add-fund'] &&
        payload.minimum_add_fund !== null && payload.maximum_add_fund !== null &&
        cents(payload.minimum_add_fund) > cents(payload.maximum_add_fund)) {
      fieldErrors['max-add-fund'] = 'Maximum must not be lower than the minimum';
    }
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) { setNotice({ kind: 'error', text: 'Settings were not saved. Correct the marked fund limits.' }); return; }
    const version = generation.current;
    status.current.saving = true;
    setSaving(true); setNotice(null);
    try {
      const response = await persistGeneralSettings(payload);
      if (version !== generation.current) return;
      if (response.subscriber_id !== identity) throw new Error('Settings ownership did not match this account.');
      setValues(response.values); setDirty(false);
      status.current.dirty = false;
      setNotice({ kind: 'info', text: 'General Settings saved successfully.' });
    } catch (error) {
      if (version === generation.current) {
        const fields = (error as { data?: { fields?: Record<string, string> } }).data?.fields;
        const details = fields ? Object.entries(fields).map(([field, message]) => `${field.replaceAll('_', ' ')}: ${message}`).join(' ') : '';
        setNotice({ kind: 'error', text: `Settings were not saved. ${errorMessage(error)} ${details} Your changes are still here.` });
      }
    } finally {
      if (version === generation.current) { status.current.saving = false; setSaving(false); }
    }
  };

  return { v, set, tog, errors, notice, loading, saving, ready, dirty, canRetry: !!identity, save, reload };
}
