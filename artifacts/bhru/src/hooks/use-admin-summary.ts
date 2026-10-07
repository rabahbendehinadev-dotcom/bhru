import { useGetAdminSummary, getGetAdminSummaryQueryKey } from '@workspace/api-client-react';
import { useEffect } from 'react';
import { refreshState, useStore } from '@/lib/store';

/** Operational reads only: never grants modules or changes subscriber state. */
export function useAdminSummary() {
  const { session,subscribers,logs }=useStore();
  const query=useGetAdminSummary({
    request:{credentials:'same-origin',headers:{'X-BHRU-Auth':'admin','X-BHRU-Request':'1'}},
    query:{
      queryKey:[...getGetAdminSummaryQueryKey(),session.role,session.name,
        subscribers.map(s=>`${s.id}:${s.status}`).join(','),logs[0]?.id],
      enabled:session.role==='admin',
      staleTime:15000,refetchOnMount:'always',refetchOnWindowFocus:true,refetchInterval:60000,retry:false,
    },
  });
  useEffect(()=>{
    if(session.role==='admin'&&query.dataUpdatedAt)void refreshState();
  },[session.role,query.dataUpdatedAt]);
  return query;
}
