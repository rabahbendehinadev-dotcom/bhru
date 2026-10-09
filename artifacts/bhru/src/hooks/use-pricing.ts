import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import {
  useListGroupServicePricing, getListGroupServicePricingQueryKey, useListCustomerServicePricing, getListCustomerServicePricingQueryKey,
  usePreviewCustomerServicePrice, getPreviewCustomerServicePriceQueryKey, useSaveGroupServicePricing, useRemoveGroupServicePricing,
  useSaveCustomerServicePricing, useRemoveCustomerServicePricing, useUpdateClientGroup, useDeleteUnusedClientGroup, useSelectDefaultClientGroup,
  useCreateClientGroup, useAssignClientGroup,
} from '@workspace/api-client-react';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';
import { subReq } from '@/hooks/use-commerce';

function useOn() { const { session } = useStore(); const { active } = useWorkspacePage(); return { on: session.role === 'subscriber' && active, scope: [session.role, session.subscriberId] as const }; }
const opts = { staleTime: 15000, refetchOnWindowFocus: true, refetchOnMount: true, retry: false } as const;

export function useGroupPricing(id: string, params: { search?: string; page?: number }) {
  const g = useOn();
  return useListGroupServicePricing(id, params, { request: subReq(), query: { queryKey: [...getListGroupServicePricingQueryKey(id, params), ...g.scope], enabled: g.on && !!id, ...opts } });
}
export function useCustomerPricing(id: string, params: { search?: string; page?: number }) {
  const g = useOn();
  return useListCustomerServicePricing(id, params, { request: subReq(), query: { queryKey: [...getListCustomerServicePricingQueryKey(id, params), ...g.scope], enabled: g.on && !!id, ...opts } });
}
export function usePricePreview(id: string, serviceId: string) {
  const g = useOn();
  return usePreviewCustomerServicePrice(id, serviceId, { request: subReq(), query: { queryKey: [...getPreviewCustomerServicePriceQueryKey(id, serviceId), ...g.scope], enabled: g.on && !!id && !!serviceId, staleTime: 0, refetchOnMount: true, retry: false } });
}
/** Any owner change refreshes clients, groups, detail, pricing and previews. */
export function useGroupAdmin() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/client') });
  const o = { request: subReq(), mutation: { onSuccess: refresh } };
  return {
    create: useCreateClientGroup(o), update: useUpdateClientGroup(o), remove: useDeleteUnusedClientGroup(o), makeDefault: useSelectDefaultClientGroup(o),
    assign: useAssignClientGroup(o), saveGroup: useSaveGroupServicePricing(o), removeGroup: useRemoveGroupServicePricing(o),
    saveCustomer: useSaveCustomerServicePricing(o), removeCustomer: useRemoveCustomerServicePricing(o),
  };
}
