import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import {
  useListResellerClients, useGetResellerClient, useUpdateResellerClient, useSetResellerClientStatus, useAddResellerClientNote,
  getListResellerClientsQueryKey, getGetResellerClientQueryKey,
  useListResellerClientActivity, getListResellerClientActivityQueryKey, type ListResellerClientActivityParams,
  type ListResellerClientsParams,
  useGetResellerClientSecurity,useForceLogoutResellerClient,getGetResellerClientSecurityQueryKey,
} from '@workspace/api-client-react';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';
import { subReq } from '@/hooks/use-commerce';

const FRESH = 30000;
export function useClientSecurity(id:string){
  const {session}=useStore(),{active}=useWorkspacePage(),qc=useQueryClient();
  const query=useGetResellerClientSecurity(id,{request:subReq(),query:{
    queryKey:[...getGetResellerClientSecurityQueryKey(id),session.role,session.subscriberId],
    enabled:session.role==='subscriber'&&active,staleTime:FRESH,refetchOnMount:true,refetchOnWindowFocus:true,retry:false,
  }});
  const force=useForceLogoutResellerClient({request:subReq(),mutation:{onSuccess:()=>Promise.all([
    qc.invalidateQueries({queryKey:getGetResellerClientSecurityQueryKey(id)}),
    qc.invalidateQueries({queryKey:[`/api/clients/${id}/activity`]}),
  ])}});
  return {query,force};
}

export function useClientActivity(id:string,params:ListResellerClientActivityParams) {
  const {session}=useStore();
  const {active}=useWorkspacePage();
  return useListResellerClientActivity(id,params,{
    request:subReq(),query:{
      queryKey:[...getListResellerClientActivityQueryKey(id,params),session.role,session.subscriberId],
      enabled:session.role==='subscriber'&&active,staleTime:FRESH,
      refetchOnWindowFocus:true,refetchOnMount:true,retry:false,
    },
  });
}

export function useClientList(params: ListResellerClientsParams) {
  const { session } = useStore();
  const { active } = useWorkspacePage();
  return useListResellerClients(params, {
    request: subReq(),
    query: {
      queryKey: [...getListResellerClientsQueryKey(params), session.role, session.subscriberId],
      enabled: session.role === 'subscriber' && active,
      staleTime: FRESH, refetchOnWindowFocus: true, refetchOnMount: true, retry: false,
    },
  });
}

export function useClientDetail(id: string) {
  const { session } = useStore();
  const { active } = useWorkspacePage();
  return useGetResellerClient(id, {
    request: subReq(),
    query: {
      queryKey: [...getGetResellerClientQueryKey(id), session.role, session.subscriberId],
      enabled: session.role === 'subscriber' && active,
      staleTime: FRESH, refetchOnWindowFocus: true, refetchOnMount: true, retry: false,
    },
  });
}

export function useClientMutations(id: string) {
  const qc = useQueryClient();
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: getGetResellerClientQueryKey(id) }),
    qc.invalidateQueries({ queryKey: getListResellerClientsQueryKey() }),
    qc.invalidateQueries({ queryKey: [`/api/clients/${id}/activity`] }),
    qc.invalidateQueries({ queryKey: getGetResellerClientSecurityQueryKey(id) }),
  ]);
  const opts = { request: subReq(), mutation: { onSuccess: refresh } };
  const update = useUpdateResellerClient(opts);
  const status = useSetResellerClientStatus(opts);
  const note = useAddResellerClientNote(opts);
  return { update, status, note };
}
