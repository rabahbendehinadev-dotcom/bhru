import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import {
  useListManualServices, useCreateManualService, useUpdateManualService, useListServiceGroups, useCreateServiceGroup,
  useListServiceOrders, useGetServiceOrder, useTransitionServiceOrder,
  useGetClientWallet, useGetClientStatement, useMutateClientWallet,
  useListClientGroups, useCreateClientGroup, useAssignClientGroup,
  getListManualServicesQueryKey, getListServiceGroupsQueryKey, getListServiceOrdersQueryKey, getGetServiceOrderQueryKey,
  getGetClientWalletQueryKey, getGetClientStatementQueryKey, getListClientGroupsQueryKey,
} from '@workspace/api-client-react';
import type { ListManualServicesParams, ListServiceOrdersParams, GetClientStatementParams } from '@workspace/api-client-react';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';
import { subReq } from '@/hooks/use-commerce';

const FRESH = 15000;

export type ServiceType = 'imei' | 'server' | 'file' | 'remote';
export interface Requirement { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'select' | 'imei' | 'reference'; required: boolean; options?: string[] }
export interface ManualService {
  id: string; name: string; serviceType: ServiceType; groupId: string | null; groupName?: string | null; description: string; priceUsd: string;
  formattedPrice?: string; estimatedTime?: string | null; active: boolean; displayOrder: number; requirements: Requirement[];
}
export interface Group { id: string; name: string }
export interface OrderDto {
  id: string; reference: string; serviceId: string; customerId: string; serviceName: string; serviceType: ServiceType; status: 'pending' | 'processing' | 'completed' | 'rejected';
  priceUsdUnits: string; currency: string; amountFormatted: string; customerInput: Record<string, string> | null; result?: string | null; rejectionReason?: string | null;
  createdAt: string; updatedAt?: string; completedAt?: string | null; rejectedAt?: string | null; clientName?: string; clientCode?: string; internalNote?: string | null;
}
export interface OrderSummary { totalOrders: number; pending: number; processing: number; completed: number; rejected: number; byType?: Record<string, number> }
export interface Financial {
  availableBalance: string; lockedAmount: string; totalSpent: string; totalCredits: string; totalDebits: string; due: string; creditLimit?: string;
  formattedAvailable: string; formattedLocked: string; formattedTotalSpent: string; formattedTotalCredits: string; formattedTotalDebits: string; formattedDue: string; currency: string;
}
export interface LedgerEntry {
  id: string; type: string; direction: 'credit' | 'debit'; amountUsdUnits: string; formattedAmount: string; formattedBalanceAfter: string; currency: string; description?: string | null;
  referenceType?: string | null; referenceId?: string | null; createdAt: string; method?: string | null; transactionReference?: string | null; internalNote?: string | null; createdByType?: string | null;
}

function useGate() {
  const { session } = useStore();
  const { active } = useWorkspacePage();
  return { scope: [session.role, session.subscriberId] as const, on: session.role === 'subscriber' && active };
}
const opts = { staleTime: FRESH, refetchOnWindowFocus: true, refetchOnMount: true, retry: false } as const;

export interface ServiceParams { serviceType?: string; search?: string; groupId?: string; status?: string; page?: number }
export function useManualServices(p: ServiceParams = {}) {
  const g = useGate();
  const params = p as ListManualServicesParams;
  const q = useListManualServices(params, { request: subReq(), query: { queryKey: [...getListManualServicesQueryKey(params), ...g.scope], enabled: g.on, ...opts } });
  const d = q.data as { data?: ManualService[]; hasMore?: boolean } | undefined;
  return { ...q, rows: d?.data, hasMore: d?.hasMore === true };
}
export function useServiceGroups() {
  const g = useGate();
  const q = useListServiceGroups({ request: subReq(), query: { queryKey: [...getListServiceGroupsQueryKey(), ...g.scope], enabled: g.on, ...opts } });
  return { ...q, rows: ((q.data as { data?: Group[] } | undefined)?.data) };
}
export function useClientGroups() {
  const g = useGate();
  const q = useListClientGroups({ request: subReq(), query: { queryKey: [...getListClientGroupsQueryKey(), ...g.scope], enabled: g.on, ...opts } });
  return { ...q, rows: ((q.data as { data?: Group[] } | undefined)?.data) };
}

export function useServiceMutations() {
  const qc = useQueryClient();
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: getListManualServicesQueryKey() }), qc.invalidateQueries({ queryKey: getListServiceGroupsQueryKey() })]);
  const o = { request: subReq(), mutation: { onSuccess: refresh } };
  return { create: useCreateManualService(o), update: useUpdateManualService(o), createGroup: useCreateServiceGroup(o) };
}
export function useClientGroupMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/client') });
  const o = { request: subReq(), mutation: { onSuccess: refresh } };
  return { create: useCreateClientGroup(o), assign: useAssignClientGroup(o) };
}

export interface OrderParams { customerId?: string; status?: string; serviceType?: string; search?: string; page?: number }
export function useServiceOrders(p: OrderParams) {
  const g = useGate();
  const params = p as ListServiceOrdersParams;
  const q = useListServiceOrders(params, { request: subReq(), query: { queryKey: [...getListServiceOrdersQueryKey(params), ...g.scope], enabled: g.on, ...opts } });
  const d = q.data as { data?: OrderDto[]; hasMore?: boolean; summary?: OrderSummary } | undefined;
  return { ...q, rows: d?.data, hasMore: d?.hasMore === true, summary: d?.summary };
}
export function useServiceOrder(id: string | null) {
  const g = useGate();
  const q = useGetServiceOrder(id ?? '', { request: subReq(), query: { queryKey: [...getGetServiceOrderQueryKey(id ?? ''), ...g.scope], enabled: g.on && !!id, ...opts } });
  return { ...q, order: q.data as unknown as OrderDto | undefined };
}
export function useOrderTransition() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && ((q.queryKey[0] as string).startsWith('/api/service-orders') || (q.queryKey[0] as string).startsWith('/api/clients')) });
  return useTransitionServiceOrder({ request: subReq(), mutation: { onSuccess: refresh } });
}

export function useClientWallet(id: string) {
  const g = useGate();
  const q = useGetClientWallet(id, { request: subReq(), query: { queryKey: [...getGetClientWalletQueryKey(id), ...g.scope], enabled: g.on, ...opts } });
  return { ...q, fin: q.data as unknown as Financial | undefined };
}
export interface StatementParams { page?: number; search?: string; type?: string; direction?: string }
export function useClientStatement(id: string, p: StatementParams) {
  const g = useGate();
  const params = p as GetClientStatementParams;
  const q = useGetClientStatement(id, params, { request: subReq(), query: { queryKey: [...getGetClientStatementQueryKey(id, params), ...g.scope], enabled: g.on, ...opts } });
  const d = q.data as { data?: LedgerEntry[]; hasMore?: boolean } | undefined;
  return { ...q, rows: d?.data, hasMore: d?.hasMore === true };
}
export function useWalletMutation() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('/api/clients') });
  return useMutateClientWallet({ request: subReq(), mutation: { onSuccess: refresh } });
}

export const when = (s?: string | null) => { if (!s) return '-'; const d = new Date(s); return Number.isNaN(+d) ? '-' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
export const newUuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
