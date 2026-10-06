import { useRef } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';

interface Props { kind: 'logo' | 'hero'; label: string; url: string | null; hasAsset: boolean; uploading: boolean; disabled: boolean; error?: string; onFile: (f: File) => void; onRemove: () => void }

export function ImageField({ kind, label, url, hasAsset, uploading, disabled, error, onFile, onRemove }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-start gap-3" data-testid={`field-${kind}-image`}>
      <div className="flex h-24 w-40 items-center justify-center overflow-hidden rounded-md border border-[hsl(var(--border))]">
        {url ? <img src={url} alt={`${label} preview`} className="max-h-full max-w-full object-contain" data-testid={`img-${kind}-preview`} />
          : <span className="gs-help px-2 text-center">{hasAsset ? 'Preview unavailable' : 'No image'}</span>}
      </div>
      <div className="space-y-1.5">
        <input ref={input} id={`${kind}-file`} type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`${label} file`} data-testid={`input-${kind}-file`}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
        <div className="flex gap-2">
          <button type="button" className="btn btn-sm" disabled={disabled || uploading} onClick={() => input.current?.click()} data-testid={`button-${kind}-upload`}>
            {hasAsset || url ? <Upload size={13} /> : <ImagePlus size={13} />}{uploading ? 'Uploading…' : hasAsset || url ? 'Replace' : 'Upload'}
          </button>
          {(hasAsset || url) && <button type="button" className="btn btn-sm" disabled={disabled || uploading} onClick={onRemove} data-testid={`button-${kind}-remove`}><Trash2 size={13} />Remove</button>}
        </div>
        <p className="gs-help">PNG or JPEG, up to 5 MB.</p>
        {error && <p className="gs-help" role="alert" style={{ color: 'hsl(var(--danger))' }} data-testid={`text-${kind}-error`}>{error}</p>}
      </div>
    </div>
  );
}
