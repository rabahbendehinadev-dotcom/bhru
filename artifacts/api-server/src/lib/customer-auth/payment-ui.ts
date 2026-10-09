import { createHash } from 'node:crypto';
import { escapeHTML as e } from '../public-site/safety';
import type { CustomerProfile as Profile } from './types';

export const PAYMENT_STYLES = `
.fx-f{display:grid;gap:12px;max-width:520px}.fx-f label{display:grid;gap:4px;font-weight:600;font-size:14px}
.fx-f select,.fx-f input{min-height:40px;border-radius:8px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font:inherit;padding:0 10px}
.fx-q{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin:0}.fx-q div{display:grid;gap:2px}.fx-q dt{font-size:12px;color:var(--muted)}.fx-q dd{margin:0;font-weight:600;overflow-wrap:anywhere}
.fx-h{display:grid;gap:8px;margin:12px 0 0;padding:0;list-style:none}.fx-h li{border:1px solid var(--line);border-radius:8px;padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between}
`;

export function renderFundingMain(api: string, customer?: Profile): string {
  const cur = e(customer?.effectiveCurrency ?? customer?.preferredCurrency ?? '');
  return `<div data-funding data-api="${e(api)}"><div id="fx-empty" class="pn-msg" hidden>No online payment provider is available. Funds are added by your reseller: tell them your client code${customer?.clientCode ? ' (' + e(customer.clientCode) + ')' : ''} and the amount. Nothing is charged on this website.</div>
<form class="fx-f" id="fx-form" novalidate hidden><fieldset id="fx-fields" disabled style="border:0;padding:0;margin:0;display:grid;gap:12px"><label>Payment Method<select name="method"></select></label><label>Payment Currency<select name="currency"></select></label>
<label>Amount<input name="amount" inputmode="decimal" autocomplete="off"></label></fieldset><p class="pn-sub">Account Currency: <strong>${cur}</strong></p>
<dl class="fx-q" id="fx-quote" aria-live="polite"></dl><div class="pn-msg" id="fx-msg" role="status" hidden></div>
<div><button type="button" class="pn-btn alt" id="fx-getq">Get quote</button> <button type="submit" class="pn-btn" id="fx-submit" disabled>Create funding request</button></div></form>
<h3>Funding history</h3><ul class="fx-h" id="fx-hist"><li class="pn-skel"></li></ul><div id="fx-more" hidden><button type="button" class="pn-btn alt" id="fx-prev">Previous</button> <span id="fx-page"></span> <button type="button" class="pn-btn alt" id="fx-next">Next</button></div></div>`;
}

export const PAYMENT_SCRIPT = String.raw`(() => {
  const root = document.querySelector('[data-funding]'); if (!root) return;
  const API = root.dataset.api, LOGIN = (document.querySelector('[data-panel]') || {dataset:{}}).dataset.login || '/';
  const HDR = { 'Content-Type': 'application/json', 'X-BHRU-Customer-Request': '1' };
  const $ = id => document.getElementById(id), form = $('fx-form');
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  const el = (t, text) => { const n = document.createElement(t); n.textContent = text; return n; };
  const call = async (path, method, body) => {
    const res = await fetch(API + path, { method: method || 'GET', cache: 'no-store', credentials: 'same-origin', headers: HDR, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) { location.assign(LOGIN); throw Object.assign(new Error('Redirecting'), { silent: true }); }
    let d = {}; try { d = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(d.error || 'Request failed. Please try again.');
    return d;
  };
  const msg = (t, err) => { const m = $('fx-msg'); m.textContent = t || ''; m.hidden = !t; m.className = 'pn-msg' + (err ? ' err' : ''); m.setAttribute('role', err ? 'alert' : 'status'); };
  let gws = [], quote = null, key = null, seq = 0, busy = false, page = 1;
  const val = n => form.elements[n].value;
  const sel = () => { const p = val('method').split('|'); return { code: p[0], method: p.slice(1).join('|') }; };
  const body = () => { const s = sel(); return { gatewayCode: s.code, paymentMethod: s.method, amount: val('amount').trim(), paymentCurrency: val('currency') }; };
  const resetQuote = () => { seq++; quote = null; key = null; clear($('fx-quote')); $('fx-submit').disabled = true; };
  const fillCurrencies = () => {
    const s = sel(), g = gws.find(x => x.code === s.code), c = form.elements.currency; clear(c);
    ((g && g.supportedCurrencies) || []).forEach(v => c.appendChild(el('option', v)));
  };
  const LBL = { CREATED: 'Created', PENDING_PAYMENT: 'Awaiting payment', PAID: 'Paid', FAILED: 'Failed', EXPIRED: 'Expired', CANCELLED: 'Cancelled' };
  const when = v => v ? new Date(v).toLocaleString() : '';
  const safeUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch (_) { return null; } };
  const live = f => f.status === 'CREATED' || f.status === 'PENDING_PAYMENT';
  const detail = (f, box) => {
    const p = f.processing, now = Date.now();
    const exp = (p && p.expiresAt) || f.expiresAt, expired = exp && new Date(exp).getTime() <= now;
    const line = t => box.appendChild(el('p', t));
    if (f.status === 'PAID' && f.settlementStatus === 'SETTLED') { if (f.paidAt) line('Paid ' + when(f.paidAt)); if (f.creditedWalletAmount) line('Wallet credited: ' + f.creditedWalletAmount); return; }
    if (f.status === 'PAID') line('Payment received. Your wallet will be updated once confirmed.');
    if (f.reviewRequired || (p && p.state === 'REVIEW_REQUIRED')) line('Review required. Please contact your reseller.');
    if (f.status === 'FAILED' || (p && p.state === 'FAILED')) line('This payment could not be completed.');
    if (!live(f) || expired || !p || p.state === 'FAILED' || p.state === 'REVIEW_REQUIRED') { if (live(f) && expired) line('This payment has expired.'); return; }
    if (p.state === 'PROCESSING') line('Processing your payment.');
    if (p.instructions) line(p.instructions);
    const u = p.paymentUrl && safeUrl(p.paymentUrl);
    if (u) { const a = el('a', 'Open payment page'); a.href = u; a.rel = 'noopener noreferrer'; a.target = '_blank'; a.className = 'pn-btn alt'; box.appendChild(a); }
    if (p.paymentAddress) line('Payment address: ' + p.paymentAddress);
    if (exp) line('Pay before ' + when(exp));
  };
  let timer = null, polls = 0;
  const schedule = d => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!(d.data || []).some(live) || polls >= 20) return;
    timer = setTimeout(() => { timer = null; if (document.hidden) { schedule(d); return; } polls++; history(true); }, 15000);
  };
  const history = async quiet => {
    const ul = $('fx-hist'), more = $('fx-more'); if (!quiet) { polls = 0; clear(ul); }
    try {
      const d = await call('/panel/funding?page=' + page);
      clear(ul);
      if (!(d.data || []).length) ul.appendChild(el('li', 'No funding requests yet.'));
      (d.data || []).forEach(f => { const li = document.createElement('li'); li.appendChild(el('span', f.createdAt ? new Date(f.createdAt).toLocaleString() : '-')); li.appendChild(el('span', f.gatewayName + ' - ' + (LBL[f.status] || f.status))); li.appendChild(el('span', 'Quoted payable ' + f.formattedPayable + ' / Credit ' + f.formattedCredit)); const box = document.createElement('div'); box.style.flexBasis = '100%'; detail(f, box); li.appendChild(box); ul.appendChild(li); });
      $('fx-prev').disabled = page <= 1; $('fx-next').disabled = !d.hasMore; more.hidden = page <= 1 && !d.hasMore;
      $('fx-page').textContent = 'Page ' + page + (d.hasMore ? '' : ' (last)');
      schedule(d);
    } catch (err) { if (!quiet && !err.silent) ul.appendChild(el('li', err.message)); }
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !timer && polls < 20 && $('fx-hist').children.length) { polls++; history(true); } });
  const showQuote = q => { const dl = $('fx-quote'); clear(dl); [['Estimated Wallet Credit', q.formattedCredit], ['Base amount', q.formattedBase], ['Fees', q.formattedFee], ['Total Payable', q.formattedPayable]].forEach(r => { const d = document.createElement('div'); d.appendChild(el('dt', r[0])); d.appendChild(el('dd', r[1])); dl.appendChild(d); }); };
  const init = async () => {
    try { const d = await call('/panel/funding/gateways'); gws = d.data || []; } catch (err) { if (err.silent) return; gws = []; }
    if (!gws.length) { $('fx-empty').hidden = false; } else {
      form.hidden = false;
      const m = form.elements.method;
      gws.forEach(g => (g.supportedMethods || []).forEach(v => { const o = el('option', g.displayName + ' - ' + v); o.value = g.code + '|' + v; m.appendChild(o); }));
      fillCurrencies(); $('fx-fields').disabled = false;
    }
    history();
  };
  form.addEventListener('input', () => { if (!busy) resetQuote(); });
  form.addEventListener('change', ev => { if (busy) return; if (ev.target.name === 'method') fillCurrencies(); resetQuote(); });
  $('fx-prev').addEventListener('click', () => { if (page > 1) { page--; history(); } });
  $('fx-next').addEventListener('click', () => { page++; history(); });
  $('fx-getq').addEventListener('click', async () => {
    if (busy) return; resetQuote(); const mine = seq; msg('');
    try { const q = await call('/panel/funding/quote', 'POST', body()); if (mine !== seq) return; quote = q; key = crypto.randomUUID(); showQuote(q); $('fx-submit').disabled = false; }
    catch (err) { if (mine === seq && !err.silent) msg(err.message, true); }
  });
  form.addEventListener('submit', async ev => {
    ev.preventDefault(); if (busy || !quote || !key) return;
    busy = true; $('fx-submit').disabled = true; $('fx-getq').disabled = true; $('fx-fields').disabled = true; const payload = Object.assign(body(), { idempotencyKey: key }); const mine = seq;
    try { const f = await call('/panel/funding/initiate', 'POST', payload); msg('Funding request accepted for ' + f.formattedPayable + ' (quoted and fixed). This is not paid yet; no wallet credit has been made until payment is confirmed.', false); page = 1; history(); }
    catch (err) { if (!err.silent) msg((err.message || 'Request failed') + ' If unsure whether it was received, press Create again: it will not be duplicated.', true); }
    finally { busy = false; $('fx-fields').disabled = false; $('fx-getq').disabled = false; if (mine === seq && quote && key) $('fx-submit').disabled = false; }
  });
  init();
})();`;

export const paymentScriptHash = createHash('sha256').update(PAYMENT_SCRIPT).digest('base64');
