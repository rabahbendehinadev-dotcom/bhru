import { useState } from 'react';
import type { ClientActivityEvent, ListResellerClientActivityParams } from '@workspace/api-client-react';
import { Btn, Card } from '@/components/bhru/ui';
import { EmptyState } from '@/components/subscriber/EmptyState';
import { useClientActivity } from '@/hooks/use-clients';
import { errText } from '@/hooks/use-commerce';

const FILTERS=[['','All'],['ACCOUNT','Account'],['PROFILE','Profile'],['FINANCIAL','Financial'],['ORDER','Orders'],['SECURITY','Security']] as const;
const ROLES={customer:'Customer',subscriber_owner:'Owner',system:'System'} as const;
function Event({event:e}:{event:ClientActivityEvent}){
  return <li className="flex flex-wrap gap-3 p-3 text-[12.5px]">
    <time dateTime={e.createdAt} className="w-36 shrink-0 text-muted-foreground">{new Date(e.createdAt).toLocaleString()}</time>
    <div className="min-w-0 flex-1 break-words">
      <div className="flex flex-wrap items-center gap-2"><strong>{e.summary}</strong>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{e.eventCategory}</span>
        {e.formattedAmount&&<span>{e.direction==='credit'?'+':'−'}{e.formattedAmount}</span>}</div>
      <p className="mt-1 text-muted-foreground">{e.actorDisplay} · {ROLES[e.actorType]}</p>
      <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{e.referenceType.replaceAll('_',' ')} · {e.referenceLabel||e.referenceId}</p>
      {e.changedFields.length>0&&<p className="mt-1 break-words">Changed fields: {e.changedFields.map(f=>f.replaceAll('_',' ')).join(', ')}</p>}
      {e.reason&&<p className="mt-1 whitespace-pre-wrap break-words">Reason: {e.reason}</p>}
      {(e.ipAddress||e.userAgent)&&<details className="mt-1 text-muted-foreground"><summary className="cursor-pointer">Request context</summary>
        {e.ipAddress&&<p>IP: {e.ipAddress}</p>}{e.userAgent&&<p className="break-all">{e.userAgent}</p>}</details>}
    </div>
  </li>;
}
export function ClientActivityPanel({id,legacy}:{id:string;legacy:{id:string;action:string;createdAt:string}[]}){
  const [category,setCategory]=useState<ListResellerClientActivityParams['category']>();
  const [cursors,setCursors]=useState<(string|undefined)[]>([undefined]);
  const q=useClientActivity(id,{category,cursor:cursors.at(-1)});
  const change=(value:string)=>{setCategory(value?value as typeof category:undefined);setCursors([undefined]);};
  return <Card>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
      <h2 className="font-semibold">Client Activity</h2>
      <div className="flex flex-wrap gap-1">{FILTERS.map(([value,label])=><button key={value} type="button" aria-pressed={(category||'')===value}
        onClick={()=>change(value)} className={`rounded px-2 py-1 text-[12px] ${(category||'')===value?'bg-[hsl(var(--brand)/0.12)] text-[hsl(var(--brand))]':'text-muted-foreground hover:bg-muted'}`}>{label}</button>)}</div>
      <Btn disabled={q.isFetching} onClick={()=>void q.refetch()}>Refresh</Btn>
    </div>
    {q.isLoading?<p className="p-3 text-[12px]">Loading activity…</p>:q.isError?<p role="alert" className="p-3 text-[12px] text-danger">{errText(q.error)}</p>:
      q.data?.data.length?<ul className="divide-y">{q.data.data.map(e=><Event key={e.id} event={e}/>)}</ul>:
      <EmptyState compact title="No tracked activity yet" />}
    <div className="flex items-center justify-between gap-2 border-t p-3 text-[12px]">
      <span>Page {cursors.length} · newest first</span><div className="flex gap-2">
        <Btn disabled={cursors.length===1||q.isFetching} onClick={()=>setCursors(c=>c.slice(0,-1))}>Previous</Btn>
        <Btn disabled={!q.data?.nextCursor||q.isFetching} onClick={()=>setCursors(c=>[...c,q.data!.nextCursor!])}>Next</Btn>
      </div>
    </div>
    {legacy.length>0&&<details className="border-t p-3 text-[12px]"><summary className="cursor-pointer font-medium">Legacy-format records (up to 50 recorded entries)</summary>
      <p className="my-2 text-muted-foreground">Original persisted labels only. Structured actor/reference attribution was not recorded. No historical events have been invented.</p>
      <ul className="divide-y">{legacy.map(e=><li key={e.id} className="flex flex-wrap justify-between gap-2 py-2"><span>{e.action}</span><time>{new Date(e.createdAt).toLocaleString()}</time></li>)}</ul>
    </details>}
  </Card>;
}
