import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import {
  useListExternalProviders, getListExternalProvidersQueryKey,
  useCreateExternalProvider, useUpdateExternalProvider, useTestExternalProviderDraft,
  useStartExternalProviderJob, useListExternalProviderJobs, getListExternalProviderJobsQueryKey,
  useGetExternalProviderCatalog, getGetExternalProviderCatalogQueryKey,
  useSaveExternalProviderPricing, usePreviewExternalProviderImport, useImportExternalProviderServices,
  type GetExternalProviderCatalogParams,
} from '@workspace/api-client-react';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';
import { subReq } from '@/hooks/use-commerce';

const FRESH = 15000;
const ACTIVE = new Set(['QUEUED', 'RUNNING']);
export const isJobActive = (state: string) => ACTIVE.has(state);

function useGate() {
  const { session } = useStore();
  const { active } = useWorkspacePage();
  return { scope: [session.role, session.subscriberId] as const, on: session.role === 'subscriber' && active };
}

export function useProviders() {
  const g = useGate(), qc = useQueryClient();
  const query = useListExternalProviders({ request: subReq(), query: {
    queryKey: [...getListExternalProvidersQueryKey(), ...g.scope], enabled: g.on,
    staleTime: FRESH, refetchOnMount: 'always', refetchOnWindowFocus: true, refetchOnReconnect: true, retry: false,
    // A valid but unavailable response otherwise stays cached after the backend
    // picks up a newly configured key. Poll only this local read, never providers.
    refetchInterval: q => q.state.data?.storageReady === false ? 5000 : false,
  } });
  const refresh = () => qc.invalidateQueries({ queryKey: getListExternalProvidersQueryKey() });
  const create = useCreateExternalProvider({ request: subReq(), mutation: { gcTime: 0, onSuccess: refresh } });
  const update = useUpdateExternalProvider({ request: subReq(), mutation: { gcTime: 0, onSuccess: refresh } });
  const testDraft = useTestExternalProviderDraft({ request: subReq(), mutation: {gcTime: 0} });
  const startJob = useStartExternalProviderJob({ request: subReq(), mutation: { onSuccess: (_j, v) => {
    void refresh(); void qc.invalidateQueries({ queryKey: getListExternalProviderJobsQueryKey(v.id) });
  } } });
  const savePricing = useSaveExternalProviderPricing({ request: subReq(), mutation: { onSuccess: refresh } });
  return { query, create, update, testDraft, startJob, savePricing };
}

/** Polls while any job is QUEUED/RUNNING; refreshes list + catalog once when work finishes. */
export function useProviderJobs(id: string | null, page = 1) {
  const g = useGate(), qc = useQueryClient();
  const params = { page };
  const query = useListExternalProviderJobs(id ?? '', params, { request: subReq(), query: {
    queryKey: [...getListExternalProviderJobsQueryKey(id ?? '', params), ...g.scope], enabled: !!id && g.on,
    staleTime: 0, refetchOnMount: 'always', retry: false,
    refetchInterval: (q) => (q.state.data?.data.some(j => isJobActive(j.state)) ? 2500 : false),
  } });
  const busy = !!query.data?.data.some(j => isJobActive(j.state));
  const was = useRef(false);
  useEffect(() => {
    if (was.current && !busy && id) {
      void qc.invalidateQueries({ queryKey: getListExternalProvidersQueryKey() });
      void qc.invalidateQueries({ queryKey: [`/api/external-providers/${id}/catalog`] });
    }
    was.current = busy;
  }, [busy, id, qc]);
  return { query, busy };
}

export function useProviderCatalog(id: string | null, params: GetExternalProviderCatalogParams) {
  const g = useGate();
  return useGetExternalProviderCatalog(id ?? '', params, { request: subReq(), query: {
    queryKey: [...getGetExternalProviderCatalogQueryKey(id ?? '', params), ...g.scope], enabled: !!id && g.on,
    staleTime: FRESH, refetchOnWindowFocus: false, retry: false,
  } });
}

export function useProviderImport() {
  const qc = useQueryClient();
  const preview = usePreviewExternalProviderImport({ request: subReq() });
  const run = useImportExternalProviderServices({ request: subReq(), mutation: { onSuccess: (_r, v) => {
    void qc.invalidateQueries({ queryKey: getListExternalProvidersQueryKey() });
    void qc.invalidateQueries({ queryKey: [`/api/external-providers/${v.id}/catalog`] });
    void qc.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith('/api/service') });
  } } });
  return { preview, run };
}
