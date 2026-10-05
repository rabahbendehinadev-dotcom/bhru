import type { ReactNode } from 'react';

export function EmptyState({ icon, title, description, action, compact }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'px-4 py-6' : 'px-6 py-12'}`} data-testid="empty-state">
      {icon && <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[hsl(var(--brand)/.12)] text-[hsl(var(--brand))]">{icon}</div>}
      <div className="text-[13.5px] font-semibold">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[12px] leading-snug text-[hsl(var(--text-secondary))]">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
