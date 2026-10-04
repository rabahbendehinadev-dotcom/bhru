import { AdminShell } from '@/components/bhru/shells';
import { Card, Badge, Btn, ConfirmDialog } from '@/components/bhru/ui';
import { fmtDateTime, resetDemo, useStore } from '@/lib/store';
import { useState } from 'react';

export function AdminUsers() {
  return (
    <AdminShell>
      <div className="space-y-3">
        <div><h1 className="text-[18px] font-semibold">Admin Users</h1><p className="text-[12.5px] text-muted-foreground">Platform administrators. Management is planned for a later iteration.</p></div>
        <Card><table className="tbl"><thead><tr><th>Name</th><th>Role</th><th>Access</th></tr></thead><tbody><tr><td className="font-semibold">BHRU Super Admin</td><td><Badge tone="violet">Super Admin (demo)</Badge></td><td>Demo access button on the sign-in page</td></tr></tbody></table></Card>
      </div>
    </AdminShell>
  );
}
export function ActivityLogs() {
  const { logs } = useStore();
  return (
    <AdminShell>
      <div className="space-y-3">
        <div><h1 className="text-[18px] font-semibold">Activity Logs</h1><p className="text-[12.5px] text-muted-foreground">Actual demo mutations recorded in this browser.</p></div>
        <Card><div className="scroll-thin overflow-x-auto"><table className="tbl" data-testid="table-logs"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
          <tbody>{logs.map((l) => <tr key={l.id}><td>{fmtDateTime(l.at)}</td><td>{l.actor}</td><td>{l.action}</td><td>{l.target}</td></tr>)}</tbody></table></div></Card>
      </div>
    </AdminShell>
  );
}
export function PlatformSettings() {
  const [c, setC] = useState(false);
  return (
    <AdminShell>
      <div className="space-y-3">
        <div><h1 className="text-[18px] font-semibold">Platform Settings</h1><p className="text-[12.5px] text-muted-foreground">Placeholder. Real platform configuration is planned for a later iteration.</p></div>
        <Card className="max-w-xl space-y-2 p-4"><div className="text-[13px] font-semibold">Demo data</div><p className="text-[12.5px] text-muted-foreground">All data lives in this browser's localStorage. Reset restores the seeded subscribers.</p>
          <Btn v="danger" onClick={() => setC(true)} data-testid="button-reset-demo">Reset demo data</Btn></Card>
        <ConfirmDialog open={c} onClose={() => setC(false)} danger confirmLabel="Reset demo data" title="Reset demo data?" body="This replaces the local demo store with the original seed, including registrations you created." onConfirm={resetDemo} />
      </div>
    </AdminShell>
  );
}
