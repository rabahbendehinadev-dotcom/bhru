import { AdminShell } from '@/components/bhru/shells';
import { Card, Badge } from '@/components/bhru/ui';
import { fmtDateTime, useStore } from '@/lib/store';

export function AdminUsers() {
  const { admins } = useStore();
  return (
    <AdminShell>
      <div className="space-y-3">
        <div><h1 className="text-[18px] font-semibold">Admin Users</h1><p className="text-[12.5px] text-muted-foreground">Platform administrators. Management is planned for a later iteration.</p></div>
        <Card><table className="tbl"><thead><tr><th>Name</th><th>Role</th><th>Access</th></tr></thead><tbody>{admins.map(a => <tr key={a.id}><td className="font-semibold">{a.name}</td><td><Badge tone="violet">Platform Admin</Badge></td><td>{a.email}</td></tr>)}</tbody></table></Card>
      </div>
    </AdminShell>
  );
}
export function ActivityLogs() {
  const { logs } = useStore();
  return (
    <AdminShell>
      <div className="space-y-3">
        <div><h1 className="text-[18px] font-semibold">Activity Logs</h1><p className="text-[12.5px] text-muted-foreground">Administrative and registration events recorded in PostgreSQL.</p></div>
        <Card><div className="scroll-thin overflow-x-auto"><table className="tbl" data-testid="table-logs"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>{logs.map((l) => <tr key={l.id}><td>{fmtDateTime(l.at)}</td><td>{l.actor}</td><td>{l.action}</td><td>{l.target}</td></tr>)}</tbody></table></div></Card>
      </div>
    </AdminShell>
  );
}
export function PlatformSettings() {
  return (
    <AdminShell>
      <div className="space-y-3">
        <div><h1 className="text-[18px] font-semibold">Platform Settings</h1><p className="text-[12.5px] text-muted-foreground">Placeholder. Real platform configuration is planned for a later iteration.</p></div>
        <Card className="max-w-xl space-y-2 p-4"><div className="text-[13px] font-semibold">Data persistence</div><p className="text-[12.5px] text-muted-foreground">Account, subscription and audit records are stored in PostgreSQL. Restarting BHRU does not reset them. Migrations are applied explicitly, not during startup.</p></Card>
      </div>
    </AdminShell>
  );
}
