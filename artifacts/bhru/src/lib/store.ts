import { useSyncExternalStore } from 'react';

export type Status = 'PENDING' | 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'REVOKED';
export const STATUSES: Status[] = ['PENDING', 'TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED'];

export interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
  highlights: string;
  enabled: boolean;
}
export interface Subscriber {
  id: string;
  business: string;
  owner: string;
  email: string;
  username: string;
  phone: string;
  country: string;
  plan: string;
  status: Status;
  registeredAt: string;
  expiresAt: string | null;
  lastLogin: string | null;
  domain: string;
  domainStatus: string;
  verification: string;
  notes: string;
  licenceKey: string | null;
  activatedAt: string | null;
}
export interface LogEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
}
export interface Session {
  role: 'admin' | 'subscriber' | null;
  subscriberId: string | null; // subscriber being viewed (own account, or admin preview)
  origin: 'demo' | 'login' | 'register' | null;
}
export interface State {
  subscribers: Subscriber[];
  plans: Plan[];
  logs: LogEntry[];
  session: Session;
}

const KEY = 'bhru.demo.v1';
const DAY = 86400000;
export const iso = (offsetDays: number, hour = 12, min = 0) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};
const ADMIN = 'Super Admin (demo)';

export const COUNTRIES = ['Algeria', 'Morocco', 'Tunisia', 'Egypt', 'Saudi Arabia', 'United Arab Emirates', 'France', 'Turkey', 'Other'];
export const DOMAIN_STATUSES = ['Not configured', 'Pending', 'Connected (simulated)'];
export const VERIFICATION_STATUSES = ['Not verified', 'Pending', 'Verified (simulated)'];

function mk(
  n: number, business: string, owner: string, username: string, country: string, plan: string, status: Status,
  regDays: number, expDays: number | null, loginDays: number | null, domain = '', notes = '', phone = ''
): Subscriber {
  const hasLic = status !== 'PENDING';
  return {
    id: `sub-${n}`, business, owner, username, country, plan, status,
    email: `contact@${username}.example`,
    phone: phone || `+213 555 01${String(10 + n).padStart(2, '0')}`,
    registeredAt: iso(-regDays, 9 + (n % 8), (n * 7) % 60),
    expiresAt: expDays === null ? null : iso(expDays, 23, 59),
    lastLogin: loginDays === null ? null : iso(-loginDays, 8 + (n % 9), (n * 13) % 60),
    domain, domainStatus: domain ? 'Connected (simulated)' : 'Not configured',
    verification: domain ? 'Verified (simulated)' : 'Not verified',
    notes, licenceKey: hasLic ? `BHRU-${String(2000 + n * 37)}-${username.slice(0, 4).toUpperCase()}-${String(7311 + n * 91)}` : null,
    activatedAt: hasLic ? iso(-regDays + 1, 10) : null,
  };
}

function seed(): State {
  const subscribers: Subscriber[] = [
    mk(1, 'Fast Unlock DZ', 'Karim Benali', 'fastunlock', 'Algeria', 'Pro', 'ACTIVE', 120, 365, 0, 'panel.fastunlock.example', 'Serious customer, high order volume. Requested a custom domain.', '+213 555 0123'),
    mk(2, 'Mobile Service', 'Samir Haddad', 'mobileservice', 'Algeria', 'Basic', 'PENDING', 1, null, null),
    mk(3, 'DZ Mobile', 'Yasmine Kaci', 'dzmobile', 'Algeria', 'Pro', 'ACTIVE', 95, 330, 1, 'unlock.dzmobile.example'),
    mk(4, 'Phone Pro', 'Omar Tazi', 'phonepro', 'Morocco', 'Business', 'ACTIVE', 80, 346, 0),
    mk(5, 'GSM World', 'Rachid Mansour', 'gsmworld', 'Tunisia', 'Basic', 'SUSPENDED', 60, 12, 6, '', 'Suspended pending payment follow-up (demo).'),
    mk(6, 'Tech DZ', 'Lina Meziane', 'techdz', 'Algeria', 'Pro', 'ACTIVE', 45, 300, 2),
    mk(7, 'Algerie Unlock', 'Nadir Cherif', 'algerieunlock', 'Algeria', 'Trial', 'TRIAL', 5, 9, 0),
    mk(8, 'Repair Phone', 'Hana Bouzid', 'repairphone', 'Egypt', 'Basic', 'EXPIRED', 200, -9, 14),
    mk(9, 'Smart Repair', 'Adel Ferhat', 'smartrepair', 'Morocco', 'Pro', 'ACTIVE', 30, 324, 3),
    mk(10, 'Unlock Express', 'Mehdi Slimani', 'unlockexpress', 'Tunisia', 'Business', 'ACTIVE', 25, 280, 1, 'server.unlockexpress.example'),
    mk(11, 'Casa Unlock', 'Salma Idrissi', 'casaunlock', 'Morocco', 'Basic', 'REVOKED', 150, -40, 50, '', 'Licence revoked after policy review (demo).'),
    mk(12, 'Nile GSM Hub', 'Tarek Fawzy', 'nilegsm', 'Egypt', 'Basic', 'PENDING', 0, null, null),
  ];
  const plans: Plan[] = [
    { id: 'trial', name: 'Trial', price: 0, description: 'Short evaluation of the full panel', highlights: 'Full panel access, 14 days', enabled: true },
    { id: 'basic', name: 'Basic', price: 29, description: 'Small servers getting started', highlights: 'Core panel, email support', enabled: true },
    { id: 'pro', name: 'Pro', price: 59, description: 'Growing unlock servers', highlights: 'Custom domain, priority support', enabled: true },
    { id: 'business', name: 'Business', price: 99, description: 'High-volume servers', highlights: 'White label, dedicated support', enabled: true },
  ];
  const logs: LogEntry[] = [
    { id: 'l1', at: iso(0, 8, 41), actor: ADMIN, action: 'Seeded demo data', target: 'Platform' },
  ];
  return { subscribers, plans, logs, session: { role: 'subscriber', subscriberId: 'sub-1', origin: 'demo' } };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as State;
      if (p && Array.isArray(p.subscribers) && p.session) return p;
    }
  } catch { /* ignore */ }
  const s = seed();
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  return s;
}

let state: State = load();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) {
      state = load();
      emit();
    }
  });
}

function commit(fn: (s: State) => State) {
  state = fn(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  emit();
}
const log = (s: State, action: string, target: string, actor = ADMIN): State => ({
  ...s,
  logs: [{ id: `l${Date.now()}${Math.random().toString(36).slice(2, 5)}`, at: new Date().toISOString(), actor, action, target }, ...s.logs].slice(0, 200),
});
function patchSub(id: string, patch: Partial<Subscriber>, action: string) {
  commit((s) => {
    const t = s.subscribers.find((x) => x.id === id);
    if (!t) return s;
    return log({ ...s, subscribers: s.subscribers.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, action, t.business);
  });
}

export function useStore(): State {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}

/* ---------- access & derived ---------- */
export const isExpired = (sub: Subscriber) => !sub.expiresAt || new Date(sub.expiresAt).getTime() <= Date.now();
export function effectiveStatus(sub: Subscriber): Status {
  if ((sub.status === 'ACTIVE' || sub.status === 'TRIAL') && isExpired(sub)) return 'EXPIRED';
  return sub.status;
}
export function accessCheck(sub: Subscriber | undefined): { allowed: boolean; status: Status | null; reason: string } {
  if (!sub) return { allowed: false, status: null, reason: 'Account not found.' };
  if (sub.status === 'TRIAL' || sub.status === 'ACTIVE') {
    if (isExpired(sub)) return { allowed: false, status: 'EXPIRED', reason: 'The licence expiration date has passed.' };
    if (!sub.licenceKey) return { allowed: false, status: 'PENDING', reason: 'Your licence is awaiting activation by the BHRU team.' };
    return { allowed: true, status: sub.status, reason: '' };
  }
  const reasons: Record<string, string> = {
    PENDING: 'Your registration is awaiting approval by the BHRU team.',
    SUSPENDED: 'Your subscription has been suspended. Your data is kept safely.',
    EXPIRED: 'Your subscription has expired. Your data is kept safely.',
    REVOKED: 'Your licence has been revoked. Your data is kept safely.',
  };
  return { allowed: false, status: sub.status, reason: reasons[sub.status] };
}

/* ---------- formatting ---------- */
const p2 = (n: number) => String(n).padStart(2, '0');
export const fmtDate = (v: string | null) => { if (!v) return '-'; const d = new Date(v); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtTime = (v: string | null) => { if (!v) return ''; const d = new Date(v); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const fmtDateTime = (v: string | null) => (v ? `${fmtDate(v)} ${fmtTime(v)}` : '-');
export const toInput = (v: string | null) => { if (!v) return ''; const d = new Date(v); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const fromInput = (v: string) => { const d = new Date(v + 'T23:59:00'); return d.toISOString(); };
export const daysLeft = (v: string | null) => (v ? Math.ceil((new Date(v).getTime() - Date.now()) / DAY) : null);

/* ---------- session ---------- */
export const loginAdminDemo = () => commit((s) => ({ ...s, session: { role: 'admin', subscriberId: null, origin: 'demo' } }));
export function loginSubscriber(id: string, origin: Session['origin']) {
  commit((s) => ({
    ...s,
    subscribers: s.subscribers.map((x) => (x.id === id ? { ...x, lastLogin: new Date().toISOString() } : x)),
    session: { role: 'subscriber', subscriberId: id, origin },
  }));
}
export const previewAs = (id: string) => commit((s) => ({ ...s, session: { role: 'admin', subscriberId: id, origin: 'demo' } }));
export const returnToAdmin = () => commit((s) => ({ ...s, session: { role: 'admin', subscriberId: null, origin: 'demo' } }));
export const logout = () => commit((s) => ({ ...s, session: { role: null, subscriberId: null, origin: null } }));
export function findAccount(q: string) {
  const v = q.trim().toLowerCase();
  return state.subscribers.find((x) => x.email.toLowerCase() === v || x.username.toLowerCase() === v);
}

/* ---------- registration ---------- */
export interface RegisterInput { owner: string; business: string; username: string; email: string; phone: string; country: string }
export function registerSubscriber(i: RegisterInput): string {
  const id = `sub-${Date.now()}`;
  const sub: Subscriber = {
    id, business: i.business, owner: i.owner, email: i.email, username: i.username, phone: i.phone, country: i.country,
    plan: state.plans.find((p) => p.id === 'trial')?.name || 'Trial', status: 'PENDING', registeredAt: new Date().toISOString(), expiresAt: null, lastLogin: new Date().toISOString(),
    domain: '', domainStatus: 'Not configured', verification: 'Not verified', notes: '', licenceKey: null, activatedAt: null,
  };
  commit((s) => log({ ...s, subscribers: [sub, ...s.subscribers], session: { role: 'subscriber', subscriberId: id, origin: 'register' } }, 'Registered new subscriber (PENDING)', i.business, i.owner));
  return id;
}
export const usernameTaken = (u: string, e: string) =>
  state.subscribers.some((x) => x.username.toLowerCase() === u.trim().toLowerCase() || x.email.toLowerCase() === e.trim().toLowerCase());

/* ---------- admin actions ---------- */
const newKey = (sub: Subscriber) => sub.licenceKey || `BHRU-${Math.floor(1000 + Math.random() * 9000)}-${sub.username.slice(0, 4).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
export function approve(id: string, days = 14) {
  const t = state.subscribers.find((x) => x.id === id)!;
  patchSub(id, { status: 'TRIAL', plan: state.plans.find((p) => p.id === 'trial')?.name || 'Trial', expiresAt: iso(days, 23, 59), licenceKey: newKey(t), activatedAt: new Date().toISOString() }, `Approved as TRIAL (${days} days)`);
}
export function activate(id: string, plan: string, expiresAt: string) {
  const t = state.subscribers.find((x) => x.id === id)!;
  patchSub(id, { status: 'ACTIVE', plan, expiresAt, licenceKey: newKey(t), activatedAt: new Date().toISOString() }, `Activated ${plan} until ${fmtDate(expiresAt)}`);
}
export const changePlan = (id: string, plan: string) => patchSub(id, { plan }, `Changed plan to ${plan}`);
export const extend = (id: string, expiresAt: string) => patchSub(id, { expiresAt }, `Extended subscription to ${fmtDate(expiresAt)}`);
export const suspend = (id: string) => patchSub(id, { status: 'SUSPENDED' }, 'Suspended (data kept)');
export function reactivate(id: string) {
  const t = state.subscribers.find((x) => x.id === id)!;
  const patch: Partial<Subscriber> = { status: 'ACTIVE', licenceKey: newKey(t), activatedAt: t.activatedAt || new Date().toISOString() };
  if (isExpired(t)) patch.expiresAt = iso(30, 23, 59);
  patchSub(id, patch, 'Reactivated' + (patch.expiresAt ? ' (expiry reset to +30 days)' : ''));
}
export const revoke = (id: string) => patchSub(id, { status: 'REVOKED' }, 'Revoked licence (data kept)');
export const editSub = (id: string, p: Partial<Subscriber>) => patchSub(id, p, 'Edited subscriber details');
export const saveDomain = (id: string, p: Partial<Subscriber>) =>
  commit((s) => log({ ...s, subscribers: s.subscribers.map((x) => (x.id === id ? { ...x, ...p } : x)) }, 'Updated custom domain settings (simulated)', s.subscribers.find((x) => x.id === id)?.business || '', 'Subscriber'));
export const updatePlan = (id: string, p: Partial<Plan>) =>
  commit((s) => {
    const old = s.plans.find((x) => x.id === id)!;
    const next = { ...old, ...p };
    // keep subscriber plan labels consistent when a plan is renamed
    const subs = old.name !== next.name ? s.subscribers.map((x) => (x.plan === old.name ? { ...x, plan: next.name } : x)) : s.subscribers;
    return log({ ...s, subscribers: subs, plans: s.plans.map((x) => (x.id === id ? next : x)) }, `Edited plan ${next.name}`, 'Plans');
  });
export const resetDemo = () => { state = seed(); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } emit(); };
