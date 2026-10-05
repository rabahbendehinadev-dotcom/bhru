import { useEffect, useRef, useState } from 'react';

export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const d = (e: PointerEvent) => {
      if ((e.target as Element).closest?.('[data-pwa-install-dialog]')) return;
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', d); window.addEventListener('keydown', k);
    return () => { window.removeEventListener('pointerdown', d); window.removeEventListener('keydown', k); };
  }, [open]);
  return { open, setOpen, ref };
}
