import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/lib/store';
import {
  useGetCommerceAccess, useGetCommerceResource, useSaveCommerceResource, useArchiveCommerceResource,
  getGetCommerceAccessQueryKey,
  type GetCommerceResourceParams,
} from '@workspace/api-client-react';

export type Resource = 'overview' | 'products' | 'categories' | 'orders' | 'customers' | 'settings' | 'currencies';
type Writable = 'products' | 'categories' | 'settings' | 'orders' | 'currencies';

export const subReq = (extra: { headers?: Record<string, string> } = {}) => ({
  credentials: 'same-origin' as const,
  headers: { 'X-BHRU-Request': '1', 'X-BHRU-Auth': 'subscriber', ...extra.headers },
});
export const adminReq = () => ({
  credentials: 'same-origin' as const,
  headers: { 'X-BHRU-Request': '1', 'X-BHRU-Auth': 'admin' },
});

/** Access flag; refreshed on window focus, on mount and every 60s. */
export function useCommerceAccess() {
  const { session } = useStore();
  return useGetCommerceAccess({
    request: subReq(),
    query: { queryKey: [...getGetCommerceAccessQueryKey(), session.role, session.subscriberId], enabled: session.role === 'subscriber', refetchOnWindowFocus: true, refetchOnMount: 'always', staleTime: 0, refetchInterval: 60000, retry: false },
  });
}
export function useCommerceEnabled() {
  const q = useCommerceAccess();
  return q.data?.enabled === true;
}

export function useCommerceList<T = unknown>(resource: Resource, params?: GetCommerceResourceParams, enabled = true) {
  const { session } = useStore();
  const q = useGetCommerceResource(resource, params, { request: subReq(), query: { queryKey: ['/api/commerce', session.role, session.subscriberId, resource, params ?? {}], enabled: enabled && session.role === 'subscriber', refetchOnWindowFocus: true } });
  return { ...q, rows: (q.data?.data ?? undefined) as T | undefined, hasMore: q.data?.has_more === true };
}

/** Writes always invalidate every commerce resource so views are refetched. */
export function useCommerceWrite() {
  const qc = useQueryClient();
  const refetch = () => qc.invalidateQueries({ predicate: (q) => { const k = q.queryKey; return k[0] === '/api/commerce' || (typeof k[0] === 'string' && k[0].startsWith('/api/commerce/')); } });
  const save = useSaveCommerceResource({ request: subReq(), mutation: { onSuccess: refetch } });
  const archive = useArchiveCommerceResource({ request: subReq(), mutation: { onSuccess: refetch } });
  return {
    save: (resource: Writable, data: Record<string, unknown>) => save.mutateAsync({ resource, data }),
    archive: (resource: 'products' | 'categories' | 'currencies', id: string) => archive.mutateAsync({ resource, id }),
    pending: save.isPending || archive.isPending,
  };
}

export function useRefreshAccessOnFocus() {
  const qc = useQueryClient();
  useEffect(() => {
    const f = () => { void qc.invalidateQueries({ queryKey: getGetCommerceAccessQueryKey() }); };
    window.addEventListener('focus', f);
    return () => window.removeEventListener('focus', f);
  }, [qc]);
}

export async function uploadCommerceAsset(file: File): Promise<{ id: string; url: string }> {
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') throw new Error('Only PNG or JPEG images are accepted.');
  if (file.size === 0) throw new Error('The image file is empty.');
  if (file.size > 5 * 1024 * 1024) throw new Error('The image is larger than 5 MB.');
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const r = await fetch(`${base}/api/commerce/assets`, { ...subReq({ headers: { 'Content-Type': file.type } }), method: 'POST', body: file });
  if (!r.ok) {
    let m = 'Image upload failed.';
    try { const j = await r.json(); if (j?.error || j?.message) m = String(j.error ?? j.message); } catch { /* keep default */ }
    throw new Error(m);
  }
  return r.json();
}

/** Minor-unit string to display decimal, all supported currencies use two decimals. */
export const minorToDecimal = (m: string | null | undefined) => {
  if (m == null || m === '') return '';
  const neg = m.startsWith('-'); const d = (neg ? m.slice(1) : m).padStart(3, '0');
  return `${neg ? '-' : ''}${d.slice(0, -2)}.${d.slice(-2)}`;
};
export const money = (m: string, cur: string) => {
  const [i, f] = minorToDecimal(m).split('.');
  return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${f} ${cur}`;
};
export const slugOf = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
export const newId = () => crypto.randomUUID();
export const errText = (e: unknown) => e instanceof Error ? e.message : 'Request failed. Please try again.';
