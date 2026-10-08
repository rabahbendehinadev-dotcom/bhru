import { createHash } from 'node:crypto';
import { escapeHTML as e } from '../public-site/safety';
import { renderHeader } from '../public-site/components/header';
import { renderStyles } from '../public-site/styles';
import { PUBLIC_MENU_SCRIPT, PUBLIC_MENU_SCRIPT_HASH } from '../public-site/mobile-menu';
import type { PublicSiteModel } from '../public-site/model';

type Profile = { firstName: string; lastName: string; email: string };
const localPath = (v: unknown): string | null =>
  typeof v === 'string' && /^\/(?!\/)[^\s"'<>\\]*$/.test(v) ? v : null;

/** Header actions. Without customerAccess context, nothing is rendered. */
export function renderCustomerActions(m: PublicSiteModel, mobile = false, commerce = false): string {
  const c = m.customerAccess;
  if (!c) return '';
  const login = localPath(c.loginHref), register = localPath(c.registerHref), account = localPath(c.accountHref),
    home = localPath(c.homeHref), api = localPath(c.apiBase);
  if (c.authenticated) {
    if (!account || !home || !api) return '';
    const label = 'My account';
    const out = `<button type="button" data-customer-logout data-endpoint="${e(api + '/logout')}" data-home="${e(home)}"`;
    if (commerce) return `<div class="sf-auth"><a class="sf-login" href="${e(account)}">${label}</a>${out} class="sf-register">Logout</button></div>`;
    if (mobile) return `<div class="ca-mobile"><a class="btn" href="${e(account)}">${label}</a>${out} class="btn ca-out">Logout</button></div>`;
    return `<div class="ca-actions"><a class="ca-link" href="${e(account)}">${label}</a>${out} class="ca-btn">Logout</button></div>`;
  }
  if (!login || !register) return '';
  if (commerce) return `<div class="sf-auth"><a class="sf-login" href="${e(login)}">Login</a><a class="sf-register" href="${e(register)}">Register</a></div>`;
  if (mobile) return `<div class="ca-mobile"><a class="btn" href="${e(login)}">Login</a><a class="btn" href="${e(register)}">Register</a></div>`;
  return `<div class="ca-actions"><a class="ca-link" href="${e(login)}">Login</a><a class="ca-btn" href="${e(register)}">Register</a></div>`;
}

export const CUSTOMER_AUTH_STYLES = `
.ca-actions{display:none;align-items:center;gap:8px}
.ca-link,.ca-btn,.sf-auth a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:10px;font:inherit;font-weight:700;font-size:15px;border:1.5px solid var(--accent);cursor:pointer}
.ca-link{background:transparent;color:var(--ink)}.ca-btn{background:var(--accent);color:var(--accent-ink)}.ca-link:hover{background:var(--line)}
.ca-btn:disabled,.ca-out:disabled{opacity:.6;cursor:wait}
.ca-mobile{display:grid;gap:0}.ca-mobile .btn{width:100%;font:inherit;font-weight:700;cursor:pointer}
.sf-auth a{min-height:40px;padding:7px 12px;border-radius:9px;font-size:13px}.sf-auth .sf-login{background:var(--card);color:var(--ink)}.sf-auth .sf-register{background:var(--accent);color:var(--accent-ink)}
.sf-header .menu-panel .sf-auth a{flex:1;min-height:44px}
@media(min-width:960px){.ca-actions{display:flex}}
.ca-page{min-height:calc(100dvh - 72px);display:grid;place-items:start center;padding:48px 20px 72px}
.ca-card{width:min(480px,100%);min-width:0;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:clamp(22px,5vw,36px);box-shadow:var(--sh)}
.ca-card h1{font-size:clamp(26px,6vw,34px);margin:0 0 8px}.ca-card .ca-sub{color:var(--muted);margin-bottom:22px}
.ca-form{display:grid;gap:16px}.ca-row{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
.ca-field{display:grid;gap:6px;min-width:0}.ca-field label{font-weight:700;font-size:14px}
.ca-field input{width:100%;min-height:48px;padding:0 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font:inherit}
.ca-field input:focus-visible{outline:3px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
.ca-field input[aria-invalid=true]{border-color:#b42318}.ca-ferr{font-size:13px;color:#b42318;min-height:0}.ca-ferr:empty{display:none}
.ca-status{padding:12px 14px;border-radius:12px;font-size:14px;border:1px solid var(--line);background:var(--bg)}.ca-status[hidden]{display:none}.ca-status.is-error{border-color:#b42318;color:#b42318}
.ca-submit{min-height:50px;border-radius:12px;border:1.5px solid var(--accent);background:var(--accent);color:var(--accent-ink);font:inherit;font-weight:700;cursor:pointer;width:100%}.ca-submit:disabled{opacity:.6;cursor:wait}
.ca-alt{margin-top:18px;font-size:14px;color:var(--muted)}.ca-alt a{color:var(--ink);font-weight:700;text-decoration:underline}
.ca-dl{display:grid;gap:14px;margin:20px 0}.ca-dl div{display:grid;gap:2px;padding-bottom:12px;border-bottom:1px solid var(--line)}.ca-dl dt{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.ca-dl dd{margin:0;font-weight:600;overflow-wrap:anywhere}
.ca-card .ca-out{width:100%;font:inherit;font-weight:700;min-height:50px;border-radius:12px;border:1.5px solid var(--ink);background:transparent;color:var(--ink);cursor:pointer}
@media(min-width:520px){.ca-row{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

export const CUSTOMER_AUTH_SCRIPT = String.raw`(() => {
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  const HEADERS = { 'Content-Type': 'application/json', 'X-BHRU-Customer-Request': '1' };
  const go = (next, fallback) => {
    let target = fallback || '/';
    try {
      const u = new URL(String(next || ''), window.location.href);
      if (u.origin === window.location.origin) target = u.href;
    } catch (_) {}
    window.location.assign(target);
  };
  const post = async (url, body) => {
    const res = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: HEADERS, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) { const err = new Error(data.error || 'Something went wrong. Please try again.'); err.fields = data.fields || {}; throw err; }
    return data;
  };
  document.querySelectorAll('[data-customer-logout]').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try { const d = await post(btn.dataset.endpoint, {}); go(d.next, btn.dataset.home); }
      catch (err) {
        btn.disabled = false;
        let notice = btn.parentElement.querySelector('[data-logout-error]');
        if (!notice) {
          notice = document.createElement('p');
          notice.className = 'ca-status is-error';
          notice.dataset.logoutError = '';
          notice.setAttribute('role', 'alert');
          btn.parentElement.appendChild(notice);
        }
        notice.textContent = err.message || 'Could not log out. Please try again.';
      }
    });
  });
  const reg = document.querySelector('[data-registered]');
  if (reg && new URLSearchParams(window.location.search).get('registered') === '1') reg.hidden = false;
  document.querySelectorAll('form[data-customer-form]').forEach(form => {
    const mode = form.dataset.customerForm;
    const status = form.querySelector('[data-status]');
    const submit = form.querySelector('button[type=submit]');
    const show = (msg, error) => { status.textContent = msg; status.hidden = !msg; status.classList.toggle('is-error', !!error); };
    const fieldErrors = fields => {
      form.querySelectorAll('input').forEach(i => {
        const out = form.querySelector('[data-error-for="' + i.name + '"]');
        const m = fields && fields[i.name];
        if (out) out.textContent = m ? String(m) : '';
        if (m) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
      });
    };
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      const v = n => (form.elements[n] ? form.elements[n].value : '');
      const body = mode === 'register'
        ? { firstName: v('firstName').trim(), lastName: v('lastName').trim(), email: v('email').trim(), password: v('password'), confirmPassword: v('confirmPassword') }
        : { email: v('email').trim(), password: v('password') };
      fieldErrors(null);
      if (mode === 'register' && body.password !== body.confirmPassword) {
        fieldErrors({ confirmPassword: 'Passwords do not match.' });
        show('Please correct the highlighted field.', true);
        return;
      }
      submit.disabled = true;
      show(mode === 'register' ? 'Creating your account...' : 'Signing in...', false);
      try {
        const d = await post(form.dataset.endpoint, body);
        if (mode === 'login') show('Signed in. Redirecting...', false);
        go(d.next, form.dataset.fallback);
      } catch (err) {
        fieldErrors(err.fields);
        show(err.message || 'Something went wrong. Please try again.', true);
        submit.disabled = false;
      }
    });
  });
})();`;

export const CUSTOMER_AUTH_HASH = createHash('sha256').update(CUSTOMER_AUTH_SCRIPT).digest('base64');

function field(id: string, label: string, type: string, auto: string, extra = ''): string {
  return `<div class="ca-field"><label for="ca-${id}">${label}</label><input id="ca-${id}" name="${id}" type="${type}" autocomplete="${auto}" required aria-describedby="ca-${id}-err"${extra}><div class="ca-ferr" id="ca-${id}-err" data-error-for="${id}" aria-live="polite"></div></div>`;
}

export function renderCustomerDocument(m: PublicSiteModel, mode: 'login' | 'register' | 'account', customer?: Profile): string {
  const ca = m.customerAccess;
  const home = localPath(ca?.homeHref) ?? '/';
  const api = localPath(ca?.apiBase) ?? '';
  const login = localPath(ca?.loginHref) ?? home, register = localPath(ca?.registerHref) ?? home, account = localPath(ca?.accountHref) ?? home;
  const copy: PublicSiteModel = { ...m };
  const header = renderHeader(copy).replace(/href="#([a-z][a-z0-9-]*)"/g, (_x, id) => `href="${e(home)}#${id}"`);
  let body = '';
  if (mode === 'login') {
    body = `<h1>Customer login</h1><p class="ca-sub">Sign in to ${e(m.siteName)}.</p>
<div class="ca-status" role="status" data-registered hidden>Registration processed. You can now sign in with your email and password.</div>
<form class="ca-form" method="post" action="${e(api + '/login')}" data-customer-form="login" data-endpoint="${e(api + '/login')}" data-fallback="${e(account)}" novalidate>
${field('email', 'Email', 'email', 'email', ' maxlength="254"')}${field('password', 'Password', 'password', 'current-password', ' maxlength="128"')}
<div class="ca-status" role="status" aria-live="polite" data-status hidden></div><button class="ca-submit" type="submit">Login</button></form>
<p class="ca-alt">New here? <a href="${e(register)}">Create an account</a></p>`;
  } else if (mode === 'register') {
    body = `<h1>Create your account</h1><p class="ca-sub">Register with ${e(m.siteName)}.</p>
<form class="ca-form" method="post" action="${e(api + '/register')}" data-customer-form="register" data-endpoint="${e(api + '/register')}" data-fallback="${e(login)}" novalidate>
<div class="ca-row">${field('firstName', 'First name', 'text', 'given-name', ' maxlength="100"')}${field('lastName', 'Last name', 'text', 'family-name', ' maxlength="100"')}</div>
${field('email', 'Email', 'email', 'email', ' maxlength="254"')}${field('password', 'Password (at least 8 characters)', 'password', 'new-password', ' minlength="8" maxlength="128"')}${field('confirmPassword', 'Confirm password', 'password', 'new-password', ' minlength="8" maxlength="128"')}
<div class="ca-status" role="status" aria-live="polite" data-status hidden></div><button class="ca-submit" type="submit">Register</button></form>
<p class="ca-alt">Already registered? <a href="${e(login)}">Login</a></p>`;
  } else {
    const c = customer ?? { firstName: '', lastName: '', email: '' };
    body = `<h1>My account</h1><p class="ca-sub">Your details with ${e(m.siteName)}.</p>
<dl class="ca-dl"><div><dt>Name</dt><dd>${e((c.firstName + ' ' + c.lastName).trim())}</dd></div><div><dt>Email</dt><dd>${e(c.email)}</dd></div></dl>
<button type="button" class="ca-out" data-customer-logout data-endpoint="${e(api + '/logout')}" data-home="${e(home)}">Logout</button>`;
  }
  const title = mode === 'login' ? 'Login' : mode === 'register' ? 'Register' : 'My account';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${e(title)} | ${e(m.siteName)}</title><style>${renderStyles(m)}${CUSTOMER_AUTH_STYLES}</style></head><body>
${header}<button type="button" class="mobile-menu-backdrop" aria-label="Close mobile menu" hidden></button>
 <main class="ca-page"><div class="ca-card">${body}<noscript><p class="ca-status">JavaScript is required for customer sign-in and registration.</p></noscript></div></main>
<script>${PUBLIC_MENU_SCRIPT}</script><script>${CUSTOMER_AUTH_SCRIPT}</script></body></html>`;
}

export const CUSTOMER_DOCUMENT_SCRIPT_HASHES = [PUBLIC_MENU_SCRIPT_HASH, CUSTOMER_AUTH_HASH];
