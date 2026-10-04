import { type ButtonHTMLAttributes, type ReactNode, useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Status, effectiveStatus, type Subscriber } from '@/lib/store';

export function Logo({ sub = 'Unlock Server Panel', size = 30 }: { sub?: string; size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <img
        src={`${import.meta.env.BASE_URL}brand/bhru-icon.png`}
        alt=""
        className="shrink-0 rounded-md object-contain"
        width={size}
        height={size}
      />
      <div className="leading-tight">
        <img src={`${import.meta.env.BASE_URL}brand/bhru-wordmark.png`} alt="BHRU" width={78} height={18} className="mb-0.5 object-contain" />
        <div className="text-[9.5px] text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...p}>{children}</div>;
}

export function CardHead({ title, right, demo }: { title: string; right?: ReactNode; demo?: boolean }) {
  return (
    <div className="card-h">
      <span className="flex items-center gap-2">
        {title}
        {demo && <span className="rounded bg-violet/15 px-1.5 text-[9px] font-semibold uppercase text-violet">Not enabled</span>}
      </span>
      {right}
    </div>
  );
}

type V = 'default' | 'primary' | 'brand' | 'ok' | 'warn' | 'danger';
export function Btn({ v = 'default', sm, className, ...p }: { v?: V; sm?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={cn('btn', v !== 'default' && `btn-${v}`, sm && 'btn-sm', className)}
    />
  );
}

export function Field({ label, children, hint, error }: { label: string; children: ReactNode; hint?: string; error?: string }) {
  return (
    <div>
      <label className="lbl">{label}</label>
      {children}
      {error ? <p className="mt-1 text-[11px] text-danger">{error}</p> : hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const TONES: Record<string, string> = {
  blue: 'bg-primary/20 text-[hsl(217_95%_72%)]',
  green: 'bg-ok/20 text-[hsl(152_60%_58%)]',
  orange: 'bg-warn/20 text-[hsl(30_95%_62%)]',
  red: 'bg-danger/20 text-[hsl(0_90%_72%)]',
  violet: 'bg-violet/20 text-[hsl(262_90%_77%)]',
  gray: 'bg-white/10 text-[hsl(215_20%_75%)]',
};
export function Badge({ tone = 'gray', children, ...p }: { tone?: keyof typeof TONES; children: ReactNode } & React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('badge', TONES[tone])} {...p}>{children}</span>;
}

const STATUS_TONE: Record<Status, { t: string; l: string }> = {
  ACTIVE: { t: 'green', l: 'Active' },
  TRIAL: { t: 'blue', l: 'Trial' },
  PENDING: { t: 'orange', l: 'Pending' },
  SUSPENDED: { t: 'red', l: 'Suspended' },
  EXPIRED: { t: 'red', l: 'Expired' },
  REVOKED: { t: 'gray', l: 'Revoked' },
};
export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_TONE[status];
  return <Badge tone={s.t} data-testid={`status-${status.toLowerCase()}`}>{s.l}</Badge>;
}
export const SubStatus = ({ sub }: { sub: Subscriber }) => <StatusBadge status={effectiveStatus(sub)} />;

export function PlanBadge({ plan }: { plan: string }) {
  const t = plan === 'Business' ? 'violet' : plan === 'Pro' ? 'blue' : plan === 'Trial' ? 'orange' : 'gray';
  return <Badge tone={t}>{plan}</Badge>;
}

export function Modal({ open, onClose, title, children, footer, width = 440 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="card w-full shadow-2xl" style={{ maxWidth: width, background: 'hsl(var(--popover))' }} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="space-y-3 p-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, title, body, confirmLabel, danger, onConfirm, onClose }: { open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void | boolean | Promise<void | boolean>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Btn onClick={onClose} data-testid="button-confirm-cancel">Cancel</Btn>
          <Btn disabled={busy} v={danger ? 'danger' : 'primary'} onClick={async () => { setBusy(true); try { if (await onConfirm() !== false) onClose(); } finally { setBusy(false); } }} data-testid="button-confirm-ok">{busy ? 'Saving...' : confirmLabel}</Btn>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-muted-foreground">{body}</div>
    </Modal>
  );
}

export function Metric({ label, value, delta, icon, tone, sub }: { label: string; value: string; delta?: number; icon: ReactNode; tone: string; sub?: string }) {
  return (
    <Card className="flex items-center justify-between p-3.5" data-testid={`metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div>
        <div className="text-[12px] text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-[22px] font-semibold leading-tight tabular-nums">{value}</div>
        {delta !== undefined ? (
          <div className={cn('text-[11px] font-medium', delta >= 0 ? 'text-ok' : 'text-danger')}>{delta >= 0 ? '\u2191' : '\u2193'} {Math.abs(delta)}%</div>
        ) : sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
      </div>
      <div className={cn('grid h-10 w-10 place-items-center rounded-lg text-white', tone)}>{icon}</div>
    </Card>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const list = Array.from({ length: pages }, (_, i) => i + 1);
  return (
    <div className="flex items-center gap-1">
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={14} /></button>
      {list.map((n) => (
        <button key={n} onClick={() => onPage(n)} className={cn('btn btn-sm min-w-[26px]', n === page && 'btn-primary')} data-testid={`button-page-${n}`}>{n}</button>
      ))}
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={14} /></button>
    </div>
  );
}

export function DeferredTag({ children = 'Not enabled' }: { children?: ReactNode }) {
  return <span className="rounded border border-violet/30 bg-violet/10 px-1.5 py-0.5 text-[10px] font-medium text-violet">{children}</span>;
}
