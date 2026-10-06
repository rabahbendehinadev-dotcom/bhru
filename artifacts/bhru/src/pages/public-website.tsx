import { ExternalLink, RotateCcw, Save } from 'lucide-react';
import { usePublicWebsite } from '@/hooks/use-public-website';
import { SettingsSection, SettingsRow, SettingInput, SettingTextarea } from '@/components/subscriber/general-settings/settings-ui';
import { ImageField } from '@/components/subscriber/public-website/ImageField';
import { PublicWebsitePreview } from '@/components/subscriber/public-website/PublicWebsitePreview';

export default function PublicWebsitePage() {
  const w = usePublicWebsite();
  const { draft, config, errors } = w;
  const locked = !w.ready || w.loading || w.saving;
  const openUrl = config ? (import.meta.env.DEV ? config.preview_url : config.public_url) : '';
  const tone = w.notice?.kind === 'error' ? 'hsl(var(--danger))' : 'hsl(var(--muted-foreground))';

  const text = (key: 'display_name' | 'hero_badge' | 'hero_title' | 'primary_cta_label' | 'primary_cta_destination' | 'secondary_cta_label' | 'secondary_cta_destination', id: string, label: string, help?: string) => (
    <SettingsRow id={id} label={label} error={errors[key]} help={help ?? (draft && config && !draft[key] ? `Blank uses the default: ${config.defaults[key] || 'none'}` : undefined)}>
      <SettingInput id={id} value={draft?.[key] ?? ''} onChange={(v) => w.edit(key, v)} invalid={!!errors[key]} />
    </SettingsRow>
  );

  return (
    <div className="space-y-3 min-w-0" data-testid="page-public-website">
      <div className="gs-help" role="status" aria-live="polite" data-testid="text-load-status">
        {w.loading ? 'Loading your public website…' : !w.ready ? w.notice?.text : ''}
        {!w.loading && !w.ready && w.canRetry && <button type="button" className="btn btn-sm ml-2" onClick={w.reload} data-testid="button-retry-public-website">Retry</button>}
      </div>
      <div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <fieldset disabled={locked} aria-busy={w.loading || w.saving} className="min-w-0 space-y-3 border-0 m-0 p-0">
          <SettingsSection id="branding" title="General / Branding">
            {text('display_name', 'display-name', 'Display name')}
            <SettingsRow id="logo" label="Logo">
              <ImageField kind="logo" label="Logo" url={w.urls.logo} hasAsset={!!draft?.logo_asset_id} uploading={w.uploading.logo} disabled={locked}
                error={w.assetErrors.logo} onFile={(f) => void w.upload('logo', f)} onRemove={() => w.removeAsset('logo')} />
            </SettingsRow>
            <SettingsRow id="primary-color" label="Primary colour" error={errors.primary_color}>
              <div className="flex items-center gap-2">
                <input type="color" aria-label="Primary colour picker" data-testid="input-primary-color-picker" disabled={locked}
                  value={/^#[0-9a-fA-F]{6}$/.test(draft?.primary_color ?? '') ? draft!.primary_color : '#000000'}
                  onChange={(e) => w.edit('primary_color', e.target.value.toUpperCase())} className="h-9 w-12 cursor-pointer rounded border border-[hsl(var(--border))] bg-transparent p-0.5" />
                <SettingInput id="primary-color" value={draft?.primary_color ?? ''} onChange={(v) => w.edit('primary_color', v)} invalid={!!errors.primary_color} placeholder="#1A7F64" />
              </div>
            </SettingsRow>
            <SettingsRow id="business-description" label="Business description (optional)" error={errors.business_description} help="Up to 500 characters.">
              <SettingTextarea id="business-description" value={draft?.business_description ?? ''} onChange={(v) => w.edit('business_description', v)} />
            </SettingsRow>
            <SettingsRow id="public-url" label="Public URL" help="Read-only address of your public website.">
              <div className="flex flex-wrap items-center gap-2">
                <input id="public-url" readOnly value={config?.public_url ?? ''} aria-label="Public URL" data-testid="input-public-url" className="min-w-0 flex-1 rounded-md border border-[hsl(var(--border))] bg-transparent px-2 py-1.5 text-[13px]" />
                {openUrl && <a href={openUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm" data-testid="link-open-website"><ExternalLink size={13} />Open Website</a>}
              </div>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection id="hero" title="Hero">
            {text('hero_badge', 'hero-badge', 'Hero badge')}
            {text('hero_title', 'hero-title', 'Hero title')}
            <SettingsRow id="hero-description" label="Hero description" error={errors.hero_description}
              help={draft && config && !draft.hero_description ? `Blank uses the default: ${config.defaults.hero_description}` : 'Up to 1000 characters.'}>
              <SettingTextarea id="hero-description" rows={4} value={draft?.hero_description ?? ''} onChange={(v) => w.edit('hero_description', v)} />
            </SettingsRow>
            <SettingsRow id="hero-image" label="Hero image">
              <ImageField kind="hero" label="Hero image" url={w.urls.hero} hasAsset={!!draft?.hero_asset_id} uploading={w.uploading.hero} disabled={locked}
                error={w.assetErrors.hero} onFile={(f) => void w.upload('hero', f)} onRemove={() => w.removeAsset('hero')} />
            </SettingsRow>
            {text('primary_cta_label', 'primary-cta-label', 'Primary button label')}
            {text('primary_cta_destination', 'primary-cta-destination', 'Primary button destination', 'Use #section, https://, mailto: or tel:.')}
            {text('secondary_cta_label', 'secondary-cta-label', 'Secondary button label')}
            {text('secondary_cta_destination', 'secondary-cta-destination', 'Secondary button destination', 'Use #section, https://, mailto: or tel:.')}
          </SettingsSection>

          <div className="gs-savebar">
            <button type="button" className="btn btn-brand" disabled={!w.dirty || w.anyUploading} onClick={() => void w.save()} data-testid="button-save-public-website"><Save size={14} />{w.saving ? 'Saving…' : 'Save Changes'}</button>
            <button type="button" className="btn" disabled={!w.ready || w.saving} onClick={() => void w.reset()} data-testid="button-reset-public-website"><RotateCcw size={14} />Reset Unsaved Changes</button>
            <p className="gs-notice" role="status" aria-live="polite" data-testid="text-save-notice" style={{ color: tone }}>
              {w.saving ? 'Saving your public website…' : w.anyUploading ? 'Uploading image…' : w.notice?.text ?? (w.dirty ? 'You have unsaved changes.' : 'No unsaved changes.')}
            </p>
          </div>
        </fieldset>

        <div className="sl-surface min-w-0 p-3 self-start">
          <h2 className="mb-2 text-[13.5px] font-semibold">Live Preview</h2>
          <PublicWebsitePreview {...w.preview} />
        </div>
      </div>
    </div>
  );
}
