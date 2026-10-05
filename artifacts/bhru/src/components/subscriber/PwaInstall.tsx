import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Download, Share, SquarePlus, Check, ExternalLink, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getInstallState, promptInstall, subscribeInstall, updatePwaTheme } from '@/lib/subscriber-pwa';
import { useSubscriberTheme } from './theme';

export function PwaThemeColor() {
  const { theme } = useSubscriberTheme();
  useLayoutEffect(() => { updatePwaTheme(theme); }, [theme]);
  return null;
}

/** A user-initiated option, never an automatic installation popup. */
export function InstallOption() {
  const install = useSyncExternalStore(subscribeInstall, getInstallState);
  const { theme } = useSubscriberTheme();
  const [instructions, setInstructions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!instructions) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInstructions(false);
      // The dialog has one action. Keep keyboard focus inside it.
      if (event.key === 'Tab') { event.preventDefault(); closeRef.current?.focus(); }
    };
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', close);
      triggerRef.current?.focus();
    };
  }, [instructions]);
  if (install.installed || (!install.mode && !error)) return null;
  const open = async () => {
    if (install.mode !== 'native') { setInstructions(true); return; }
    setBusy(true); setError('');
    try { await promptInstall(); }
    catch { setError('Installation is unavailable right now. Try your browser’s install menu.'); }
    finally { setBusy(false); }
  };
  return (
    <>
      {install.mode && <button ref={triggerRef} type="button" data-testid="button-install-bhru" onClick={() => void open()} disabled={busy}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[hsl(var(--brand))] hover:bg-[hsl(var(--hover))]">
        <Download size={18} />{busy ? 'Opening install…' : 'Install BHRU'}
      </button>}
      {error && <p role="alert" className="px-3 text-[12px]">{error}</p>}
      {instructions && createPortal(
        <div className="sub-layout fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-3 sm:items-center" data-theme={theme}
          data-pwa-install-dialog style={{ backgroundColor: 'rgb(0 0 0 / .45)',
            paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            paddingLeft: 'max(12px, env(safe-area-inset-left))', paddingRight: 'max(12px, env(safe-area-inset-right))' }} onClick={() => setInstructions(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="pwa-install-title" data-testid="dialog-install-bhru"
            className="sl-surface w-full max-w-sm overflow-y-auto p-5"
            style={{ maxHeight: 'calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))' }} onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="pwa-install-title" className="text-[17px] font-bold">Install BHRU</h2>
              <button ref={closeRef} type="button" aria-label="Close installation instructions" onClick={() => setInstructions(false)}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-[hsl(var(--hover))]"><X size={20} /></button>
            </div>
            {install.mode === 'ios-browser' ? (
              <div className="space-y-3 text-[13px] leading-relaxed">
                <ExternalLink size={26} className="text-[hsl(var(--brand))]" />
                <p>Open BHRU in Safari to add it to your Home Screen.</p>
                <p className="text-[hsl(var(--text-secondary))]">Use this browser’s menu and choose “Open in Safari”, or copy the BHRU address and paste it into Safari. Then tap Share and choose “Add to Home Screen”.</p>
              </div>
            ) : (
              <ol className="space-y-4 text-[13px]">
                {[
                  { icon: Share, title: 'Tap the Share button in Safari', detail: 'Look for the square with an upward arrow in Safari’s toolbar.' },
                  { icon: SquarePlus, title: 'Choose “Add to Home Screen”', detail: 'Scroll down in the Share menu if you do not see it.' },
                  { icon: Check, title: 'Confirm “Add”', detail: 'Open BHRU from your Home Screen for the app experience.' },
                ].map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[hsl(var(--hover))] text-[hsl(var(--brand))]"><step.icon size={21} /></span>
                    <div><p className="font-semibold">{index + 1}. {step.title}</p><p className="mt-1 text-[12px] leading-relaxed text-[hsl(var(--text-secondary))]">{step.detail}</p></div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>, document.body,
      )}
    </>
  );
}