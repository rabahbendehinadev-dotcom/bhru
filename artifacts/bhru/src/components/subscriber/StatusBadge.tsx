import type { ReactNode } from 'react';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';
const TONE: Record<StatusTone, string> = {
  neutral: '--text-secondary', success: '--ok', warning: '--warn', danger: '--danger', info: '--c-server', brand: '--brand',
};

export function StatusBadge({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  const v = TONE[tone];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-semibold leading-[20px]"
      style={{ background: `hsl(var(${v}) / .14)`, color: `hsl(var(${v}))` }}>
      <i className="h-1.5 w-1.5 rounded-full" style={{ background: `hsl(var(${v}))` }} />{children}
    </span>
  );
}
