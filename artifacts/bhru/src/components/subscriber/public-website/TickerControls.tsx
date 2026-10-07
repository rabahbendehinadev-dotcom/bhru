import type { PublicStripSettings, PublicTickerSettings } from '@workspace/api-client-react';

export const defaultStrip: PublicStripSettings = { display: 'moving', speed: 'normal', direction: 'left', pause_on_hover: true };
export const defaultTicker: PublicTickerSettings = { ...defaultStrip, display:'static', background_color: '#152238', text_color: '#FFFFFF', separator: '•' };

export function TickerControls({ id, settings, onChange, image = false, showPauseOnHover = true, continuous = false }: {
  id: string; settings: PublicStripSettings; onChange: (value: PublicStripSettings) => void; image?: boolean; showPauseOnHover?: boolean; continuous?: boolean;
}) {
  return <div className="space-y-3 rounded-md bg-[hsl(var(--muted)/.35)] p-3">
    {continuous ? <p className="gs-help">Continuous scrolling</p> : <fieldset className="space-y-2">
      <legend className="gs-label">Display style</legend>
      <div className="flex flex-wrap gap-2">
        {(['static', 'moving'] as const).map(display => <label key={display} className="cursor-pointer">
          <input className="peer sr-only" type="radio" name={`${id}-display`} checked={settings.display === display}
            onChange={() => onChange({ ...settings, display })} data-testid={`radio-${id}-${display}`} />
          <span className={`inline-block rounded-md border px-4 py-2 text-[13px] peer-focus-visible:ring-2 peer-focus-visible:ring-[hsl(var(--ring))] ${settings.display === display ? 'border-[hsl(var(--brand))] bg-[hsl(var(--brand)/.08)] font-semibold' : 'border-[hsl(var(--border))]'}`}>
            {display === 'static' ? (image ? 'Static Row' : 'Static') : (image ? 'Moving Strip' : 'Moving Ticker')}
          </span>
        </label>)}
      </div>
    </fieldset>}
    {(continuous || settings.display === 'moving') && <div className="flex flex-wrap items-end gap-3">
      <label className="block space-y-1"><span className="gs-label">Speed</span>
        <select className="input" value={settings.speed} onChange={e => onChange({ ...settings, speed: e.target.value as PublicStripSettings['speed'] })} data-testid={`select-${id}-speed`}>
          <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option>
        </select>
      </label>
      <label className="block space-y-1"><span className="gs-label">Direction</span>
        <select className="input" value={settings.direction} onChange={e => onChange({ ...settings, direction: e.target.value as PublicStripSettings['direction'] })} data-testid={`select-${id}-direction`}>
          <option value="left">Left</option><option value="right">Right</option>
        </select>
      </label>
      {!continuous && showPauseOnHover && <label className="flex min-h-9 items-center gap-2 text-[13px]"><input type="checkbox" checked={settings.pause_on_hover}
        onChange={e => onChange({ ...settings, pause_on_hover: e.target.checked })} data-testid={`check-${id}-pause-hover`} />Pause on hover</label>}
    </div>}
  </div>;
}

export function TickerColours({ settings, onChange, errors, showSeparator = true, errorPrefix = 'ticker' }: {
  settings: PublicTickerSettings; onChange: (value: PublicTickerSettings) => void; errors: Record<string, string>; showSeparator?: boolean; errorPrefix?: string;
}) {
  return <div className="grid gap-3 sm:grid-cols-2">
    {(['background_color', 'text_color'] as const).map(key => <label key={key} className="block space-y-1">
      <span className="gs-label">{key === 'background_color' ? 'Background colour' : 'Text colour'}</span>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={key === 'background_color' ? 'Ticker background colour' : 'Ticker text colour'}
          value={/^#[0-9a-fA-F]{6}$/.test(settings[key]) ? settings[key] : '#000000'}
          onChange={e => onChange({ ...settings, [key]: e.target.value.toUpperCase() })}
          className="h-9 w-12 shrink-0 cursor-pointer rounded border border-[hsl(var(--border))] bg-transparent p-0.5" />
        <input className="input min-w-0" aria-label={`${key} HEX`} value={settings[key]} maxLength={7}
          onChange={e => onChange({ ...settings, [key]: e.target.value })} />
      </div>
      {errors[`${errorPrefix}.${key}`] && <span className="gs-err" role="alert">{errors[`${errorPrefix}.${key}`]}</span>}
    </label>)}
    {showSeparator && <label className="block space-y-1"><span className="gs-label">Separator character / emoji</span>
      <input className="input" value={settings.separator} maxLength={16} placeholder="•"
        onChange={e => onChange({ ...settings, separator: e.target.value })} data-testid="input-ticker-separator" />
      {errors['ticker.separator'] && <span className="gs-err" role="alert">{errors['ticker.separator']}</span>}
    </label>}
  </div>;
}
