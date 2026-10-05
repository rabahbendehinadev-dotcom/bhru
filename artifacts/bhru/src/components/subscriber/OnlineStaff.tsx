import { UserCheck } from 'lucide-react';
import { EmptyState } from './EmptyState';

/** Shape for future staff-presence data. No backend yet: callers pass an empty list. */
export interface OnlineStaffMember { id: string; name: string; role?: string; since?: string }

export function useOnlineStaff(): { members: OnlineStaffMember[]; count: number } {
  // TODO: wire to staff-presence API when it exists.
  const members: OnlineStaffMember[] = [];
  return { members, count: members.length };
}

export function OnlineStaffBadge({ count }: { count: number }) {
  return <span className="sl-count" data-testid="badge-online-staff" aria-label={`${count} staff online`}>{count}</span>;
}

export function OnlineStaffList({ members }: { members: OnlineStaffMember[] }) {
  if (!members.length) return <EmptyState icon={<UserCheck size={18} />} title="No staff online" description="Module not enabled yet. Staff presence will be connected in a later phase." />;
  return (
    <ul className="divide-y divide-[hsl(var(--border))]" data-testid="list-online-staff">
      {members.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-4 py-2.5" data-testid={`row-staff-${m.id}`}>
          <span className="h-2 w-2 rounded-full bg-[hsl(var(--ok))]" />
          <span className="font-semibold">{m.name}</span>
          {m.role && <span className="text-[11.5px] text-[hsl(var(--text-secondary))]">{m.role}</span>}
          {m.since && <span className="ml-auto text-[11px] text-[hsl(var(--text-secondary))]">{m.since}</span>}
        </li>
      ))}
    </ul>
  );
}
