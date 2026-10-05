import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { X, Layers } from 'lucide-react';
import './workspace-tabs.css';

export interface WorkspaceTab { route: string; title: string; closable: boolean }
interface Props { tabs: WorkspaceTab[]; activeRoute: string; onActivate: (route: string) => void; onClose: (route: string) => void }

export const tabKey = (route: string) => route.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
export const tabId = (route: string) => `workspace-tab-${tabKey(route)}`;
export const panelId = (route: string) => `workspace-panel-${tabKey(route)}`;

export function WorkspaceTabs({ tabs, activeRoute, onActivate, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [sheetTop, setSheetTop] = useState(72);
  const bar = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const active = tabs.find((t) => t.route === activeRoute);
  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const desiredHeight = Math.min(window.innerHeight * .7, tabs.length * 44 + 12);
      const below = window.innerHeight - rect.bottom - 20;
      setSheetTop(below >= Math.min(desiredHeight, 180)
        ? rect.bottom + 8
        : Math.max(12, rect.top - desiredHeight - 8));
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open, tabs.length]);

  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>(`[data-testid="workspace-tab-${tabKey(activeRoute)}"]`);
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeRoute, tabs.length]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (!sheet.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', down); document.addEventListener('touchstart', down); document.addEventListener('keydown', key);
    (sheet.current?.querySelector<HTMLElement>('[data-active=true] .ws-row-btn') ?? sheet.current?.querySelector<HTMLElement>('.ws-row-btn'))?.focus();
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('touchstart', down); document.removeEventListener('keydown', key); };
  }, [open, tabs.length]);

  const nav = (e: KeyboardEvent<HTMLDivElement>) => {
    const btns = Array.from(bar.current?.querySelectorAll<HTMLButtonElement>('[role=tab]') ?? []);
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const n = e.key === 'ArrowRight' ? (i + 1) % btns.length : e.key === 'ArrowLeft' ? (i - 1 + btns.length) % btns.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? btns.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault(); btns[n].focus();
  };

  const closeFromSheet = (route: string) => {
    onClose(route);
    if (tabs.length <= 2) { setOpen(false); trigger.current?.focus(); }
  };

  return (
    <div className="ws-root" data-testid="workspace-tabs">
      <div ref={bar} className="ws-bar ws-desktop" role="tablist" aria-label="Opened pages" aria-orientation="horizontal" onKeyDown={nav}>
        {tabs.map((t) => {
          const k = tabKey(t.route); const on = t.route === activeRoute;
          return (
            <div key={t.route} className="ws-tab" data-active={on}>
              <button type="button" role="tab" id={tabId(t.route)} aria-controls={panelId(t.route)} aria-selected={on} tabIndex={on ? 0 : -1}
                className="ws-tab-btn" data-closable={t.closable} data-testid={`workspace-tab-${k}`} onClick={() => onActivate(t.route)}>
                <span className="ws-tab-title">{t.title}</span>
              </button>
              {t.closable && (
                <button type="button" className="ws-x" aria-label={`Close ${t.title}`} data-testid={`workspace-close-${k}`}
                  onClick={(e) => { e.stopPropagation(); onClose(t.route); }}><X size={13} /></button>
              )}
            </div>
          );
        })}
      </div>

      <div className="ws-mbar ws-mobile">
        <span className="ws-current" data-testid="mobile-current-page">{active?.title ?? 'Dashboard'}</span>
        <button ref={trigger} type="button" className="ws-mbtn" aria-haspopup="dialog" aria-expanded={open}
          aria-label={`Opened pages, ${tabs.length}`} data-testid="button-opened-pages" onClick={() => setOpen((o) => !o)}>
          <Layers size={16} /><span className="sl-count">{tabs.length}</span>
        </button>
      </div>
      {open && (
        <div ref={sheet} className="sl-pop ws-sheet" role="dialog" aria-label="Opened pages" data-testid="mobile-opened-pages"
          style={{ top: sheetTop, maxHeight: `min(70dvh, calc(100dvh - ${sheetTop + 12}px))` }}>
          {tabs.map((t) => {
            const k = tabKey(t.route); const on = t.route === activeRoute;
            return (
              <div key={t.route} className="ws-row" data-active={on}>
                <button type="button" className="ws-row-btn" aria-current={on ? 'page' : undefined}
                  data-testid={`workspace-tab-${k}-mobile`} onClick={() => { onActivate(t.route); setOpen(false); trigger.current?.focus(); }}>
                  {t.title}
                </button>
                {t.closable && (
                  <button type="button" className="ws-row-x" aria-label={`Close ${t.title}`}
                    data-testid={`workspace-close-${k}-mobile`} onClick={() => closeFromSheet(t.route)}><X size={16} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
