import { ReactNode } from 'react';
import './general-settings.css';

export function SettingsSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="gs-section" aria-labelledby={`gs-h-${id}`} data-testid={`section-${id}`}>
      <h2 id={`gs-h-${id}`}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

export function SettingsRow({ id, label, help, error, children }: { id: string; label: string; help?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="gs-row" data-testid={`row-${id}`}>
      <label className="gs-label" htmlFor={id} id={`${id}-label`}>{label}</label>
      <div className="gs-ctl">
        {children}
        {help && <p className="gs-help" id={`${id}-help`}>{help}</p>}
        {error && <p className="gs-err" role="alert" data-testid={`error-${id}`}>{error}</p>}
      </div>
    </div>
  );
}

export function SettingInput({ id, value, onChange, placeholder, inputMode, suffix, invalid, type = 'text' }: {
  id: string; value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: 'numeric' | 'decimal' | 'url'; suffix?: ReactNode; invalid?: boolean; type?: 'text' | 'number';
}) {
  const input = (
    <input id={id} type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined}
      className="input" value={value} placeholder={placeholder} inputMode={inputMode} aria-invalid={invalid || undefined}
      aria-describedby={`${id}-help`} onChange={(e) => onChange(e.target.value)} data-testid={`input-${id}`} autoComplete="off" />
  );
  return suffix ? <div className="gs-inline">{input}{suffix}</div> : input;
}

export function SettingTextarea({ id, value, onChange, rows = 3 }: { id: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return <textarea id={id} className="input" rows={rows} value={value} aria-describedby={`${id}-help`} onChange={(e) => onChange(e.target.value)} data-testid={`textarea-${id}`} />;
}

export function SettingToggle({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" id={id} role="switch" aria-checked={checked} aria-labelledby={`${id}-label`} className="gs-switch"
      onClick={() => onChange(!checked)} data-testid={`switch-${id}`} title={label}>
      <span className="gs-track" />
      <span className="gs-state">{checked ? 'Enable' : 'Disable'}</span>
    </button>
  );
}

export function SettingSelect({ id, value, onChange, options }: { id: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} data-testid={`select-${id}`}>
      <option value="">Select format</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export type SettingsNavItem = { id: string; label: string; enabled: boolean };

export function SettingsNavigation({ items, activeId }: { items: SettingsNavItem[]; activeId: string }) {
  return (
    <>
      <nav className="gs-aside" aria-label="Settings sections" data-testid="nav-settings">
        <ul className="space-y-0.5">
          {items.map((i) => (
            <li key={i.id}>
              <button type="button" className="gs-nav-item" aria-current={i.id === activeId ? 'page' : undefined}
                aria-disabled={!i.enabled || undefined} tabIndex={i.enabled ? 0 : -1} onClick={(e) => { if (!i.enabled) e.preventDefault(); }}
                title={i.enabled ? undefined : 'Not available yet'} data-testid={`nav-settings-${i.id}`}>
                {i.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="gs-mobnav">
        <label className="lbl" htmlFor="gs-mobile-nav">Settings section</label>
        <select id="gs-mobile-nav" className="input" value={activeId} onChange={() => {}} data-testid="select-settings-nav">
          {items.map((i) => <option key={i.id} value={i.id} disabled={!i.enabled}>{i.label}</option>)}
        </select>
      </div>
    </>
  );
}
