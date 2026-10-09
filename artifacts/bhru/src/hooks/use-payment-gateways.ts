import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import {
  useListAdminPaymentGateways, useUpdateAdminPaymentGateway, getListAdminPaymentGatewaysQueryKey,
  useListResellerPaymentGateways, useConfigureResellerPaymentGateway, useValidateResellerPaymentGateway, getListResellerPaymentGatewaysQueryKey,
  useListResellerFundingRequests, getListResellerFundingRequestsQueryKey,
  useGetResellerFundingRequest, getGetResellerFundingRequestQueryKey,
  useListPaymentReviews, getListPaymentReviewsQueryKey,
  useGetAdminPaymentMonitoring, getGetAdminPaymentMonitoringQueryKey,
  useGetFundingReconciliation, getGetFundingReconciliationQueryKey,
} from '@workspace/api-client-react';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';
import { subReq } from '@/hooks/use-commerce';

const FRESH = 30000;
const adminReq = { credentials: 'same-origin' as const, headers: { 'X-BHRU-Auth': 'admin', 'X-BHRU-Request': '1' } };

export function useAdminGateways() {
  const { session } = useStore(), qc = useQueryClient();
  const query = useListAdminPaymentGateways({ request: adminReq, query: {
    queryKey: [...getListAdminPaymentGatewaysQueryKey(), session.role, session.name],
    enabled: session.role === 'admin', staleTime: FRESH, refetchOnMount: true, refetchOnWindowFocus: true, retry: false,
  } });
  const update = useUpdateAdminPaymentGateway({ request: adminReq, mutation: { onSuccess: () => Promise.all([
    qc.invalidateQueries({ queryKey: getListAdminPaymentGatewaysQueryKey() }),
    qc.invalidateQueries({ queryKey: getListResellerPaymentGatewaysQueryKey() }),
  ]) } });
  return { query, update };
}

export function useResellerGateways() {
  const { session } = useStore(), { active } = useWorkspacePage(), qc = useQueryClient();
  const query = useListResellerPaymentGateways({ request: subReq(), query: {
    queryKey: [...getListResellerPaymentGatewaysQueryKey(), session.role, session.subscriberId],
    enabled: session.role === 'subscriber' && active, staleTime: FRESH, refetchOnMount: true, refetchOnWindowFocus: true, retry: false,
  } });
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: getListResellerPaymentGatewaysQueryKey() }),
    qc.invalidateQueries({ queryKey: getListResellerFundingRequestsQueryKey() }),
  ]);
  const configure = useConfigureResellerPaymentGateway({ request: subReq(), mutation: { onSuccess: refresh } });
  const validate = useValidateResellerPaymentGateway({ request: subReq(), mutation: { onSuccess: refresh } });
  return { query, configure, validate };
}

export type FundingFilter = 'ALL' | 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REVIEW_REQUIRED';

export function useAdminPaymentMonitoring() {
  const { session } = useStore();
  return useGetAdminPaymentMonitoring({ request: adminReq, query: {
    queryKey: [...getGetAdminPaymentMonitoringQueryKey(), session.role, session.name],
    enabled: session.role === 'admin', staleTime: FRESH, refetchOnMount: true, refetchOnWindowFocus: true, retry: false,
  } });
}

export function useFundingHistory(page = 1, filter: FundingFilter = 'ALL') {
  const { session } = useStore(), { active } = useWorkspacePage();
  const params = { page, filter };
  return useListResellerFundingRequests(params, { request: subReq(), query: {
    queryKey: [...getListResellerFundingRequestsQueryKey(params), session.role, session.subscriberId],
    enabled: session.role === 'subscriber' && active, staleTime: FRESH, refetchOnMount: true, refetchOnWindowFocus: true, retry: false,
  } });
}

export function useFundingReconciliation(id: string | null) {
  const { session } = useStore(), { active } = useWorkspacePage();
  return useGetFundingReconciliation(id ?? '', { request: subReq(), query: {
    queryKey: [...getGetFundingReconciliationQueryKey(id ?? ''), session.role, session.subscriberId],
    enabled: !!id && session.role === 'subscriber' && active, staleTime: FRESH, refetchOnMount: true, refetchOnWindowFocus: true, retry: false,
  } });
}

export function useFundingDetail(id: string | null) {
  const { session } = useStore(), { active } = useWorkspacePage();
  return useGetResellerFundingRequest(id ?? '', { request: subReq(), query: {
    queryKey: [...getGetResellerFundingRequestQueryKey(id ?? ''), session.role, session.subscriberId],
    enabled: !!id && session.role === 'subscriber' && active, staleTime: FRESH, refetchOnMount: true, refetchOnWindowFocus: true, retry: false,
  } });
}

export function usePaymentReviews(page = 1) {
  const { session } = useStore(), { active } = useWorkspacePage();
  const params = { page };
  return useListPaymentReviews(params, { request: subReq(), query: {
    queryKey: [...getListPaymentReviewsQueryKey(params), session.role, session.subscriberId],
    enabled: session.role === 'subscriber' && active, staleTime: FRESH, refetchOnMount: true, refetchOnWindowFocus: true, retry: false,
  } });
}
