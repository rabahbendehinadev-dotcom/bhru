import { useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetCustomDomains, getGetCustomDomainsQueryKey, useAddCustomDomain, useRemoveCustomDomain,
  useVerifyCustomDomain, useSetPrimaryCustomDomain, useRenewCustomDomainVerification,
  type CustomDomainConfiguration, type CustomDomainRecord,
} from '@workspace/api-client-react';
import { accessCheck, useStore } from '@/lib/store';
import { useWorkspacePage } from '@/components/subscriber/workspace/WorkspacePageContext';

const request = {
  credentials: 'same-origin' as const,
  headers: { 'X-BHRU-Request': '1', 'X-BHRU-Auth': 'subscriber' },
};

export const isActive = (d: CustomDomainRecord) => d.status.toLowerCase() === 'active';
const settled = (d: CustomDomainRecord) => isActive(d) && d.tls_status.toLowerCase() === 'ready' && d.dns_status.toLowerCase() === 'ready';

export function useCustomDomains() {
  const qc = useQueryClient();
  const { session, subscribers } = useStore();
  const { active } = useWorkspacePage();
  const adminPreview = session.role === 'admin';
  const identity = session.role === 'subscriber' ? session.subscriberId : null;
  const access = accessCheck(subscribers.find((s) => s.id === session.subscriberId));
  const queryKey = useMemo(() => [...getGetCustomDomainsQueryKey(), identity ?? 'none'] as const, [identity]);

  const query = useGetCustomDomains({
    request,
    query: {
      queryKey, enabled: !!identity, refetchOnMount: 'always', staleTime: 0, retry: 1,
      refetchInterval: (q) => {
        const d = q.state.data as CustomDomainConfiguration | undefined;
        if (!active) return false;
        // Progressing domains poll fast; settled ones still refresh (server-side revocation / DNS expiry).
        return d?.domains.some((x) => !settled(x)) ? 10_000 : 30_000;
      },
    },
  });

  // `ready` only reports routing infrastructure; management stays available when false.
  // Tenant switch: drop every other tenant's cached domain data.
  useEffect(() => {
    qc.removeQueries({ queryKey: getGetCustomDomainsQueryKey(), predicate: (q) => q.queryKey[1] !== (identity ?? 'none') });
  }, [identity, qc]);

  const onSuccess = (cfg: CustomDomainConfiguration) => { qc.setQueryData(queryKey, cfg); };
  const opts = { request, mutation: { onSuccess } };
  const add = useAddCustomDomain(opts);
  const remove = useRemoveCustomDomain(opts);
  const verify = useVerifyCustomDomain(opts);
  const primary = useSetPrimaryCustomDomain(opts);
  const renew = useRenewCustomDomainVerification(opts);

  const canEdit = !!identity && !adminPreview && access.allowed && !!query.data?.enabled;
  return { identity, adminPreview, access, query, data: query.data, canEdit, add, remove, verify, primary, renew };
}
export type CustomDomainsApi = ReturnType<typeof useCustomDomains>;
