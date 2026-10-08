import { createHash } from 'node:crypto';
import { escapeHTML as e } from '../public-site/safety';

export const ONBOARDING_STYLES = `
.ca-card.ca-wide{width:min(720px,100%)}
.ob-nav [hidden],.ob-step[hidden]{display:none!important}
.ob-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 22px;padding:0;list-style:none}
.ob-steps li{padding:10px 8px;border-top:4px solid var(--line);font-size:12px;font-weight:700;color:var(--muted)}
.ob-steps li[aria-current=step]{border-color:var(--accent);color:var(--ink)}.ob-steps li.is-done{border-color:var(--accent)}
.ob-step[hidden]{display:none}.ob-step:focus{outline:none}.ob-step h2{font-size:20px;margin:0 0 14px}
.ob-grid{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
.ca-field select,.ca-field textarea{width:100%;min-height:48px;padding:0 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font:inherit}
.ca-field select:focus-visible{outline:3px solid var(--accent);outline-offset:1px}.ca-field select[aria-invalid=true]{border-color:#b42318}
.ob-phone{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:center}.ob-plus{font-weight:700;font-size:18px}
.ob-hint{font-size:12px;color:var(--muted)}.ob-check{display:flex;gap:10px;align-items:flex-start;font-size:14px}.ob-check input{width:20px;height:20px;margin-top:2px;flex:none}
.ob-nav{display:flex;gap:12px;justify-content:space-between;margin-top:22px}.ob-nav .ca-submit{width:auto;min-width:130px;padding:0 22px}
.ob-nav .ob-prev{background:transparent;color:var(--ink);border-color:var(--ink)}
.ob-cap{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.ob-cap img{height:56px;max-width:100%;border-radius:8px;border:1px solid var(--line);background:#fff}
.ob-cap button{min-height:44px;padding:0 14px;border-radius:10px;border:1.5px solid var(--ink);background:transparent;color:var(--ink);font:inherit;font-weight:700;cursor:pointer}
@media(min-width:620px){.ob-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ob-grid .ob-full{grid-column:1/-1}}
`;

export const ONBOARDING_SCRIPT = String.raw`(() => {
  const form = document.querySelector('form[data-onboarding]');
  if (!form) return;
  const api = form.dataset.api;
  const H = { 'Content-Type': 'application/json', 'X-BHRU-Customer-Request': '1' };
  const steps = Array.from(form.querySelectorAll('.ob-step'));
  const marks = Array.from(document.querySelectorAll('.ob-steps li'));
  const status = form.querySelector('[data-status]');
  const prev = form.querySelector('[data-prev]'), next = form.querySelector('[data-next]'), submit = form.querySelector('[data-submit]');
  let cur = 0, challengeId = '', busy = false;
  const el = n => form.elements[n];
  const val = n => { const x = el(n); return x ? (x.type === 'checkbox' ? x.checked : x.value) : ''; };
  const show = (msg, err) => { status.textContent = msg; status.hidden = !msg; status.classList.toggle('is-error', !!err); };
  const setErr = (n, m) => {
    const out = form.querySelector('[data-error-for="' + n + '"]'), i = el(n);
    if (out) out.textContent = m || '';
    if (i && i.setAttribute) { if (m) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); }
  };
  const phone = () => {
    const cc = String(val('dialCode')).replace(/\D/g, ''), nat = String(val('nationalPhone')).replace(/[^0-9]/g, '');
    return cc && nat ? '+' + cc + nat : '';
  };
  const rules = [
    () => {
      const r = {}, em = String(val('email')).trim(), un = String(val('username')).trim(), p = val('password'), c = val('confirmPassword'), ph = phone();
      if (em.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) r.email = 'Enter a valid email address.';
      if (un && !/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(un)) r.username = 'Use 3 to 32 letters, numbers, dashes or underscores, starting with a letter or number.';
      if (!/^\d{1,3}$/.test(String(val('dialCode')).replace(/\D/g, ''))) r.dialCode = 'Enter the country dialing code (1 to 3 digits), for example 39.';
      else if (!/^\+[1-9]\d{6,14}$/.test(ph)) r.nationalPhone = 'Enter a valid WhatsApp number (7 to 15 digits in total including the code).';
      if (p.length < 8 || p.length > 128) r.password = 'Password must be 8 to 128 characters.';
      if (c !== p) r.confirmPassword = 'Passwords do not match.';
      if (!val('preferredLanguage')) r.preferredLanguage = 'Choose a language.';
      if (!val('preferredCurrency')) r.preferredCurrency = 'Choose a currency.';
      return r;
    },
    () => {
      const r = {};
      if (!String(val('firstName')).trim()) r.firstName = 'First name is required.';
      if (!String(val('lastName')).trim()) r.lastName = 'Last name is required.';
      if (!val('countryCode')) r.countryCode = 'Choose your country.';
      return r;
    },
    () => {
      const r = {};
      if (!val('termsAccepted')) r.termsAccepted = 'You must accept the terms to register.';
      if (!challengeId) r.challengeAnswer = 'Load the verification image first.';
      else if (!String(val('challengeAnswer')).trim()) r.challengeAnswer = 'Type the characters from the image.';
      return r;
    },
  ];
  const names = ['email','username','dialCode','nationalPhone','password','confirmPassword','preferredLanguage','preferredCurrency','firstName','lastName','addressLine1','addressLine2','countryCode','state','city','postalCode','termsAccepted','challengeAnswer'];
  const validate = i => {
    const r = rules[i]();
    const own = Array.from(steps[i].querySelectorAll('[name]')).map(x => x.name);
    own.forEach(n => setErr(n, r[n]));
    const first = own.find(n => r[n]);
    if (first) { show('Please correct the highlighted fields.', true); el(first).focus(); return false; }
    show('', false); return true;
  };
  const go = (i, focus) => {
    cur = i;
    steps.forEach((s, k) => { s.hidden = k !== i; });
    marks.forEach((m, k) => { m.classList.toggle('is-done', k < i); if (k === i) m.setAttribute('aria-current', 'step'); else m.removeAttribute('aria-current'); });
    prev.hidden = i === 0; next.hidden = i === steps.length - 1; submit.hidden = i !== steps.length - 1;
    if (i === steps.length - 1 && !challengeId) loadChallenge();
    if (focus) { steps[i].setAttribute('tabindex', '-1'); steps[i].focus(); }
  };
  async function loadChallenge() {
    const img = form.querySelector('[data-cap-img]');
    challengeId = ''; el('challengeAnswer').value = '';
    try {
      const res = await fetch(api + '/challenge', { method: 'POST', credentials: 'same-origin', headers: H, body: '{}' });
      const d = await res.json();
      if (!res.ok || !d.image) throw new Error();
      challengeId = d.id; img.src = d.image;
    } catch (_) { img.removeAttribute('src'); show('Could not load the verification image. Use Refresh to retry.', true); }
  }
  async function loadOptions() {
    try {
      const res = await fetch(api + '/options', { credentials: 'same-origin' });
      const d = await res.json();
      if (!res.ok) throw new Error();
      const fill = (n, list, def) => { const s = el(n); (list || []).forEach(o => { const op = document.createElement('option'); op.value = o.code; op.textContent = o.name + (n === 'preferredCurrency' ? ' (' + o.code + ')' : ''); s.appendChild(op); }); if (def) s.value = def; };
      fill('preferredLanguage', d.languages, (d.languages || [])[0] && d.languages[0].code);
      fill('preferredCurrency', d.currencies, d.defaultCurrency);
      fill('countryCode', d.countries, '');
    } catch (_) { show('Could not load registration options. Please reload the page.', true); next.disabled = true; }
  }
  next.addEventListener('click', () => { if (validate(cur)) go(cur + 1, true); });
  prev.addEventListener('click', () => { show('', false); go(cur - 1, true); });
  form.querySelector('[data-refresh]').addEventListener('click', loadChallenge);
  form.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.tagName !== 'BUTTON' && cur < steps.length - 1) { ev.preventDefault(); next.click(); } });
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (busy) return;
    for (let i = 0; i < steps.length; i++) if (!validate(i)) { go(i, false); validate(i); return; }
    busy = true; submit.disabled = true; show('Creating your account...', false);
    const body = {
      username: String(val('username')).trim() || undefined, whatsappPhone: phone(),
      firstName: String(val('firstName')).trim(), lastName: String(val('lastName')).trim(), email: String(val('email')).trim(),
      password: val('password'), confirmPassword: val('confirmPassword'),
      preferredLanguage: val('preferredLanguage'), preferredCurrency: val('preferredCurrency'), newsletterOptIn: !!val('newsletterOptIn'),
      addressLine1: val('addressLine1'), addressLine2: val('addressLine2'), countryCode: val('countryCode'),
      state: val('state'), city: val('city'), postalCode: val('postalCode'),
      termsAccepted: !!val('termsAccepted'), challengeId, challengeAnswer: String(val('challengeAnswer')).trim(),
    };
    try {
      const res = await fetch(api + '/register', { method: 'POST', credentials: 'same-origin', headers: H, body: JSON.stringify(body) });
      let d = {}; try { d = await res.json(); } catch (_) {}
      if (!res.ok) { const err = new Error(d.error || 'Registration failed. Please try again.'); err.fields = d.fields || {}; throw err; }
      let t = form.dataset.fallback;
      try { const u = new URL(String(d.next || ''), window.location.href); if (u.origin === window.location.origin) t = u.href; } catch (_) {}
      window.location.assign(t);
    } catch (err) {
      busy = false; submit.disabled = false;
      const f = err.fields || {}; let target = -1;
      names.forEach(n => { if (f[n]) { setErr(n, String(f[n])); const k = steps.findIndex(s => s.querySelector('[name="' + n + '"]')); if (k >= 0 && (target < 0 || k < target)) target = k; } });
      if (target >= 0 && target !== cur) go(target, false);
      show(err.message || 'Registration failed. Please try again.', true);
      loadChallenge();
    }
  });
  loadOptions(); go(0, false);
})();`;

export const ONBOARDING_HASH = createHash('sha256').update(ONBOARDING_SCRIPT).digest('base64');

const fld = (id: string, label: string, type: string, auto: string, extra = '', req = true, hint = ''): string =>
  `<div class="ca-field"><label for="ob-${id}">${label}${req ? '' : ' (optional)'}</label><input id="ob-${id}" name="${id}" type="${type}" autocomplete="${auto}"${req ? ' required' : ''} aria-describedby="ob-${id}-err${hint ? ` ob-${id}-hint` : ''}"${extra}>${hint ? `<div class="ob-hint" id="ob-${id}-hint">${hint}</div>` : ''}<div class="ca-ferr" id="ob-${id}-err" data-error-for="${id}" aria-live="polite"></div></div>`;
const sel = (id: string, label: string, auto: string): string =>
  `<div class="ca-field"><label for="ob-${id}">${label}</label><select id="ob-${id}" name="${id}" autocomplete="${auto}" required aria-describedby="ob-${id}-err"><option value="">Loading...</option></select><div class="ca-ferr" id="ob-${id}-err" data-error-for="${id}" aria-live="polite"></div></div>`;

export function renderRegistrationWizard(api: string, login: string, siteName: string): string {
  const steps = ['Account Information', 'Billing Details', 'Verification'];
  return `<h1>Create your account</h1><p class="ca-sub">Register with ${e(siteName)}.</p>
<ol class="ob-steps" aria-label="Registration progress">${steps.map((s, i) => `<li${i === 0 ? ' aria-current="step"' : ''}><span class="sr-only">Step ${i + 1}: </span>${i + 1}. ${s}</li>`).join('')}</ol>
<form class="ca-form" method="post" action="${e(api + '/register')}" data-onboarding data-api="${e(api)}" data-fallback="${e(login)}" novalidate>
<fieldset class="ob-step" style="border:0;padding:0;margin:0;min-width:0"><legend><h2>Account Information</h2></legend><div class="ob-grid">
${fld('email', 'Email or login email', 'email', 'email', ' maxlength="254"')}
${fld('username', 'Username', 'text', 'username', ' maxlength="32"', false, '3 to 32 letters, numbers, dashes or underscores. Leave blank and we will generate a client code for you.')}
<div class="ca-field ob-full"><label for="ob-dialCode">WhatsApp number</label><div class="ob-phone"><span class="ob-plus" aria-hidden="true">+</span><input id="ob-dialCode" name="dialCode" inputmode="numeric" autocomplete="tel-country-code" maxlength="4" size="4" aria-label="Country dialing code" placeholder="39" style="width:84px;min-height:48px;padding:0 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font:inherit"><input id="ob-nationalPhone" name="nationalPhone" inputmode="tel" autocomplete="tel-national" maxlength="24" aria-label="National number" placeholder="333 1234567" aria-describedby="ob-phone-hint ob-nationalPhone-err ob-dialCode-err" style="width:100%;min-height:48px;padding:0 14px;border-radius:12px;border:1.5px solid var(--line);background:var(--bg);color:var(--ink);font:inherit"></div><div class="ob-hint" id="ob-phone-hint">Dialing code first, then your number. Spaces and dashes are ignored; keep any leading zero. Maximum 15 digits in total.</div><div class="ca-ferr" id="ob-dialCode-err" data-error-for="dialCode" aria-live="polite"></div><div class="ca-ferr" id="ob-nationalPhone-err" data-error-for="nationalPhone" aria-live="polite"></div></div>
${fld('password', 'Password (at least 8 characters)', 'password', 'new-password', ' minlength="8" maxlength="128"')}
${fld('confirmPassword', 'Confirm password', 'password', 'new-password', ' minlength="8" maxlength="128"')}
${sel('preferredLanguage', 'Preferred language', 'language')}${sel('preferredCurrency', 'Preferred currency', 'off')}
<label class="ob-check ob-full"><input type="checkbox" name="newsletterOptIn"> <span>Send me news and offers by email.</span></label>
</div></fieldset>
<fieldset class="ob-step" hidden style="border:0;padding:0;margin:0;min-width:0"><legend><h2>Billing Details</h2></legend><div class="ob-grid">
${fld('firstName', 'First name', 'text', 'given-name', ' maxlength="100"')}${fld('lastName', 'Last name', 'text', 'family-name', ' maxlength="100"')}
<div class="ob-full">${fld('addressLine1', 'Address line 1', 'text', 'address-line1', ' maxlength="200"', false)}</div><div class="ob-full">${fld('addressLine2', 'Address line 2', 'text', 'address-line2', ' maxlength="200"', false)}</div>
${sel('countryCode', 'Country', 'country')}${fld('state', 'State / province', 'text', 'address-level1', ' maxlength="100"', false)}
${fld('city', 'City', 'text', 'address-level2', ' maxlength="100"', false)}${fld('postalCode', 'Postal code', 'text', 'postal-code', ' maxlength="24"', false)}
</div></fieldset>
<fieldset class="ob-step" hidden style="border:0;padding:0;margin:0;min-width:0"><legend><h2>Verification</h2></legend><div class="ob-grid">
<div class="ca-field ob-full"><span id="ob-cap-label" style="font-weight:700;font-size:14px">Type the characters shown</span><div class="ob-cap"><img data-cap-img alt="Verification image. The characters are only shown visually; contact the store if you cannot read them." width="180" height="56"><button type="button" data-refresh>Refresh image</button></div></div>
${fld('challengeAnswer', 'Characters from the image', 'text', 'off', ' maxlength="16" autocapitalize="off" spellcheck="false"')}
<div class="ca-field ob-full"><label class="ob-check"><input type="checkbox" name="termsAccepted" aria-describedby="ob-termsAccepted-err"> <span>I accept the terms of service and privacy policy of ${e(siteName)}.</span></label><div class="ca-ferr" id="ob-termsAccepted-err" data-error-for="termsAccepted" aria-live="polite"></div></div>
</div></fieldset>
<div class="ca-status" role="status" aria-live="polite" data-status hidden></div>
<div class="ob-nav"><button type="button" class="ca-submit ob-prev" data-prev hidden>Previous</button><button type="button" class="ca-submit" data-next>Next</button><button type="submit" class="ca-submit" data-submit hidden>Create account</button></div></form>
<p class="ca-alt">Already registered? <a href="${e(login)}">Login</a></p>`;
}
