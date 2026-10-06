import { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';

interface Props { html: string | null; stale: boolean; error: string | null; loading: boolean }
const SIZES = { desktop: { w: 1180, h: 760 }, mobile: { w: 390, h: 760 } } as const;

export function PublicWebsitePreview({ html, stale, error, loading }: Props) {
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(0);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el); setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const { w, h } = SIZES[mode];
  const scale = avail > 0 ? Math.min(1, avail / w) : 1;
  return (
    <div className="space-y-2 min-w-0" data-testid="panel-live-preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Preview size" className="flex gap-1">
          <button type="button" className={`btn btn-sm ${mode === 'desktop' ? 'btn-brand' : ''}`} aria-pressed={mode === 'desktop'} onClick={() => setMode('desktop')} data-testid="button-preview-desktop"><Monitor size={13} />Desktop</button>
          <button type="button" className={`btn btn-sm ${mode === 'mobile' ? 'btn-brand' : ''}`} aria-pressed={mode === 'mobile'} onClick={() => setMode('mobile')} data-testid="button-preview-mobile"><Smartphone size={13} />Mobile</button>
        </div>
        <span className="gs-help" role="status" aria-live="polite" data-testid="text-preview-status">
          {loading ? 'Refreshing preview…' : stale ? 'Showing the last valid preview (out of date)' : html ? 'Preview is current' : ''}
        </span>
      </div>
      {error && <p className="gs-help" role="alert" style={{ color: 'hsl(var(--danger))' }} data-testid="text-preview-error">Preview could not be updated: {error}</p>}
      <div ref={box} className="w-full overflow-hidden rounded-md border border-[hsl(var(--border))]" style={{ opacity: stale ? 0.7 : 1 }}>
        {html ? (
          <div style={{ width: w * scale, height: h * scale, margin: '0 auto' }}>
            <iframe title={`Public website ${mode} preview`} sandbox="allow-scripts" srcDoc={html} data-testid="iframe-preview"
              style={{ width: w, height: h, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', background: 'transparent' }} />
          </div>
        ) : (
          <div className="gs-help p-6 text-center" data-testid="text-preview-empty">{loading ? 'Rendering preview…' : 'No preview available yet.'}</div>
        )}
      </div>
    </div>
  );
}
