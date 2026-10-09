import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import {
  useListGroupServiceAccess, getListGroupServiceAccessQueryKey, useListCustomerServiceAccess, getListCustomerServiceAccessQueryKey,
  usePreviewCustomerServiceAccess, getPreviewCustomerServiceAccessQueryKey, useUpdateGroupServiceAccess, useUpdateCustomerServiceAccess,
} from '@workspace/api-client-react';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';
import { subReq } from '@/hooks/use-commerce';

export type AccessParams = { targetType?: 'SERVICE' | 'CATEGORY'; search?: string; page?: number; categoryId?: string; serviceType?: 'imei' | 'server' | 'file' | 'remote' };

function useOn() { const { session } = useStore(); const { active } = useWorkspacePage(); return { on: session.role === 'subscriber' && active, scope: [session.role, session.subscriberId] as const }; }
const opts = { staleTime: 15000, refetchOnWindowFocus: true, refetchOnMount: true, retry: false } as const;

export function useGroupAccess(id: string, params: AccessParams) {
  const g = useOn();
  return useListGroupServiceAccess(id, params, { request: subReq(), query: { queryKey: [...getListGroupServiceAccessQueryKey(id, params), ...g.scope], enabled: g.on && !!id, ...opts } });
}
export function useCustomerAccess(id: string, params: AccessParams) {
  const g = useOn();
  return useListCustomerServiceAccess(id, params, { request: subReq(), query: { queryKey: [...getListCustomerServiceAccessQueryKey(id, params), ...g.scope], enabled: g.on && !!id, ...opts } });
}
export function useAccessPreview(id: string, serviceId: string) {
  const g = useOn();
  return usePreviewCustomerServiceAccess(id, serviceId, { request: subReq(), query: { queryKey: [...getPreviewCustomerServiceAccessQueryKey(id, serviceId), ...g.scope], enabled: g.on && !!id && !!serviceId, staleTime: 0, refetchOnMount: true, retry: false } });
}
export function useAccessAdmin() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/client') });
  const o = { request: subReq(), mutation: { onSuccess: refresh } };
  return { group: useUpdateGroupServiceAccess(o), customer: useUpdateCustomerServiceAccess(o) };
}
