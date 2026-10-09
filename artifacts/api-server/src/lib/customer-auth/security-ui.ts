import { createHash } from 'node:crypto';
import { escapeHTML as e } from '../public-site/safety';
import type { CustomerProfile as Profile } from './types';

const localPath = (v: unknown): string | null => (typeof v === 'string' && /^\/(?!\/)[^\s"'<>\\]*$/.test(v) ? v : null);

export const SECURITY_STYLES = `
.sx{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}.sx>*{min-width:0}
@media(min-width:1000px){.sx{grid-template-columns:minmax(0,2fr) minmax(0,3fr);align-items:start}.sx>.sx-wide{grid-column:1/-1}}
.sx-f{display:grid;gap:12px;max-width:520px}.sx-f .ca-field input{min-height:40px;border-radius:8px}
.sx-hint{font-size:12px;color:var(--muted);margin:0}
.sx-sum{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin:0}
.sx-sum div{display:grid;gap:2px;min-width:0}.sx-sum dt{font-size:12px;color:var(--muted);font-weight:500}.sx-sum dd{margin:0;font-weight:600;overflow-wrap:anywhere;font-size:13px}
.sx-list{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.sx-s{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:8px}
.sx-s.cur{border-color:var(--accent)}.sx-s>div{min-width:0;flex:1 1 220px}.sx-s b{display:block;overflow-wrap:anywhere}.sx-s small{display:block;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
.sx-head{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;margin:0 0 10px}.sx-head h2{margin:0}
.sx-acts{display:flex;flex-wrap:wrap;gap:8px}
.sx-r-success{border-color:#2f855a;color:#2f855a}.sx-r-failed,.sx-r-blocked{border-color:#b42318;color:#b42318}.sx-r-locked{border-color:#b7791f;color:#b7791f}
.sx-card[aria-busy=true]{opacity:.7}
.ca-card .ca-note{margin:0 0 14px;color:var(--muted);font-size:14px}
`;

function pwField(id: string, label: string, auto: string): string {
  return `<div class="ca-field"><label for="sx-${id}">${e(label)}</label><input id="sx-${id}" name="${id}" type="password" autocomplete="${auto}" required minlength="8" maxlength="128" aria-describedby="sx-${id}-err"><div class="ca-ferr" id="sx-${id}-err" data-error-for="${id}" aria-live="polite"></div></div>`;
}

export function renderSecurityMain(api: string, home: string, customer?: Profile): string {
  const a = localPath(api) ?? '', h = localPath(home) ?? '/';
  const id = `<dl class="sx-sum"><div><dt>Email</dt><dd>${e(customer?.email ?? '')}</dd></div>${customer?.clientCode ? `<div><dt>Client code</dt><dd>${e(customer.clientCode)}</dd></div>` : ''}<div><dt>Account Currency</dt><dd>${e(customer?.effectiveCurrency ?? customer?.preferredCurrency ?? '-')} (fixed)</dd></div></dl>`;
  return `<div class="sx" data-security data-api="${e(a)}">
<section class="pn-card sx-wide" aria-labelledby="sx-t-ov"><h2 id="sx-t-ov">Account protection</h2>${id}<div id="sx-banner" aria-live="polite"></div><dl class="sx-sum" id="sx-summary" style="margin-top:12px" aria-busy="true"><div><dt>Status</dt><dd>Loading security details</dd></div></dl></section>
<section class="pn-card" aria-labelledby="sx-t-pw"><h2 id="sx-t-pw">Change password</h2><p class="sx-hint" style="margin-bottom:10px">Use 8 to 128 characters. A passphrase works well. Changing it signs out your other sessions when the server applies that policy.</p>
<form class="sx-f" id="sx-pw" novalidate>${pwField('currentPassword', 'Current password', 'current-password')}${pwField('newPassword', 'New password', 'new-password')}${pwField('confirmPassword', 'Confirm new password', 'new-password')}<div class="pn-msg" role="status" aria-live="polite" data-status hidden></div><div><button class="pn-btn" type="submit">Update password</button></div></form></section>
<section class="pn-card sx-card" id="sx-sessions" aria-labelledby="sx-t-se" aria-busy="true"><div class="sx-head"><h2 id="sx-t-se">Active sessions</h2><div class="sx-acts"><button type="button" class="pn-btn alt" id="sx-others" disabled>Sign out other sessions</button><button type="button" class="pn-btn alt" data-customer-logout data-endpoint="${e(a + '/logout')}" data-home="${e(h)}">Logout this device</button></div></div><div id="sx-sess-msg" aria-live="polite"></div><ul class="sx-list" id="sx-sess-list"><li class="pn-skel"></li></ul></section>
<section class="pn-card sx-card sx-wide" id="sx-history" aria-labelledby="sx-t-hi" aria-busy="true"><div class="sx-head"><h2 id="sx-t-hi">Recent sign-in activity</h2><button type="button" class="pn-btn alt" id="sx-refresh">Refresh</button></div><div id="sx-hist-body"><div class="pn-skel"></div></div></section>
</div><noscript><p class="pn-msg">JavaScript is required to manage security settings.</p></noscript>`;
}

function rfield(id: string, label: string, type: string, auto: string, extra = ''): string {
  return `<div class="ca-field"><label for="sx-${id}">${e(label)}</label><input id="sx-${id}" name="${id}" type="${type}" autocomplete="${auto}" required aria-describedby="sx-${id}-err"${extra}><div class="ca-ferr" id="sx-${id}-err" data-error-for="${id}" aria-live="polite"></div></div>`;
}

export function renderForgotCard(api: string, login: string, siteName: string): string {
  const a = localPath(api) ?? '', l = localPath(login) ?? '/';
  return `<h1>Forgot password</h1><p class="ca-sub">Enter your email, username or client code for ${e(siteName)}.</p>
<p class="ca-note">Automatic email delivery is not configured. Submitting this form does not send a message. To regain access, contact your reseller.</p>
<form class="ca-form" method="post" action="${e(a + '/forgot-password')}" data-recovery="forgot" data-endpoint="${e(a + '/forgot-password')}" novalidate>
${rfield('identifier', 'Email, username or client code', 'text', 'username', ' maxlength="254"')}
<div class="ca-status" role="status" aria-live="polite" data-status hidden></div><button class="ca-submit" type="submit">Submit request</button></form>
<p class="ca-alt"><a href="${e(l)}">Back to login</a></p>`;
}

export function renderResetCard(api: string, login: string, siteName: string): string {
  const a = localPath(api) ?? '', l = localPath(login) ?? '/';
  return `<h1>Reset password</h1><p class="ca-sub">Choose a new password for ${e(siteName)}.</p>
<div class="ca-status is-error" role="alert" data-notoken hidden>This reset link is missing or incomplete. Contact your reseller for a new one.</div>
<form class="ca-form" method="post" action="${e(a + '/reset-password')}" data-recovery="reset" data-endpoint="${e(a + '/reset-password')}" novalidate>
${rfield('newPassword', 'New password', 'password', 'new-password', ' minlength="8" maxlength="128"')}${rfield('confirmPassword', 'Confirm new password', 'password', 'new-password', ' minlength="8" maxlength="128"')}
<div class="ca-status" role="status" aria-live="polite" data-status hidden></div><button class="ca-submit" type="submit">Set new password</button></form>
<p class="ca-alt" data-done hidden>Your password was changed. <a href="${e(l)}">Go to login</a></p><p class="ca-alt" data-back><a href="${e(l)}">Back to login</a></p>`;
}

export const SECURITY_SCRIPT = String.raw`(() => {
  const HDR = { 'Content-Type': 'application/json', 'X-BHRU-Customer-Request': '1' };
  const h = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(k => { if (k === 'text') n.textContent = String(attrs[k]); else if (k === 'class') n.className = attrs[k]; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? '' : String(attrs[k])); });
    (kids || []).forEach(c => { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  };
  const clear = n => { while (n.firstChild) n.removeChild(n.firstChild); };
  const fmt = s => { if (!s) return '-'; const d = new Date(s); return Number.isNaN(+d) ? '-' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); };
  const fieldErrors = (form, fields) => form.querySelectorAll('input').forEach(i => {
    const out = form.querySelector('[data-error-for="' + i.name + '"]'); const m = fields && fields[i.name];
    if (out) out.textContent = m ? String(m) : '';
    if (m) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
  });
  const show = (form, msg, error) => { const s = form.querySelector('[data-status]'); s.textContent = msg; s.hidden = !msg; s.classList.toggle('is-error', !!error); s.classList.toggle('err', !!error); if (error) s.setAttribute('role', 'alert'); else s.setAttribute('role', 'status'); };
  const lenCheck = (v, label) => (v.length < 8 || v.length > 128) ? label + ' must be 8 to 128 characters.' : '';

  const sec = document.querySelector('[data-security]');
  if (sec) {
    const API = sec.dataset.api;
    const LOGIN = (document.querySelector('[data-panel]') || {}).dataset ? document.querySelector('[data-panel]').dataset.login : '/';
    const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const $ = id => document.getElementById(id);
    const call = async (path, method, body) => {
      const res = await fetch(API + path, { method: method || 'GET', cache: 'no-store', credentials: 'same-origin', headers: HDR, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 401) { location.assign(LOGIN); throw Object.assign(new Error('Redirecting to login'), { silent: true }); }
      let d = {}; try { d = await res.json(); } catch (_) {}
      if (!res.ok) { const err = new Error(d.error || 'Request failed. Please try again.'); err.fields = d.fields || {}; throw err; }
      return d;
    };
    let lastLoad = 0, loading = false, pending = 0, hasData = false;
    const banner = (t) => { const b = $('sx-banner'); clear(b); if (t) { b.appendChild(h('div', { class: 'pn-msg err', role: 'alert' }, [t + ' ', h('button', { type: 'button', class: 'pn-btn alt', text: 'Try again', onclick: () => load(true) })])); } };
    const setBusy = on => { ['sx-sessions', 'sx-history'].forEach(id => $(id).setAttribute('aria-busy', on ? 'true' : 'false')); $('sx-refresh').disabled = on; };
    const syncOthers = (d) => { $('sx-others').disabled = pending > 0 || !d || (d.sessions || []).filter(s => !s.current).length === 0; };
    let model = null;
    const render = d => {
      model = d;
      const lock = d.lockedUntil && new Date(d.lockedUntil) > new Date();
      const rows = [['Last sign-in', fmt(d.lastLoginAt)], ['Last sign-in IP', d.lastLoginIp || 'Not recorded'], ['Last sign-in source', d.lastLoginSource || 'Not recorded'], ['Password changed', d.passwordChangedAt ? fmt(d.passwordChangedAt) : 'Not recorded'], ['Active sessions', String(d.activeSessionCount == null ? '-' : d.activeSessionCount)], ['Account lock', lock ? 'Locked until ' + fmt(d.lockedUntil) : 'Not locked']];
      const sum = $('sx-summary'); clear(sum); sum.setAttribute('aria-busy', 'false');
      rows.forEach(r => sum.appendChild(h('div', {}, [h('dt', { text: r[0] }), h('dd', { text: r[1] })])));
      const list = $('sx-sess-list'); clear(list);
      const ss = d.sessions || [];
      if (!ss.length) list.appendChild(h('li', { class: 'pn-msg', text: 'No active sessions were reported.' }));
      ss.forEach(s => {
        const ok = UUID.test(String(s.id || ''));
        list.appendChild(h('li', { class: 'sx-s' + (s.current ? ' cur' : '') }, [
          h('div', {}, [h('b', { text: s.device || 'Unknown device' }), h('small', { text: 'IP ' + (s.ipAddress || '-') }), h('small', { text: 'Signed in ' + fmt(s.createdAt) + ' / Last active ' + fmt(s.lastSeenAt) }), h('small', { text: 'Expires ' + fmt(s.expiresAt) })]),
          s.current ? h('span', { class: 'pn-tag s-completed', text: 'Current session' }) : h('button', { type: 'button', class: 'pn-btn alt', text: 'Revoke', disabled: !ok || pending > 0, 'aria-label': 'Revoke session on ' + (s.device || 'unknown device'), 'data-revoke': s.id, onclick: ev => revoke(s.id, ev.currentTarget) })]));
      });
      syncOthers(d);
      const hb = $('sx-hist-body'); clear(hb);
      const hs = d.history || [];
      const LBL = { success: 'Successful', failed: 'Failed', locked: 'Locked', blocked: 'Blocked' };
      if (!hs.length) hb.appendChild(h('div', { class: 'pd-empty' }, [h('span', { text: 'No sign-in activity recorded yet.' })]));
      else hb.appendChild(h('div', { class: 'pn-tw' }, [h('table', { class: 'pn-tbl' }, [h('caption', { class: 'sr-only', text: 'Recent sign-in activity' }), h('thead', {}, [h('tr', {}, ['Date', 'Result', 'IP address', 'Device'].map(c => h('th', { scope: 'col', text: c })))]), h('tbody', {}, hs.map(x => h('tr', {}, [h('td', { text: fmt(x.createdAt) }), h('td', {}, [h('span', { class: 'pn-tag sx-r-' + String(x.result).replace(/[^a-z]/g, ''), text: LBL[x.result] || String(x.result) })]), h('td', { text: x.ipAddress || '-' }), h('td', { text: x.device || '-' })])))])]));
    };
    async function load(force) {
      if (loading) return;
      if (!force && Date.now() - lastLoad < 30000) return;
      loading = true; setBusy(true);
      try { const d = await call('/panel/security'); lastLoad = Date.now(); hasData = true; banner(''); render(d); }
      catch (err) {
        if (err.silent) return;
        banner(hasData ? 'Could not refresh security data; showing the last loaded information.' : (err.message || 'Could not load security data.'));
        if (!hasData) { const sm = $('sx-summary'); sm.setAttribute('aria-busy', 'false'); clear(sm); clear($('sx-sess-list')); clear($('sx-hist-body')); }
      } finally { loading = false; setBusy(false); }
    }
    const sessNote = (t, err) => { const n = $('sx-sess-msg'); clear(n); if (t) n.appendChild(h('div', { class: 'pn-msg' + (err ? ' err' : ''), role: err ? 'alert' : 'status', text: t })); };
    async function mutate(path, okText) {
      pending++; sessNote(''); syncOthers(model); document.querySelectorAll('[data-revoke]').forEach(b => { b.disabled = true; });
      try { const d = await call(path, 'POST', {}); sessNote(okText(d), false); }
      catch (err) { if (!err.silent) sessNote(err.message || 'Could not complete the request.', true); }
      finally { pending--; await load(true); }
    }
    function revoke(id, btn) { if (!UUID.test(String(id))) return; btn.textContent = 'Revoking...'; mutate('/panel/security/sessions/' + id + '/revoke', () => 'Session revoked.'); }
    $('sx-others').addEventListener('click', () => mutate('/panel/security/sessions/revoke-others', d => typeof d.affected === 'number' ? d.affected + ' other session(s) signed out.' : 'Other sessions signed out.'));
    $('sx-refresh').addEventListener('click', () => load(true));
    const form = $('sx-pw'); const btn = form.querySelector('button[type=submit]'); let busy = false;
    form.addEventListener('submit', async ev => {
      ev.preventDefault(); if (busy) return;
      const v = n => form.elements[n].value;
      const f = {};
      if (!v('currentPassword')) f.currentPassword = 'Enter your current password.';
      const l = lenCheck(v('newPassword'), 'New password'); if (l) f.newPassword = l;
      if (v('confirmPassword') !== v('newPassword')) f.confirmPassword = 'Passwords do not match.';
      fieldErrors(form, f);
      if (Object.keys(f).length) { show(form, 'Please fix the highlighted fields.', true); const first = form.querySelector('[aria-invalid=true]'); if (first) first.focus(); return; }
      busy = true; btn.disabled = true; show(form, 'Updating password...', false);
      try {
        await call('/panel/security/password', 'POST', { currentPassword: v('currentPassword'), newPassword: v('newPassword'), confirmPassword: v('confirmPassword') });
        form.reset(); fieldErrors(form, null); show(form, 'Password updated.', false); load(true);
      } catch (err) { if (!err.silent) { fieldErrors(form, err.fields); show(form, err.message, true); } }
      finally { busy = false; btn.disabled = false; }
    });
    load(true);
    window.addEventListener('focus', () => load(false));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(false); });
  }

  const post = async (url, body) => {
    const res = await fetch(url, { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: HDR, body: JSON.stringify(body) });
    let d = {}; try { d = await res.json(); } catch (_) {}
    if (!res.ok) { const err = new Error(d.error || 'Something went wrong. Please try again.'); err.fields = d.fields || {}; throw err; }
    return d;
  };
  const rec = document.querySelector('form[data-recovery]');
  if (rec) {
    const kind = rec.dataset.recovery, submit = rec.querySelector('button[type=submit]');
    let token = '';
    if (kind === 'reset') {
      const m = /^#token=([0-9a-fA-F]{64})$/.exec(location.hash);
      if (m) token = m[1].toLowerCase();
      if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} }
      if (!token) { document.querySelector('[data-notoken]').hidden = false; rec.querySelectorAll('input,button').forEach(i => { i.disabled = true; }); }
    }
    let busy = false;
    rec.addEventListener('submit', async ev => {
      ev.preventDefault(); if (busy) return;
      const v = n => rec.elements[n].value;
      fieldErrors(rec, null);
      let body;
      if (kind === 'forgot') {
        const id = v('identifier').trim();
        if (!id) { fieldErrors(rec, { identifier: 'Enter your email, username or client code.' }); show(rec, 'Please fix the highlighted field.', true); return; }
        body = { identifier: id };
      } else {
        const f = {}; const l = lenCheck(v('newPassword'), 'New password'); if (l) f.newPassword = l;
        if (v('confirmPassword') !== v('newPassword')) f.confirmPassword = 'Passwords do not match.';
        if (Object.keys(f).length) { fieldErrors(rec, f); show(rec, 'Please fix the highlighted fields.', true); return; }
        body = { token, newPassword: v('newPassword'), confirmPassword: v('confirmPassword') };
      }
      busy = true; submit.disabled = true; show(rec, 'Sending...', false);
      try {
        await post(rec.dataset.endpoint, body);
        if (kind === 'forgot') { rec.reset(); show(rec, 'Request received. No email delivery is configured, so nothing was sent. Please contact your reseller to recover access.', false); }
        else { token = ''; rec.reset(); rec.hidden = true; document.querySelector('[data-done]').hidden = false; document.querySelector('[data-back]').hidden = true; show(rec, '', false); }
      } catch (err) { fieldErrors(rec, err.fields); show(rec, err.message, true); }
      finally { busy = false; submit.disabled = kind === 'reset' && !token; }
    });
  }
})();`;

export const securityScriptHash = createHash('sha256').update(SECURITY_SCRIPT).digest('base64');
