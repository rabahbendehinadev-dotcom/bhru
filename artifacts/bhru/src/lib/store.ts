import { useSyncExternalStore } from 'react';
import {
  getPlatformState, registerAccount, loginAccount, logoutAccount, manageSubscription,
  editSubscriber, createPlan as createPlanRequest, editPlan, getSubscriberPanel,
  type PlatformState, type Subscriber, type Plan, type SessionState, type LogEntry,
  type AccountInput, type PlanInput, type SubscriberUpdate, type SubscriptionAction,
} from '@workspace/api-client-react';
export type { Subscriber, Plan, LogEntry };
export type Session = SessionState;
export type Status = Subscriber['status'];
export type State = PlatformState & { loading: boolean; error: string };
export const STATUSES: Status[] = ['PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED'];
export const COUNTRIES = ['Algeria', 'Morocco', 'Tunisia', 'Egypt', 'Saudi Arabia', 'United Arab Emirates', 'France', 'Turkey', 'Other'];
const DAY = 86400000;
const empty: PlatformState = { subscribers: [], plans: [], logs: [], admins: [], session: { role: null, subscriberId: null, origin: null, name: '' } };
let state: State = { ...empty, loading: true, error: '' };
let epoch = 0, refreshing = false;
const listeners = new Set<() => void>();
const options = { credentials: 'same-origin' as const, headers: { 'X-BHRU-Request': '1' } };
const emit = () => listeners.forEach(l => l());
export const errorMessage = (e: unknown) => e instanceof Error ? e.message : 'Request failed. Please try again.';
function receive(data: PlatformState) {
  const previewId = state.session.role === 'admin' && data.session.role === 'admin' ? state.session.subscriberId : null;
  state = { ...data, session: previewId && data.subscribers.some(s => s.id === previewId) ? { ...data.session, subscriberId: previewId } : data.session, loading: false, error: '' };
  emit();
}
export async function refreshState() {
  if (refreshing) return;
  refreshing = true;
  const version = epoch;
  try {
    const data = await getPlatformState(options);
    if (version === epoch) receive(data);
  } catch (error) {
    if (version !== epoch) return;
    if ((error as { status?: number }).status === 401) state = { ...empty, loading: false, error: '' };
    else state = { ...state, loading: false, error: errorMessage(error) };
    emit();
  } finally { refreshing = false; }
}
async function mutation(work: () => Promise<PlatformState>) {
  epoch++;
  receive(await work());
}
export function useStore(): State {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}
void refreshState();
// Other browsers/admins change shared records: refresh on focus and periodically.
window.addEventListener('focus', () => { void refreshState(); });
setInterval(() => { if (state.session.role && !document.hidden) void refreshState(); }, 5000);

export const iso = (offsetDays: number, hour = 12, min = 0) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  d.setHours(hour, min, 0, 0); return d.toISOString();
};
export const isExpired = (sub: Subscriber) => !sub.expiresAt || +new Date(sub.expiresAt) <= Date.now();
export const effectiveStatus = (sub: Subscriber): Status => sub.status;
// This value comes from the server, never from an editable browser licence store.
export const accessCheck = (sub: Subscriber | undefined) => ({
  allowed: !!sub?.allowed, status: sub?.status ?? null, reason: sub?.accessReason || 'Account not found.',
});
export const verifyPanelAccess = (id: string) => getSubscriberPanel(id, options);
const p2 = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (v: string | null) => { if (!v) return '-'; const d = new Date(v); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtTime = (v: string | null) => { if (!v) return ''; const d = new Date(v); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const fmtDateTime = (v: string | null) => v ? `${fmtDate(v)} ${fmtTime(v)}` : '-';
export const toInput = (v: string | null) => { if (!v) return ''; const d = new Date(v); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const fromInput = (v: string) => new Date(v + 'T23:59:00').toISOString();
export const daysLeft = (v: string | null) => v ? Math.ceil((+new Date(v) - Date.now()) / DAY) : null;

export async function login(identifier: string, password: string) {
  await mutation(() => loginAccount({ identifier, password }, options));
  return state.session.role;
}
export async function registerSubscriber(input: AccountInput) {
  await mutation(() => registerAccount(input, options));
}
export async function logout() {
  epoch++;
  await logoutAccount(options);
  state = { ...empty, loading: false, error: '' };
  emit();
}
// Admin preview changes presentation only. Every API request still checks the
// authenticated server-side admin role; this never changes authentication.
export function previewAs(id: string) {
  if (state.session.role !== 'admin') throw new Error('Administrator access required.');
  state = { ...state, session: { ...state.session, subscriberId: id } }; emit();
}
export function returnToAdmin() {
  if (state.session.role !== 'admin') return;
  state = { ...state, session: { ...state.session, subscriberId: null } }; emit();
}
const planId = (name: string) => {
  const plan = state.plans.find(p => p.name === name);
  if (!plan) throw new Error('Select an available plan.');
  return plan.id;
};
const action = (id: string, data: SubscriptionAction) => mutation(() => manageSubscription(id, data, options));
export function approve(id: string) {
  const available = state.plans.filter(p => p.enabled);
  const plan = available.find(p => p.name.toLowerCase() === 'trial') || available[0];
  if (!plan) return Promise.reject(new Error('Create an enabled plan before approving subscribers.'));
  return action(id, { action: 'approve', planId: plan.id });
}
export const activate = (id: string, name: string, expiresAt: string) => action(id, { action: 'activate', planId: planId(name), expiresAt });
export const changePlan = (id: string, name: string) => action(id, { action: 'plan', planId: planId(name) });
export const extend = (id: string, expiresAt: string) => action(id, { action: 'extend', expiresAt });
export const suspend = (id: string) => action(id, { action: 'suspend' });
export const reactivate = (id: string) => action(id, { action: 'reactivate' });
export const revoke = (id: string) => action(id, { action: 'revoke' });
export const editSub = (id: string, input: SubscriberUpdate) => mutation(() => editSubscriber(id, input, options));
export const updatePlan = (id: string, input: PlanInput) => mutation(() => editPlan(id, input, options));
export const createPlan = (input: PlanInput) => mutation(() => createPlanRequest(input, options));