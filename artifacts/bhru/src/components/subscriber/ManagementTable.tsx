import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

export interface Column<T> { key: string; header: string; render: (row: T) => ReactNode; className?: string }
interface Props<T> {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; loading?: boolean; error?: string; onRetry?: () => void;
  empty?: { title: string; description?: string; icon?: ReactNode }; toolbar?: ReactNode;
}

export function ManagementTable<T>({ columns, rows, rowKey, loading, error, onRetry, empty, toolbar }: Props<T>) {
  return (
    <div className="sl-surface overflow-hidden">
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] p-3">{toolbar}</div>}
      {error ? (
        <EmptyState title="Could not load data" description={error} action={onRetry && <button className="btn" onClick={onRetry}>Retry</button>} />
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="tbl">
            <thead><tr>{columns.map((c) => <th key={c.key} className={c.className}>{c.header}</th>)}</tr></thead>
            <tbody>
              {loading && Array.from({ length: 5 }).map((_, i) => <tr key={i}>{columns.map((c) => <td key={c.key}><div className="sl-skel h-3.5 w-full min-w-[60px]" /></td>)}</tr>)}
              {!loading && rows.map((r) => <tr key={rowKey(r)} className="hov">{columns.map((c) => <td key={c.key} className={c.className}>{c.render(r)}</td>)}</tr>)}
            </tbody>
          </table>
          {!loading && rows.length === 0 && <EmptyState title={empty?.title ?? 'Nothing here yet'} description={empty?.description} icon={empty?.icon} />}
        </div>
      )}
    </div>
  );
}
