import type { PublicAnnouncement } from '@workspace/api-client-react';

/** All inputs patch only the announcement owning this editor. No shared style settings. */
export function AnnouncementRowFields({ row, index, errors, onChange }: {
  row: PublicAnnouncement;
  index: number;
  errors: Record<string, string>;
  onChange: (patch: Partial<PublicAnnouncement>) => void;
}) {
  const error = (key: string) => errors[`${row.id}.${key}`]
    ? <span className="gs-err block" role="alert">{errors[`${row.id}.${key}`]}</span> : null;

  return <div className="min-w-0 space-y-4" role="group" aria-label={`Edit Ticker Row ${index + 1}`}>
    <label className="block min-w-0 space-y-1">
      <span className="gs-label">Text</span>
      <textarea className="input w-full min-w-0" dir="auto" rows={2} value={row.text}
        onChange={e => onChange({ text: e.target.value })} data-testid={`input-bar-text-${index}`} />
      <span className="gs-help block">{row.text.length}/500</span>{error('text')}
    </label>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="block min-w-0 space-y-1">
        <span className="gs-label">Link (optional)</span>
        <input className="input w-full min-w-0" value={row.destination} placeholder="https://… or /page"
          onChange={e => onChange({ destination: e.target.value })} data-testid={`input-bar-link-${index}`} />
        {error('destination')}
      </label>
      <label className="block min-w-0 space-y-1">
        <span className="gs-label">Emoji / icon text (optional)</span>
        <input className="input w-full min-w-0" dir="auto" value={row.icon_text ?? ''} maxLength={32} placeholder="🔥"
          onChange={e => onChange({ icon_text: e.target.value })} data-testid={`input-message-icon-${index}`} />
        {error('icon_text')}
      </label>
    </div>
    <fieldset className="min-w-0 space-y-2">
      <legend className="gs-label">Style — this row only</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {(['background_color', 'text_color'] as const).map(key => {
          const label = key === 'background_color' ? 'Background colour' : 'Text colour';
          return <div key={key} className="min-w-0 space-y-1">
            <span className="gs-label">{label}</span>
            <div className="flex min-w-0 items-center gap-2">
              <input type="color" aria-label={`Ticker Row ${index + 1} ${label} picker`}
                value={/^#[0-9a-fA-F]{6}$/.test(row[key]) ? row[key] : '#000000'}
                onChange={e => onChange({ [key]: e.target.value.toUpperCase() })}
                className="h-11 w-12 shrink-0 cursor-pointer rounded border border-[hsl(var(--border))] bg-transparent p-0.5"
                data-testid={`input-announcement-${index}-${key}-picker`} />
              <input className="input w-full min-w-0" aria-label={`Ticker Row ${index + 1} ${label} HEX`}
                value={row[key]} maxLength={7} placeholder="#FFFFFF" spellCheck={false}
                onChange={e => onChange({ [key]: e.target.value })}
                data-testid={`input-announcement-${index}-${key}-hex`} />
            </div>{error(key)}
          </div>;
        })}
      </div>
    </fieldset>
    <fieldset className="min-w-0 space-y-2">
      <legend className="gs-label">Movement — continuous scrolling</legend>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <label className="block min-w-0 space-y-1">
          <span className="gs-label">Speed</span>
          <select className="input w-full min-w-0" value={row.speed}
            onChange={e => onChange({ speed: e.target.value as PublicAnnouncement['speed'] })}
            data-testid={`select-announcement-${row.id}-speed`}>
            <option value="slow">Slow</option><option value="normal">Normal</option><option value="fast">Fast</option>
          </select>
        </label>
        <label className="block min-w-0 space-y-1">
          <span className="gs-label">Direction</span>
          <select className="input w-full min-w-0" value={row.direction}
            onChange={e => onChange({ direction: e.target.value as PublicAnnouncement['direction'] })}
            data-testid={`select-announcement-${row.id}-direction`}>
            <option value="left">Left</option><option value="right">Right</option>
          </select>
        </label>
      </div>
    </fieldset>
  </div>;
}
