import { createHash } from 'node:crypto';
import { escapeHTML as e } from '../public-site/safety';
import type { PublicSiteModel } from '../public-site/model';
import type { CustomerProfile as Profile } from './types';

export type PanelPage = 'dashboard' | 'services' | 'orders' | 'wallet' | 'profile';
export const PANEL_PAGES: PanelPage[] = ['dashboard', 'services', 'orders', 'wallet', 'profile'];
const TITLES: Record<PanelPage, string> = { dashboard: 'Dashboard', services: 'Services', orders: 'My orders', wallet: 'Wallet', profile: 'Profile' };
export const panelTitle = (p: PanelPage): string => TITLES[p];

const localPath = (v: unknown): string | null => (typeof v === 'string' && /^\/(?!\/)[^\s"'<>\\]*$/.test(v) ? v : null);

/** Base path of the panel, derived from accountHref (/{slug}/customer/account -> /{slug}/customer). */
export function panelBase(m: PublicSiteModel): string {
  const a = localPath(m.customerAccess?.accountHref) ?? '';
  return a.replace(/\/account\/?$/, '') || '';
}

export const PANEL_STYLES = `
.pn{width:min(1120px,100%);margin:0 auto;padding:28px 18px 72px;min-width:0}
.pn h1{font-size:clamp(24px,5vw,32px);margin:0 0 4px}.pn h2{font-size:18px;margin:0 0 12px}.pn .pn-sub{color:var(--muted);margin:0 0 18px}
.pn-nav{display:flex;gap:6px;overflow-x:auto;margin:0 0 22px;padding:0 0 4px;border-bottom:1px solid var(--line)}
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
  const ZERO = x => !x || /^0+(\.0+)?$/.test(String(x));

  const pages = {
    async dashboard() {
      const d = await call('/panel');
      const f = d.financial || {}, s = d.orderSummary || {}, rows = d.recentOrders || [];
      const kids = [h('div', { class: 'pn-grid' }, [stat('Available balance', f.formattedAvailable), stat('Locked', f.formattedLocked), stat('Total spent', f.formattedTotalSpent), stat('Due', f.formattedDue)]),
        h('div', { class: 'pn-grid' }, [stat('Total orders', s.totalOrders), stat('Pending', s.pending), stat('Processing', s.processing), stat('Completed', s.completed), stat('Rejected', s.rejected)])];
      if (ZERO(f.availableBalance)) kids.push(msg('Your wallet balance is empty. Contact your reseller to add funds; online payment is not available on this website.', 'warn'));
      kids.push(h('div', { class: 'pn-card' }, [h('h2', { text: 'Recent orders' }), rows.length === 0 ? h('p', { text: 'No orders yet. Browse the services to place your first order.' }) :
        table(['Reference', 'Service', 'Amount', 'Status', 'Date'], rows.map(o => h('tr', {}, [h('td', {}, [h('a', { href: BASE + '/orders?id=' + encodeURIComponent(o.id), text: o.reference })]), h('td', { text: o.serviceName }), h('td', { text: o.amountFormatted }), h('td', {}, [tag(o.status)]), h('td', { text: fmtDate(o.createdAt) })]))),
        h('p', {}, [h('a', { class: 'pn-btn', href: BASE + '/services', text: 'Browse services', style: 'margin-top:14px' })])]));
      mount(...kids);
    },

    async services() {
      const p = params();
      if (p.service) return serviceDetail(p.service, p.currency);
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

    async wallet() {
      const p = params();
      const page = Math.max(1, parseInt(p.page || '1', 10) || 1);
      const d = await call('/panel/statement' + qs({ page, search: p.search, type: p.type, direction: p.direction }));
      const f = d.financial || {}, rows = d.data || [];
      const kids = [h('div', { class: 'pn-grid' }, [stat('Available', f.formattedAvailable), stat('Locked', f.formattedLocked), stat('Total credits', f.formattedTotalCredits), stat('Total debits', f.formattedTotalDebits), stat('Total spent', f.formattedTotalSpent), stat('Due', f.formattedDue)])];
      if (ZERO(f.availableBalance)) kids.push(msg('Your balance is zero. Contact your reseller to add funds; this website has no online payment.', 'warn'));
      kids.push(filterBar([input('search', 'Search statement', p.search), input('type', 'Entry type', p.type), select('direction', 'Direction', [['', 'Credit and debit'], ['credit', 'Credit'], ['debit', 'Debit']], p.direction)], v => nav('/wallet', v), 'Filter'));
      kids.push(rows.length === 0 ? msg('No statement entries found.') : h('div', { class: 'pn-card' }, [table(['Date', 'Type', 'Amount', 'Balance after', 'Details'], rows.map(r => h('tr', {}, [h('td', { text: fmtDate(r.createdAt) }), h('td', { text: r.type }),
        h('td', { class: r.direction === 'credit' ? 'pos' : 'neg', text: (r.direction === 'credit' ? '+' : '-') + r.formattedAmount }), h('td', { text: r.formattedBalanceAfter }),
        h('td', { text: [r.description, r.method, r.transactionReference].filter(Boolean).join(' / ') || '-' })])))]));
      kids.push(pager(page, d.hasMore, n => nav('/wallet', Object.assign({}, p, { page: n }))));
      mount(...kids);
    },
  };

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

  async function serviceDetail(id, cur) {
    const d = await call('/panel/services/' + encodeURIComponent(id));
    const sv = d.service || d;
    const list = await call('/panel/services' + qs({ page: 1 })).catch(() => ({}));
    const currencies = list.currencies || d.currencies || [];
    let currency = cur || list.defaultCurrency || d.defaultCurrency || '';
    let quote = null, key = uuid(), busy = false, attempt = null;
    const form = h('form', { class: 'pn-f', novalidate: true });
    const status = h('div', {});
    const fields = {};
    const curSel = currencies.length ? h('select', { id: 'pn-currency', 'aria-label': 'Currency' }, currencies.map(c => h('option', { value: c.code || c, text: c.name ? c.code + ' - ' + c.name : (c.code || c) }))) : null;
    if (curSel) { curSel.value = currency; if (!curSel.value && currencies[0]) { currency = currencies[0].code || currencies[0]; curSel.value = currency; } }
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
    if (curSel) { curSel.addEventListener('change', () => { currency = curSel.value; invalidate(); }); form.insertBefore(h('div', {}, [h('label', { for: 'pn-currency', text: 'Currency' }), curSel]), form.firstChild); }
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
    const lockForm = on => { Object.keys(fields).forEach(k => { fields[k].disabled = on; }); if (curSel) curSel.disabled = on; getQuote.disabled = on; };
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (busy || !quote || !quote.sufficient) return;
      if (!attempt) {
        const e = check(); if (e) return note(e, 'err');
        // Snapshot payload and key so a network retry resends exactly the same request.
        attempt = Object.assign({ serviceId: sv.id, inputs: inputs(), idempotencyKey: key, expectedPriceUsdUnits: String(quote.priceUsdUnits) }, currency ? { currency } : {});
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
})();`;

export const PANEL_SCRIPT_HASH = createHash('sha256').update(PANEL_SCRIPT).digest('base64');

const dt = (v: unknown): string => { if (!v) return ''; const d = new Date(v as string); return Number.isNaN(+d) ? '' : d.toISOString().slice(0, 10); };
function profileDetails(c: Profile): string {
  const rows: [string, unknown][] = [
    ['Name', (c.firstName + ' ' + c.lastName).trim()], ['Email', c.email], ['Client code', c.clientCode], ['Username', c.username], ['WhatsApp', c.whatsappPhone],
    ['Address', [c.addressLine1, c.addressLine2].filter(Boolean).join(', ')], ['City', c.city], ['State / province', c.state], ['Postal code', c.postalCode], ['Country', c.countryCode],
    ['Language', c.preferredLanguage], ['Currency', c.effectiveCurrency ?? c.preferredCurrency], ['Newsletter', c.newsletterOptIn ? 'Subscribed' : 'Not subscribed'], ['Member since', dt(c.createdAt)],
  ];
  return `<dl class="ca-dl">${rows.filter(([, v]) => v).map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(String(v))}</dd></div>`).join('')}</dl>`;
}

/** Server-rendered panel main content: navigation, heading and a data mount filled by PANEL_SCRIPT. */
export function renderPanelMain(m: PublicSiteModel, page: PanelPage, customer?: Profile): string {
  const ca = m.customerAccess;
  const base = panelBase(m);
  const api = localPath(ca?.apiBase) ?? '';
  const login = localPath(ca?.loginHref) ?? '/';
  const href = (p: PanelPage) => `${base}/${p === 'dashboard' ? 'account' : p}`;
  const nav = PANEL_PAGES.map((p) => `<a href="${e(href(p))}"${p === page ? ' aria-current="page"' : ''}>${e(TITLES[p])}</a>`).join('');
  const greeting = page === 'dashboard' ? `<h1>Welcome${customer?.firstName ? ', ' + e(customer.firstName) : ''}</h1><p class="pn-sub">Your wallet, orders and services with ${e(m.siteName)}.</p>` : `<h1>${e(TITLES[page])}</h1><p class="pn-sub">${e(m.siteName)}</p>`;
  const content = page === 'profile'
    ? `<div class="pn-card">${profileDetails(customer ?? { firstName: '', lastName: '', email: '' })}<p class="pn-sub">Profile details are managed by your reseller. Contact them to change anything.</p></div>`
    : `<div id="pn-out" aria-live="polite"><div class="pn-skel"></div></div><noscript><p class="pn-msg">JavaScript is required to load this page.</p></noscript>`;
  const profileSummary=page==='dashboard'&&customer
    ? `<div class="pn-card pn-account-summary"><strong>Your account</strong><span>Email: ${e(customer.email)}</span>
      ${customer.addressLine1?`<span>Address: ${e(customer.addressLine1)}</span>`:''}
      <a href="${e(href('profile'))}">View profile</a></div>`:'';
  return `<main class="pn" data-panel data-api="${e(api)}" data-base="${e(base)}" data-page="${page}" data-login="${e(login)}"><nav class="pn-nav" aria-label="Customer panel">${nav}</nav>${greeting}${content}${profileSummary}</main>`;
}
