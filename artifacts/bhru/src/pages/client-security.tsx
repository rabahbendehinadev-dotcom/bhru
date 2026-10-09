import {useState} from 'react';
import {useClientSecurity} from '@/hooks/use-clients';
import {Card,Btn,ConfirmDialog} from '@/components/bhru/ui';
import {EmptyState} from '@/components/subscriber/EmptyState';
import {errText} from '@/hooks/use-commerce';
const date=(v:string|null|undefined)=>v?new Date(v).toLocaleString():'Not recorded';
export function ClientSecurityPanel({id}:{id:string}){
  const {query:q,force}=useClientSecurity(id),[confirm,setConfirm]=useState(false),[error,setError]=useState('');
  if(q.isLoading)return <Card className="p-4" aria-busy="true">Loading security information…</Card>;
  if(q.isError||!q.data)return <Card className="p-4" role="alert">{errText(q.error)} <Btn onClick={()=>void q.refetch()}>Retry</Btn></Card>;
  const d=q.data;
  const logout=async()=>{setError('');try{await force.mutateAsync({id,data:{}});}catch(e){setError(errText(e));}};
  return <div className="space-y-3">
    <Card className="p-3.5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-[13px] font-semibold">Account security</h2><div className="flex flex-wrap gap-2"><Btn disabled={q.isFetching} onClick={()=>void q.refetch()}>Refresh</Btn><Btn v="danger" disabled={force.isPending||d.activeSessionCount===0} onClick={()=>setConfirm(true)}>Sign out all client sessions</Btn></div></div>
      {error&&<p role="alert" className="mb-2 text-danger">{error}</p>}
      <dl className="grid gap-3 text-[12.5px] sm:grid-cols-2">
        {[['Account',d.enabled?'Active':'Blocked'],['Last successful login',date(d.lastLoginAt)+(d.lastLoginSource==='legacy'?' (legacy timestamp)':'')],
          ['Last login IP',d.lastLoginIp??'Not recorded'],['Active sessions',String(d.activeSessionCount)],['Password last changed',date(d.passwordChangedAt)],
          ['Temporary login lockout',d.lockedUntil?`Until ${date(d.lockedUntil)}`:'None']].map(([k,v])=><div key={k} className="min-w-0 break-words"><dt className="text-muted-foreground">{k}</dt><dd className="mt-1">{v}</dd></div>)}
      </dl><p className="mt-3 text-[11.5px] text-muted-foreground">Temporary failed-login protection is separate from reseller blocking. Passwords and recovery tokens are never available here.</p>
    </Card>
    <Card className="p-3.5"><h2 className="mb-2 text-[13px] font-semibold">Active sessions</h2>{d.sessions.length===0?<EmptyState compact title="No active sessions"/>:<ul className="divide-y">{d.sessions.map(s=><li key={s.id} className="flex flex-wrap justify-between gap-2 py-2 text-[12px]"><div className="min-w-0 break-words"><strong>{s.device}</strong><p>{s.ipAddress??'IP not recorded'} · Created {date(s.createdAt)}</p><p className="text-muted-foreground">Last activity {date(s.lastSeenAt)} · Expires {date(s.expiresAt)}</p></div><span>Active</span></li>)}</ul>}
      {d.activeSessionCount>d.sessions.length&&<p className="text-[11.5px] text-muted-foreground">Showing the most recent {d.sessions.length} of {d.activeSessionCount} sessions.</p>}
    </Card>
    <Card className="p-3.5"><h2 className="mb-2 text-[13px] font-semibold">Recent login history</h2>{d.history.length===0?<EmptyState compact title="No tracked logins yet"/>:<ul className="divide-y">{d.history.map(h=><li key={h.id} className="flex flex-wrap justify-between gap-2 py-2 text-[12px]"><div className="min-w-0 break-words"><strong className="capitalize">{h.result}</strong> · {h.device}<p className="text-muted-foreground">{h.ipAddress??'IP not recorded'}</p></div><time>{date(h.createdAt)}</time></li>)}</ul>}<p className="mt-2 text-[11.5px] text-muted-foreground">Up to 30 recent authentication attempts. Historical login attempts were not reconstructed.</p></Card>
    <ConfirmDialog open={confirm} title="Sign out this client's sessions?" body="All active customer sessions will end. The client can sign in again unless blocked or temporarily locked out." confirmLabel="Sign out all sessions" danger onConfirm={logout} onClose={()=>setConfirm(false)}/>
  </div>;
}
