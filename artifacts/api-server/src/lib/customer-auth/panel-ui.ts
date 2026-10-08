import { createHash } from 'node:crypto';
import { escapeHTML as e } from '../public-site/safety';
import type { PublicSiteModel } from '../public-site/model';
import type { CustomerProfile as Profile } from './types';

export type PanelPage = 'dashboard' | 'services' | 'orders' | 'wallet' | 'transactions' | 'announcements' | 'profile' | 'security';
export const PANEL_PAGES: PanelPage[] = ['dashboard', 'services', 'orders', 'wallet', 'transactions', 'announcements', 'profile', 'security'];
const TITLES: Record<PanelPage, string> = { dashboard: 'Dashboard', services: 'Services', orders: 'My orders', wallet: 'Wallet', transactions: 'Transactions', announcements: 'Announcements', profile: 'Profile', security: 'Security' };
export const panelTitle = (p: PanelPage): string => TITLES[p];

const localPath = (v: unknown): string | null => (typeof v === 'string' && /^\/(?!\/)[^\s"'<>\\]*$/.test(v) ? v : null);

/** Base path of the panel, derived from accountHref (/{slug}/customer/account -> /{slug}/customer). */
export function panelBase(m: PublicSiteModel): string {
  const a = localPath(m.customerAccess?.accountHref) ?? '';
  return a.replace(/\/(account|dashboard)\/?$/, '') || '';
}

export const PANEL_STYLES_BASE = `
body{--bg:#f6f8fc;--card:#fff;--ink:#142033;--muted:#586579;--line:#e1e7ef;background:var(--bg);color:var(--ink)}
.pn-nav{flex-wrap:wrap;overflow:visible}.pn-nav a{padding:8px 12px;min-height:40px;font-size:13px}.pn-nav a:focus-visible,.pn-btn:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.pn-hero{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 18px}.pn-btn{text-decoration:none}.pn-card.accent{border-left:4px solid var(--accent)}.pn-h{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.pn-ann{display:block;padding:10px 12px;border-radius:10px;margin:0 0 8px;border:1px solid var(--line);overflow-wrap:anywhere}
.pn{width:min(1120px,100%);margin:0 auto;padding:28px 18px 72px;min-width:0}
.pn h1{font-size:clamp(24px,5vw,32px);margin:0 0 4px}.pn h2{font-size:18px;margin:0 0 12px}.pn .pn-sub{color:var(--muted);margin:0 0 18px}
.pn-nav{display:flex;flex-wrap:wrap;gap:6px;overflow:visible;margin:0 0 22px;padding:0 0 4px;border-bottom:1px solid var(--line)}
.pn-nav a{white-space:nowrap;padding:12px 16px;min-height:44px;display:inline-flex;align-items:center;font-weight:700;font-size:14px;color:var(--muted);border-bottom:3px solid transparent}
.pn-nav a[aria-current=page]{color:var(--ink);border-color:var(--accent)}
.pn-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin:0 0 22px}
.pn-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px;min-width:0;box-shadow:var(--sh)}
.pn-k{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.pn-v{font-size:22px;font-weight:800;margin-top:6px;overflow-wrap:anywhere}
.pn-bar{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 16px}
.pn-bar input,.pn-bar select,.pn-f input,.pn-f select,.pn-f textarea{min-height:44px;padding:0 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font:inherit;max-width:100%}
.pn-bar input{flex:1;min-width:180px}.pn-f textarea{padding:10px 12px;min-height:90px;width:100%}.pn-f input,.pn-f select{width:100%}
.pn-btn{min-height:44px;padding:0 18px;border-radius:12px;border:1.5px solid var(--accent);background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.pn-btn.alt{background:transparent;color:var(--ink);border-color:var(--ink)}.pn-btn:disabled{opacity:.5;cursor:not-allowed}
.pn-svc{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}.pn-svc .pn-card{display:flex;flex-direction:column;gap:8px}.pn-svc p{margin:0;color:var(--muted);font-size:14px}
.pn-tag{display:inline-block;padding:2px 10px;border-radius:99px;border:1px solid var(--line);font-size:12px;font-weight:700;text-transform:uppercase}
.pn-tag.s-pending{border-color:#b7791f;color:#b7791f}.pn-tag.s-processing{border-color:#2b6cb0;color:#2b6cb0}.pn-tag.s-completed{border-color:#2f855a;color:#2f855a}.pn-tag.s-rejected{border-color:#b42318;color:#b42318}
.pn-tw{overflow-x:auto}.pn-tbl{width:100%;border-collapse:collapse;font-size:14px}.pn-tbl th{text-align:left;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}.pn-tbl td{padding:12px;border-bottom:1px solid var(--line);vertical-align:top}
.pn-tbl a{font-weight:700;text-decoration:underline}.pos{color:#2f855a;font-weight:700}.neg{color:#b42318;font-weight:700}
.pn-f{display:grid;gap:14px;max-width:560px}.pn-f label{font-weight:700;font-size:14px;display:block;margin-bottom:6px}.pn-f .req{color:#b42318}
.pn-msg{padding:12px 14px;border-radius:12px;border:1px solid var(--line);background:var(--bg);font-size:14px;margin:0 0 14px;overflow-wrap:anywhere}.pn-msg.err{border-color:#b42318;color:#b42318}.pn-msg.warn{border-color:#b7791f}
.pn-pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}.pn-pager{display:flex;justify-content:space-between;align-items:center;margin-top:16px;gap:10px}
.pn-skel{height:84px;border-radius:16px;background:var(--line);opacity:.5}
.pn-two{display:grid;gap:18px;grid-template-columns:minmax(0,1fr)}@media(min-width:900px){.pn-two{grid-template-columns:minmax(0,3fr) minmax(0,2fr)}}
`;

export const PANEL_STYLES_V2 = `
.pn{width:min(1400px,100% - 32px);padding:18px 0 48px;font-size:14px}
.pn h1{font-size:clamp(20px,3vw,24px);font-weight:600;margin:0 0 2px}.pn h2{font-size:16px;font-weight:600;margin:0 0 10px}.pn .pn-sub{font-size:13px;margin:0 0 14px}
.pn-card{border-radius:10px;padding:14px;box-shadow:0 1px 2px rgba(20,32,51,.05)}.pn-btn{min-height:36px;padding:0 14px;font-size:13px;font-weight:600;border-radius:8px}
.pn-k{font-size:12px;font-weight:500;letter-spacing:0;text-transform:none}.pn-v{font-size:22px;font-weight:600;margin-top:4px}.pn-tag{font-size:11px;font-weight:600;padding:1px 8px}
.pn-tbl{font-size:13px}.pn-tbl th{font-size:12px;font-weight:600;padding:8px 10px}.pn-tbl td{padding:9px 10px;vertical-align:middle}.pn-tbl a{font-weight:600}
.pn-grid{gap:10px;margin:0 0 14px}.pn-msg{font-size:13px;padding:9px 12px}
.pd{display:grid;gap:12px;grid-template-columns:minmax(0,1fr)}.pd>*{min-width:0}
@media(min-width:1024px){.pn[data-page=dashboard]{width:min(1320px,100% - 32px)}.pd{grid-template-columns:minmax(0,7fr) minmax(0,3fr);align-items:stretch}.pd>.pd-main{grid-column:1}.pd>.pd-ann{grid-column:2;grid-row:1/span 3;align-self:start;display:flex;flex-direction:column;min-height:0}.pd>.pd-ann .pd-anl{max-height:360px;min-height:0}.pd>.pd-main:last-child{grid-row:4}}
.pd-bal{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;border-left:3px solid var(--accent)}
.pd-bv{font-size:28px;font-weight:700;line-height:1.2;margin:2px 0 10px}.pd-dv{font-size:22px;font-weight:600;color:var(--muted);margin-top:2px}.pd-br{padding-left:16px;border-left:1px solid var(--line);min-width:120px}
.pd-acts{display:flex;gap:8px;flex-wrap:wrap}.pd-btn{text-decoration:none}
.pd>.pd-grp{padding-block:6px}.pd-grp h2{font-weight:600;color:var(--muted);margin:0 0 6px}
.pd-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.pd-cols.pd-c5{grid-template-columns:repeat(5,minmax(0,1fr))}
.pd-c{display:flex;gap:9px;align-items:center;padding:2px 12px;border-left:1px solid var(--line);min-width:0}.pd-c:first-child{border-left:0;padding-left:0}
.pd-c b{display:block;font-size:22px;font-weight:600;overflow-wrap:anywhere}.pd-c span.l{font-size:12px;color:var(--muted)}
.pd-i{flex:none;width:26px;height:26px;border-radius:6px;display:grid;place-items:center;background:var(--bg);color:var(--muted);border:1px solid var(--line)}
.pd-c.ok .pd-i{color:#2f855a}.pd-c.bad .pd-i{color:#b42318}.pd-c.warn .pd-i{color:#b7791f}.pd-c.info .pd-i{color:#2b6cb0}
@media(max-width:640px){.pd-cols.pd-c5{grid-template-columns:repeat(2,minmax(0,1fr));row-gap:10px}.pd-cols.pd-c5 .pd-c:nth-child(odd){border-left:0;padding-left:0}.pd-cols.pd-c3{grid-template-columns:1fr;row-gap:8px}.pd-cols.pd-c3 .pd-c{border-left:0;padding-left:0}.pd-br{border-left:0;padding-left:0}}
.pd-head{display:flex;justify-content:space-between;align-items:center;margin:0 0 8px}.pd-head h2{margin:0}.pd-head a{font-size:13px;font-weight:600;color:var(--accent-text,var(--ink));text-decoration:underline}
.pd-anl{max-height:300px;overflow-y:auto;display:block}.pd .pn-ann{background:transparent!important;color:var(--ink)!important;margin:0;padding:8px 2px;font-size:13px;border:0;border-bottom:1px solid var(--line);border-radius:0}.pd .pn-ann:last-child{border-bottom:0}.pd .pn-ann a{text-decoration:underline}
.pd-empty{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;padding:8px 10px;border:1px dashed var(--line);border-radius:8px;font-size:13px;color:var(--muted)}
`;
export const PANEL_SCRIPT = String.raw`(() => {
  const root = document.querySelector('[data-panel]');
  if (!root) return;
  const API = root.dataset.api, BASE = root.dataset.base, PAGE = root.dataset.page, LOGIN = root.dataset.login;
  const out = document.getElementById('pn-out');
  const H = { 'Content-Type': 'application/json', 'X-BHRU-Customer-Request': '1' };
  const uuid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16); }));
  const h = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(k => { if (k === 'text') n.textContent = String(attrs[k]); else if (k === 'class') n.className = attrs[k]; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : String(attrs[k])); });
    (kids || []).forEach(c => { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  };
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  const mount = (...nodes) => { clear(out); nodes.forEach(n => n && out.appendChild(n)); };
  const msg = (t, cls) => h('div', { class: 'pn-msg ' + (cls || ''), role: cls === 'err' ? 'alert' : 'status', text: t });
  const fmtDate = s => { const d = new Date(s); return Number.isNaN(+d) ? '-' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
  const qs = o => { const u = new URLSearchParams(); Object.keys(o).forEach(k => { if (o[k] !== '' && o[k] != null) u.set(k, o[k]); }); const s = u.toString(); return s ? '?' + s : ''; };
  const params = () => Object.fromEntries(new URLSearchParams(location.search));
  const nav = (path, o) => { location.assign(BASE + path + qs(o || {})); };
  class Denied extends Error {}
  async function call(path, method, body) {
    const res = await fetch(API + path, { method: method || 'GET', cache: 'no-store', credentials: 'same-origin', headers: H, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) { location.assign(LOGIN); throw new Denied('Redirecting to login'); }
    let d = {}; try { d = await res.json(); } catch (_) {}
    if (res.status === 403) throw new Denied(d.error || 'Your account is blocked from using this panel. Please contact the store.');
    if (!res.ok) { const e = new Error(d.error || 'Request failed. Please try again.'); e.fields = d.fields; e.data = d; e.http = true; throw e; }
    return d;
  }
  const skeleton = () => mount(h('div', { class: 'pn-skel', 'aria-busy': 'true' }), h('div', { class: 'pn-skel', style: 'margin-top:14px' }));
  const failure = (err, retry) => mount(msg(err.message || 'Something went wrong.', 'err'), err instanceof Denied ? null : h('button', { class: 'pn-btn alt', type: 'button', text: 'Try again', onclick: retry }));
  const guard = fn => async () => { skeleton(); try { await fn(); } catch (err) { if (!(err instanceof Denied && err.message === 'Redirecting to login')) failure(err, guard(fn)); } };
  const stat = (k, v) => h('div', { class: 'pn-card' }, [h('div', { class: 'pn-k', text: k }), h('div', { class: 'pn-v', text: v == null ? '-' : v })]);
  const tag = s => h('span', { class: 'pn-tag s-' + s, text: s });
  const table = (cols, rows) => h('div', { class: 'pn-tw' }, [h('table', { class: 'pn-tbl' }, [h('thead', {}, [h('tr', {}, cols.map(c => h('th', { text: c })))]), h('tbody', {}, rows)])]);
  const pager = (p, hasMore, to) => h('div', { class: 'pn-pager' }, [
    h('button', { class: 'pn-btn alt', type: 'button', text: 'Previous', disabled: p <= 1, onclick: () => to(p - 1) }),
    h('span', { text: 'Page ' + p }),
    h('button', { class: 'pn-btn alt', type: 'button', text: 'Next', disabled: !hasMore, onclick: () => to(p + 1) })]);
  const filterBar = (fields, apply, submitLabel) => {
    const form = h('form', { class: 'pn-bar', role: 'search' }, fields.concat([h('button', { class: 'pn-btn', type: 'submit', text: submitLabel || 'Apply' })]));
    form.addEventListener('submit', ev => { ev.preventDefault(); apply(Object.fromEntries(new FormData(form).entries())); });
    return form;
  };
  const input = (name, ph, val) => h('input', { name, type: 'search', placeholder: ph, 'aria-label': ph, value: val || '', maxlength: 100 });
  const select = (name, label, opts, val) => { const s = h('select', { name, 'aria-label': label }, opts.map(o => h('option', { value: o[0], text: o[1] }))); s.value = val || ''; return s; };
  const ico = path => { const s = h('span', { class: 'pd-i', 'aria-hidden': 'true' }); s.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>'; return s; };
  const setHdr = f => { const b = document.querySelector('[data-hdr-bal]'), c = document.querySelector('[data-hdr-cur]'); if (!b) return; const cur = f && (f.accountCurrency || f.currency); if (!f || f.formattedAvailable == null) { b.textContent = 'Balance unavailable'; if (c) c.textContent = ''; return; } b.textContent = String(f.formattedAvailable); if (c) c.textContent = 'Available balance' + (cur ? ' · ' + cur : ''); };
  const ZERO = x => !x || /^0+(\.0+)?$/.test(String(x));

  const pages = {
    async dashboard() {
      const d = await call('/panel');
      const f = d.financial || {}, s = d.orderSummary || {}, rows = d.recentOrders || [];
      setHdr(f);
      const cell = (k, v, ic, cls) => h('div', { class: 'pd-c ' + (cls || '') }, [ico(ic), h('div', {}, [h('span', { class: 'l', text: k }), h('b', { text: v == null ? '-' : v })])]);
      const bal = h('div', { class: 'pn-card pd-main pd-bal' }, [h('div', { class: 'pd-bl' }, [h('div', { class: 'pn-k', text: 'Available balance' }), h('div', { class: 'pd-bv', text: f.formattedAvailable == null ? '-' : String(f.formattedAvailable) }),
        ZERO(f.availableBalance) ? h('div', { class: 'pn-k', text: 'Balance is empty. Funds are added by your reseller.' }) : null,
        h('div', { class: 'pd-acts' }, [h('a', { class: 'pn-btn pd-btn', href: BASE + '/wallet#add-funds', text: 'Add Funds' }), h('a', { class: 'pn-btn alt pd-btn', href: BASE + '/services', text: 'Place New Order' })])]),
        h('div', { class: 'pd-br' }, [h('div', { class: 'pn-k', text: 'Due / Credit' }), h('div', { class: 'pd-dv', text: f.formattedDue == null ? '-' : String(f.formattedDue) })])]);
      const met = h('div', { class: 'pn-card pd-main pd-grp' }, [h('h2', { text: 'Financial summary' }), h('div', { class: 'pd-cols pd-c3' }, [cell('Total credits', f.formattedTotalCredits, '<path d="M12 5v14M5 12h14"/>'), cell('Locked balance', f.formattedLocked, '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'), cell('Total spent', f.formattedTotalSpent, '<path d="M4 18l5-6 4 3 7-9"/>')])]);
      const stats = h('div', { class: 'pn-card pd-main pd-grp' }, [h('h2', { text: 'Order status' }), h('div', { class: 'pd-cols pd-c5' }, [cell('Total', s.totalOrders, '<path d="M7 3h8l4 4v14H7z"/><path d="M14 3v5h5"/>', 'info'), cell('Completed', s.completed, '<circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>', 'ok'), cell('Processing', s.processing, '<path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5"/>', 'info'), cell('Pending', s.pending, '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>', 'warn'), cell('Rejected', s.rejected, '<circle cx="12" cy="12" r="8"/><path d="M9 9l6 6M15 9l-6 6"/>', 'bad')])]);
      const an = (d.announcements || []).slice(0, 8);
      const ann = h('div', { class: 'pn-card pd-ann' }, [h('div', { class: 'pd-head' }, [h('h2', { text: 'Announcements' }), h('a', { href: BASE + '/announcements', text: 'View all announcements' })]), an.length ? h('div', { class: 'pd-anl' }, an.map(annNode)) : h('p', { class: 'pn-k', text: 'No announcements right now.' })]);
      const rec = h('div', { class: 'pn-card pd-main' }, [h('div', { class: 'pd-head' }, [h('h2', { text: 'Recent orders' }), h('a', { href: BASE + '/orders', text: 'View all orders' })]),
        rows.length === 0 ? h('div', { class: 'pd-empty' }, [h('span', { text: 'No orders yet.' }), h('a', { class: 'pn-btn pd-btn', href: BASE + '/services', text: 'Browse Services' })]) :
        table(['Order ID', 'Service', 'Amount', 'Status', 'Date', 'Action'], rows.map(o => h('tr', {}, [h('td', { text: o.reference }), h('td', { text: o.serviceName }), h('td', { text: o.amountFormatted }), h('td', {}, [tag(o.status)]), h('td', { text: fmtDate(o.createdAt) }), h('td', {}, [h('a', { href: BASE + '/orders?id=' + encodeURIComponent(o.id), text: 'View' })])])))]);
      mount(h('div', { class: 'pd' }, [bal, met, stats, ann, rec]));
    },

    async announcements() {
      const d = await call('/panel/announcements');
      const list = d.data || [];
      mount(list.length ? h('div', { class: 'pn-card' }, list.map(annNode)) : h('div', { class: 'pn-card' }, [h('p', { text: 'There are no active announcements at the moment.' })]));
    },

    async services() {
      const p = params();
      if (p.service) return serviceDetail(p.service);
      const page = Math.max(1, parseInt(p.page || '1', 10) || 1);
      const d = await call('/panel/services' + qs({ page, search: p.search, serviceType: p.serviceType, groupId: p.groupId }));
      const groups = [['', 'All groups']].concat((d.groups || []).map(g => [g.id, g.name]));
      const bar = filterBar([input('search', 'Search services', p.search), select('serviceType', 'Service type', [['', 'All types'], ['imei', 'IMEI'], ['server', 'Server'], ['file', 'File'], ['remote', 'Remote']], p.serviceType), select('groupId', 'Group', groups, p.groupId)],
        v => nav('/services', v), 'Filter');
      const list = d.data || [];
      const grid = list.length === 0 ? msg('No services match your filters.') : h('div', { class: 'pn-svc' }, list.map(sv => h('div', { class: 'pn-card' }, [
        h('span', { class: 'pn-tag', text: sv.serviceType }), h('h2', { text: sv.name, style: 'margin:0' }), sv.groupName ? h('p', { text: sv.groupName }) : null,
        sv.description ? h('p', { text: sv.description }) : null, h('div', { class: 'pn-v', text: sv.formattedPrice }), sv.estimatedTime ? h('p', { text: 'Delivery: ' + sv.estimatedTime }) : null,
        h('a', { class: 'pn-btn', href: BASE + '/services?service=' + encodeURIComponent(sv.id), text: 'Order' })])));
      mount(bar, grid, pager(page, d.hasMore, n => nav('/services', Object.assign({}, p, { page: n }))));
    },

    async orders() {
      const p = params();
      if (p.id) return orderDetail(p.id, p.placed);
      const page = Math.max(1, parseInt(p.page || '1', 10) || 1);
      const d = await call('/panel/orders' + qs({ page, search: p.search, status: p.status, serviceType: p.serviceType }));
      const bar = filterBar([input('search', 'Search reference or service', p.search), select('status', 'Status', [['', 'All statuses'], ['pending', 'Pending'], ['processing', 'Processing'], ['completed', 'Completed'], ['rejected', 'Rejected']], p.status),
        select('serviceType', 'Service type', [['', 'All types'], ['imei', 'IMEI'], ['server', 'Server'], ['file', 'File'], ['remote', 'Remote']], p.serviceType)], v => nav('/orders', v), 'Filter');
      const rows = d.data || [];
      mount(bar, rows.length === 0 ? msg('No orders found.') : h('div', { class: 'pn-card' }, [table(['Reference', 'Service', 'Amount', 'Status', 'Date'], rows.map(o => h('tr', {}, [h('td', {}, [h('a', { href: BASE + '/orders?id=' + encodeURIComponent(o.id), text: o.reference })]), h('td', { text: o.serviceName }), h('td', { text: o.amountFormatted }), h('td', {}, [tag(o.status)]), h('td', { text: fmtDate(o.createdAt) })])))]),
        pager(page, d.hasMore, n => nav('/orders', Object.assign({}, p, { page: n }))));
    },

    async wallet() { return statementPage('/wallet', true); },
    async transactions() { return statementPage('/transactions', false); },
  };

  const SAFE = v => typeof v === 'string' && (/^\/(?!\/)[^\s"'<>\\]*$/.test(v) || /^https:\/\/[^\s"'<>\\]+$/.test(v) || /^mailto:[^\s<>"'?#]+@[^\s<>"'?#]+$/i.test(v) || /^tel:\+?[0-9()\-. ]{3,30}$/i.test(v));
  const annNode = a => { const st = 'background:' + (/^#[0-9a-fA-F]{3,8}$/.test(a.background || '') ? a.background : 'transparent') + ';color:' + (/^#[0-9a-fA-F]{3,8}$/.test(a.color || '') ? a.color : 'inherit'); const t = (a.icon ? a.icon + ' ' : '') + a.text; return h('div', { class: 'pn-ann', style: st }, [SAFE(a.href) ? h('a', { href: a.href, text: t }) : h('span', { text: t })]); };

  async function statementPage(path, wallet) {
    const p = params();
    const page = Math.max(1, parseInt(p.page || '1', 10) || 1);
    const d = await call('/panel/statement' + qs({ page, search: p.search, type: p.type, direction: p.direction }));
    const f = d.financial || {}, rows = d.data || [], cur = f.accountCurrency || f.currency || '-';
    document.querySelectorAll('[data-acct-currency]').forEach(n => { n.textContent = cur; });
    const kids = [h('div', { class: 'pn-grid' }, [stat('Account Currency', cur), stat('Available', f.formattedAvailable), stat('Locked', f.formattedLocked), stat('Total credits', f.formattedTotalCredits), stat('Total debits', f.formattedTotalDebits), stat('Total spent', f.formattedTotalSpent), stat('Due', f.formattedDue)])];
    if (wallet && ZERO(f.availableBalance)) kids.push(msg('Your balance is zero. Contact your reseller to add funds; this website has no online payment.', 'warn'));
    kids.push(filterBar([input('search', 'Search statement', p.search), input('type', 'Entry type', p.type), select('direction', 'Direction', [['', 'Credit and debit'], ['credit', 'Credit'], ['debit', 'Debit']], p.direction)], v => nav(path, v), 'Filter'));
    kids.push(rows.length === 0 ? msg('No statement entries found.') : h('div', { class: 'pn-card' }, [table(['Date', 'Type', 'Amount', 'Balance after', 'Details'], rows.map(r => h('tr', {}, [h('td', { text: fmtDate(r.createdAt) }), h('td', { text: r.type }),
      h('td', { class: r.direction === 'credit' ? 'pos' : 'neg', text: (r.direction === 'credit' ? '+' : '-') + r.formattedAmount }), h('td', { text: r.formattedBalanceAfter }),
      h('td', { text: [r.description, r.method, r.transactionReference].filter(Boolean).join(' / ') || '-' })])))]));
    kids.push(pager(page, d.hasMore, n => nav(path, Object.assign({}, p, { page: n }))));
    mount(...kids);
  }

  async function orderDetail(id, placed) {
    const o = await call('/panel/orders/' + encodeURIComponent(id));
    const rows = [['Reference', o.reference], ['Service', o.serviceName], ['Type', o.serviceType], ['Amount', o.amountFormatted], ['Placed', fmtDate(o.createdAt)], o.completedAt ? ['Completed', fmtDate(o.completedAt)] : null, o.rejectedAt ? ['Rejected', fmtDate(o.rejectedAt)] : null].filter(Boolean);
    const dl = h('dl', { class: 'ca-dl' }, rows.map(r => h('div', {}, [h('dt', { text: r[0] }), h('dd', { text: r[1] })])));
    const inp = o.customerInput || {};
    const kids = [placed ? msg('Order placed. We will update the status here.') : null, h('p', {}, [h('a', { href: BASE + '/orders', text: 'Back to orders' })]), h('div', { class: 'pn-card' }, [h('h2', { text: 'Order ' + o.reference }), tag(o.status), dl])];
    if (Object.keys(inp).length) kids.push(h('div', { class: 'pn-card', style: 'margin-top:14px' }, [h('h2', { text: 'Your input' }), h('dl', { class: 'ca-dl' }, Object.keys(inp).map(k => h('div', {}, [h('dt', { text: k }), h('dd', { text: inp[k] })])))]));
    if (o.result) kids.push(h('div', { class: 'pn-card', style: 'margin-top:14px' }, [h('h2', { text: 'Result' }), h('p', { class: 'pn-pre', text: o.result })]));
    if (o.rejectionReason) kids.push(h('div', { class: 'pn-card', style: 'margin-top:14px' }, [h('h2', { text: 'Rejected' }), h('p', { class: 'pn-pre', text: o.rejectionReason }), h('p', { text: 'The amount has been refunded to your wallet.' })]));
    mount(...kids);
  }

  async function serviceDetail(id) {
    const d = await call('/panel/services/' + encodeURIComponent(id));
    const sv = d.service || d;
    const currency = sv.currency;
    let quote = null, key = uuid(), busy = false, attempt = null;
    const form = h('form', { class: 'pn-f', novalidate: true });
    const status = h('div', {});
    const fields = {};
    const quoteBox = h('div', {});
    const order = h('button', { class: 'pn-btn', type: 'submit', text: 'Place order', disabled: true });
    const getQuote = h('button', { class: 'pn-btn alt', type: 'button', text: 'Get quote' });
    const invalidate = () => { if (attempt) return; quote = null; order.disabled = true; clear(quoteBox); };
    const reqs = sv.requirements || [];
    reqs.forEach(r => {
      let el;
      if (r.type === 'textarea') el = h('textarea', { id: 'pn-f-' + r.key, maxlength: 2000 });
      else if (r.type === 'select') { el = h('select', { id: 'pn-f-' + r.key }, [h('option', { value: '', text: 'Select...' })].concat((r.options || []).map(o => h('option', { value: o, text: o })))); }
      else el = h('input', { id: 'pn-f-' + r.key, type: r.type === 'number' ? 'text' : 'text', inputmode: r.type === 'number' || r.type === 'imei' ? 'numeric' : 'text', maxlength: 200, autocomplete: 'off' });
      el.addEventListener('input', invalidate); el.addEventListener('change', invalidate);
      fields[r.key] = el;
      form.appendChild(h('div', {}, [h('label', { for: 'pn-f-' + r.key }, [r.label, r.required ? h('span', { class: 'req', text: ' *' }) : null]), el]));
    });
    form.insertBefore(h('p', { text: 'Account Currency: ' + currency }), form.firstChild);
    const inputs = () => { const o = {}; reqs.forEach(r => { o[r.key] = String(fields[r.key].value || '').trim(); }); return o; };
    const check = () => { for (const r of reqs) { const v = String(fields[r.key].value || '').trim(); if (r.required && !v) return r.label + ' is required.'; if (v && r.type === 'number' && !/^-?\d+(\.\d+)?$/.test(v)) return r.label + ' must be a number.'; if (v && r.type === 'imei' && !/^\d{14,16}$/.test(v)) return r.label + ' must be 14 to 16 digits.'; } return ''; };
    const note = (t, c) => { clear(status); if (t) status.appendChild(msg(t, c)); };
    getQuote.addEventListener('click', async () => {
      const e = check(); if (e) return note(e, 'err');
      note(''); getQuote.disabled = true; invalidate();
      try {
        const q = await call('/panel/quote', 'POST', Object.assign({ serviceId: sv.id }, currency ? { currency } : {}));
        quote = q;
        quoteBox.appendChild(h('div', { class: 'pn-card' }, [h('dl', { class: 'ca-dl' }, [['Total', q.formattedTotal], ['Your balance', q.formattedBalance]].concat(q.sufficient ? [] : [['Missing', q.formattedMissing]]).map(r => h('div', {}, [h('dt', { text: r[0] }), h('dd', { text: r[1] })]))),
          q.sufficient ? null : h('p', { class: 'neg', text: 'Insufficient balance. Contact your reseller to add funds.' })]));
        order.disabled = !q.sufficient;
      } catch (err) {
        if (err instanceof Denied) return;
        const x = err.data || {}, dtl = Object.assign({}, x.details || {}, x.financial || {}, x);
        note(err.message, 'err');
        if (dtl.formattedTotal || dtl.formattedBalance || dtl.formattedMissing) quoteBox.appendChild(h('div', { class: 'pn-card' }, [h('dl', { class: 'ca-dl' }, [['Total', dtl.formattedTotal], ['Your balance', dtl.formattedBalance], ['Missing', dtl.formattedMissing]].filter(r => r[1]).map(r => h('div', {}, [h('dt', { text: r[0] }), h('dd', { text: r[1] })])))]));
      } finally { getQuote.disabled = false; }
    });
    const lockForm = on => { Object.keys(fields).forEach(k => { fields[k].disabled = on; }); getQuote.disabled = on; };
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (busy || !quote || !quote.sufficient) return;
      if (!attempt) {
        const e = check(); if (e) return note(e, 'err');
        // Snapshot payload and key so a network retry resends exactly the same request.
        attempt = Object.assign({ serviceId: sv.id, inputs: inputs(), idempotencyKey: key, expectedPriceUsdUnits: String(quote.priceUsdUnits), expectedPriceAccountUnits: String(quote.priceAccountUnits) }, currency ? { currency } : {});
      }
      busy = true; order.disabled = true; lockForm(true); note('Placing order...');
      try {
        const o = await call('/panel/orders', 'POST', attempt);
        attempt = null; key = uuid();
        nav('/orders', { id: o.id || (o.order && o.order.id), placed: '1' });
      } catch (err) {
        busy = false;
        if (err instanceof Denied) return;
        if (err.http) {
          // Definitive server answer: drop the attempt, require a fresh quote and a new key.
          attempt = null; key = uuid(); lockForm(false); invalidate();
          note(err.message + ' Please request a new quote before ordering.', 'err');
        } else {
          order.disabled = false;
          note('Network problem. Press Place order to retry; the same request and key are resent, so you are never charged twice.', 'err');
        }
      }
    });
    const bar = h('div', { class: 'pn-bar' }, [getQuote, order]);
    form.appendChild(quoteBox); form.appendChild(bar); form.appendChild(status);
    mount(h('p', {}, [h('a', { href: BASE + '/services', text: 'Back to services' })]),
      h('div', { class: 'pn-two' }, [h('div', { class: 'pn-card' }, [h('h1', { text: sv.name }), h('span', { class: 'pn-tag', text: sv.serviceType }), sv.description ? h('p', { class: 'pn-pre', text: sv.description, style: 'margin-top:12px' }) : null, h('div', { class: 'pn-v', text: sv.formattedPrice }), sv.estimatedTime ? h('p', { text: 'Delivery: ' + sv.estimatedTime }) : null]),
        h('div', { class: 'pn-card' }, [h('h2', { text: 'Order details' }), form])]));
  }

  const run = pages[PAGE];
  if (run) guard(run)();
  if (PAGE !== 'dashboard' && document.querySelector('[data-hdr-bal]')) call('/panel').then(d => setHdr(d.financial || {})).catch(() => setHdr(null));
})();`;

export const PANEL_STYLES = PANEL_STYLES_BASE + PANEL_STYLES_V2;
export const PANEL_SCRIPT_HASH = createHash('sha256').update(PANEL_SCRIPT).digest('base64');

const dt = (v: unknown): string => { if (!v) return ''; const d = new Date(v as string); return Number.isNaN(+d) ? '' : d.toISOString().slice(0, 10); };
function profileDetails(c: Profile): string {
  const rows: [string, unknown][] = [
    ['Name', (c.firstName + ' ' + c.lastName).trim()], ['Email', c.email], ['Client code', c.clientCode], ['Username', c.username], ['WhatsApp', c.whatsappPhone],
    ['Address', [c.addressLine1, c.addressLine2].filter(Boolean).join(', ')], ['City', c.city], ['State / province', c.state], ['Postal code', c.postalCode], ['Country', c.countryCode],
    ['Language', c.preferredLanguage], ['Account Currency', c.preferredCurrency], ['Newsletter', c.newsletterOptIn ? 'Subscribed' : 'Not subscribed'], ['Member since', dt(c.createdAt)],
  ];
  return `<dl class="ca-dl">${rows.filter(([, v]) => v).map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(String(v))}</dd></div>`).join('')}</dl>`;
}

/** Server-rendered panel main content: navigation, heading and a data mount filled by PANEL_SCRIPT. */
export function renderPanelMain(m: PublicSiteModel, page: PanelPage, customer?: Profile): string {
  const ca = m.customerAccess;
  const base = panelBase(m);
  const api = localPath(ca?.apiBase) ?? '';
  const login = localPath(ca?.loginHref) ?? '/';
  const href = (p: PanelPage) => `${base}/${p}`;
  const greeting = page === 'dashboard' ? `<h1>Welcome back${customer?.firstName ? ', ' + e(customer.firstName) : ''}</h1>` : `<h1>${e(TITLES[page])}</h1><p class="pn-sub">${e(m.siteName)}</p>`;
  const addFunds = page === 'wallet' ? `<section class="pn-card accent" id="add-funds" tabindex="-1" style="margin:0 0 18px"><h2>Add Funds</h2><p>Account Currency: <strong data-acct-currency>${e(customer?.effectiveCurrency ?? customer?.preferredCurrency ?? '')}</strong>. Your account currency is fixed and cannot be changed.</p><p>Funds are added by your reseller. Contact ${e(m.siteName)} through their listed channels, tell them your client code${customer?.clientCode ? ' (' + e(customer.clientCode) + ')' : ''} and the amount, and the credit will appear in your wallet once confirmed. There is no online payment on this website.</p></section>` : '';
  const security = page === 'security' ? `<div class="pn-card"><h2>Account security</h2><dl class="ca-dl"><div><dt>Email</dt><dd>${e(customer?.email ?? '')}</dd></div>${customer?.clientCode ? `<div><dt>Client code</dt><dd>${e(customer.clientCode)}</dd></div>` : ''}<div><dt>Account Currency</dt><dd>${e(customer?.effectiveCurrency ?? customer?.preferredCurrency ?? '-')} (immutable)</dd></div></dl><p>Your email, client code and account currency are fixed identity details and cannot be changed from this panel.</p><p>Sign out when using a shared or public device. Never share your password or order details. Your session is kept by a secure cookie and ends when you log out. To change your password or details, contact your reseller.</p><button type="button" class="pn-btn alt" data-customer-logout data-endpoint="${e(api + '/logout')}" data-home="${e(localPath(ca?.homeHref) ?? '/')}">Logout</button></div>` : '';
  const content = page === 'security' ? security : page === 'profile'
    ? `<div class="pn-card">${profileDetails(customer ?? { firstName: '', lastName: '', email: '' })}<p class="pn-sub">Profile details are managed by your reseller. Contact them to change anything.</p></div>`
    : `<div id="pn-out" aria-live="polite"><div class="pn-skel"></div></div><noscript><p class="pn-msg">JavaScript is required to load this page.</p></noscript>`;
  return `<main class="pn" data-panel data-api="${e(api)}" data-base="${e(base)}" data-page="${page}" data-login="${e(login)}">${greeting}${addFunds}${content}</main>`;
}
