import { useState } from 'react';
import { Save, ImagePlus, X } from 'lucide-react';
import { useGeneralSettings } from '@/hooks/use-general-settings';
import { SettingsSection, SettingsRow, SettingInput, SettingTextarea, SettingToggle, SettingSelect, SettingsNavigation, type SettingsNavItem } from '@/components/subscriber/general-settings/settings-ui';

const NAV: SettingsNavItem[] = [
  'General Settings', 'Registration / Profile', 'Shopping Cart', 'Localizations', 'Tax', 'Invoice', 'Contact Us', 'Orders', 'Fraud protection', 'Appearance', 'Other',
].map((label, i) => ({ id: label.toLowerCase().replace(/[^a-z]+/g, '-'), label, enabled: i === 0 }));

const SITE_TOGGLES: { id: string; label: string; help?: string }[] = [
  ['faster-browsing', 'Faster Browsing'], ['recharge-voucher', 'Recharge Voucher'], ['testimonial', 'Testimonial'], ['blog', 'Blog'],
  ['knowledge-base', 'Knowledge Base'], ['support-ticket', 'Support Ticket'], ['show-service-price', 'Show Service Price'],
  ['show-service-icon', 'Show Service Icon', 'Reseller Price Page icon'], ['affiliate-system', 'Affiliate System'], ['gift-certificate', 'Gift Certificate'],
  ['gift-certificate-tax', 'Gift Certificate Tax'], ['withdrawal-request', 'Withdrawal Request'], ['eu-cookie-law', 'EU Cookie Law'],
  ['email-history-save', 'E-mail History Save'], ['user-manage-credit-card', 'User can Manage Credit Card Detail'], ['mobile-app', 'Mobile App'],
  ['display-track-order', 'Display Track Order'], ['display-downloads', 'Display Downloads'],
].map(([id, label, help]) => ({ id, label, help }));

export default function GeneralSettingsPage() {
  const { v, set, tog, errors, notice, loading, saving, ready, dirty, canRetry, save, reload } = useGeneralSettings();
  const [gallery, setGallery] = useState<string | null>(null);

  const gal = (id: string) => <button type="button" className="btn" onClick={() => setGallery(id)} data-testid={`button-gallery-${id}`}><ImagePlus size={14} />Add From Gallery</button>;

  return (
    <div className="gs-root" data-testid="page-general-settings">
      <SettingsNavigation items={NAV} activeId="general-settings" />
      <div className="space-y-3 min-w-0">
        <div className="gs-help" role="status" aria-live="polite" data-testid="text-load-status">
          {loading ? 'Loading your saved General Settings…' : !ready ? notice?.text : ''}
          {!loading && !ready && canRetry && <button type="button" className="btn btn-sm ml-2" onClick={() => void reload()} data-testid="button-retry-settings">Retry</button>}
        </div>
        <fieldset disabled={loading || saving || !ready} className="min-w-0 space-y-3 border-0 m-0 p-0" aria-busy={loading || saving}>
        <SettingsSection id="site-information" title="Site Information">
          <SettingsRow id="company-name" label="Company Name" help="Your Company Name as you want it to appear throughout the system"><SettingInput id="company-name" value={v('company-name')} onChange={set('company-name')} /></SettingsRow>
          <SettingsRow id="site-name" label="Site Name"><SettingInput id="site-name" value={v('site-name')} onChange={set('site-name')} /></SettingsRow>
          <SettingsRow id="logo-link" label="Logo Link" help="Enter your logo URL to display in email messages or leave blank for none"><SettingInput id="logo-link" value={v('logo-link')} onChange={set('logo-link')} suffix={gal('logo')} /></SettingsRow>
          <SettingsRow id="favicon-icon" label="Favicon Icon" help="64 Kb PNG image recommended"><SettingInput id="favicon-icon" value={v('favicon-icon')} onChange={set('favicon-icon')} suffix={gal('favicon')} /></SettingsRow>
        </SettingsSection>

        <SettingsSection id="site-links" title="Site Links">
          <SettingsRow id="site-link" label="Site Link" error={errors['site-link']} help="URL of the installation, eg. http://www.yourdomain.com/server/"><SettingInput id="site-link" inputMode="url" value={v('site-link')} onChange={set('site-link')} invalid={!!errors['site-link']} /></SettingsRow>
          <SettingsRow id="site-ssl-link" label="Site SSL Link" error={errors['site-ssl-link']} help="URL of the installation for secure access, eg. https://www.yourdomain.com/server/ (leave blank for no SSL)"><SettingInput id="site-ssl-link" inputMode="url" value={v('site-ssl-link')} onChange={set('site-ssl-link')} invalid={!!errors['site-ssl-link']} /></SettingsRow>
        </SettingsSection>

        <SettingsSection id="seo-settings" title="SEO Settings">
          <SettingsRow id="seo-friendly-url" label="SEO Friendly url" help="(Requires .htaccess in the root directory)"><SettingToggle id="seo-friendly-url" label="SEO Friendly url" {...tog('seo')} /></SettingsRow>
          <SettingsRow id="page-title-format" label="Page Title Format"><SettingSelect id="page-title-format" value={v('title-format')} onChange={set('title-format')} options={['Default']} /></SettingsRow>
          <SettingsRow id="site-description" label="Site Description" help="Header META tag description"><SettingTextarea id="site-description" value={v('desc')} onChange={set('desc')} /></SettingsRow>
          <SettingsRow id="site-keywords" label="Site Keywords"><SettingTextarea id="site-keywords" value={v('keywords')} onChange={set('keywords')} /></SettingsRow>
        </SettingsSection>

        <SettingsSection id="site-settings" title="Site Settings">
          {SITE_TOGGLES.map((s) => (
            <SettingsRow key={s.id} id={s.id} label={s.label} help={s.help}><SettingToggle id={s.id} label={s.label} {...tog(s.id)} /></SettingsRow>
          ))}
        </SettingsSection>

        <SettingsSection id="site-page-redirect" title="Site Page Redirect">
          <SettingsRow id="index-redirect" label="Index Redirect" help="Main index page redirect to eg. main.php"><SettingInput id="index-redirect" value={v('index-redirect')} onChange={set('index-redirect')} /></SettingsRow>
          <SettingsRow id="logout-redirect" label="Logout Redirect" help="Redirection after logout eg. main.php"><SettingInput id="logout-redirect" value={v('logout-redirect')} onChange={set('logout-redirect')} /></SettingsRow>
        </SettingsSection>

        <SettingsSection id="fund-settings" title="Fund Settings">
          <SettingsRow id="add-fund" label="Add Fund" help="Adding of funds by clients from the client area"><SettingToggle id="add-fund" label="Add Fund" {...tog('add-fund')} /></SettingsRow>
          <SettingsRow id="tax-add-fund" label="Tax for add fund" help="Enable tax for Add Fund"><SettingToggle id="tax-add-fund" label="Tax for add fund" {...tog('tax-add-fund')} /></SettingsRow>
          <SettingsRow id="min-add-fund" label="Minimum Add Fund" error={errors['min-add-fund']} help="Enter the minimum amount a client can add in a single transaction"><SettingInput id="min-add-fund" type="number" inputMode="decimal" value={v('min-add-fund')} onChange={set('min-add-fund')} invalid={!!errors['min-add-fund']} suffix={<span className="text-[12.5px]">Set Minimum Fund Limit Payment Gateway wise</span>} /></SettingsRow>
          <SettingsRow id="max-add-fund" label="Maximum Add Fund" error={errors['max-add-fund']} help="Enter the maximum amount a client can add in a single transaction"><SettingInput id="max-add-fund" type="number" inputMode="decimal" value={v('max-add-fund')} onChange={set('max-add-fund')} invalid={!!errors['max-add-fund']} suffix={<span className="text-[12.5px]">Set Maximum Fund Limit Payment Gateway wise</span>} /></SettingsRow>
          <SettingsRow id="max-balance" label="Maximum Balance" error={errors['max-balance']} help="Enter the maximum balance that a client can add in credit"><SettingInput id="max-balance" type="number" inputMode="decimal" value={v('max-balance')} onChange={set('max-balance')} invalid={!!errors['max-balance']} /></SettingsRow>
        </SettingsSection>

        <div className="gs-savebar">
          <button type="button" className="btn btn-brand" onClick={() => void save()} data-testid="button-save-changes"><Save size={14} />{saving ? 'Saving…' : 'Save Changes'}</button>
          <p className="gs-notice" role="status" aria-live="polite" data-testid="text-save-notice"
            style={{ color: notice?.kind === 'error' ? 'hsl(var(--danger))' : 'hsl(var(--muted-foreground))' }}>
            {saving ? 'Saving your General Settings…' : loading ? 'Loading saved settings…' : notice?.text ?? (dirty ? 'You have unsaved changes.' : 'No unsaved changes.')}
          </p>
        </div>
        </fieldset>
      </div>

      {gallery && (
        <div className="gs-modal" role="dialog" aria-modal="true" aria-labelledby="gs-gal-title" data-testid="dialog-gallery">
          <div>
            <div className="flex items-center justify-between">
              <h3 id="gs-gal-title" className="text-[13.5px] font-semibold">Add From Gallery</h3>
              <button type="button" className="btn btn-sm" aria-label="Close gallery" onClick={() => setGallery(null)} data-testid="button-gallery-close"><X size={13} /></button>
            </div>
            <p className="gs-help mt-2">The image gallery is not available yet. Enter the image URL in the field instead.</p>
          </div>
        </div>
      )}
    </div>
  );
}
