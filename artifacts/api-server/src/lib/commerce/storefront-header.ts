import { escapeHTML, safePublicHref } from '../public-site/safety';
import { renderLogo } from '../public-site/components/header';
import type { PublicSiteModel } from '../public-site/model';
import type { storefrontPreferences } from './storefront-preferences';

type Preferences = ReturnType<typeof storefrontPreferences>;
const e = escapeHTML;

function selectors(p: Preferences, suffix: string): string {
  return `<div class="sf-selectors">
<details class="sf-picker" data-sf-picker="currency"><summary aria-label="Choose currency"><span data-sf-currency>${e(p.defaultCurrency)}</span><span aria-hidden="true">▾</span></summary>
<div class="sf-options" role="group" aria-label="Currencies">${p.currencies.map(c => `<button type="button" data-sf-currency-option="${e(c.code)}" aria-pressed="${c.code === p.defaultCurrency}">${e(c.code)} <small>${e(c.name)}${c.client_default ? ' · Default' : ''}</small></button>`).join('')}</div></details>
<details class="sf-picker" data-sf-picker="language"><summary aria-label="Choose language"><img data-sf-flag src="https://flagcdn.com/w40/gb.png" alt="" width="20" height="14"><span data-sf-language>English</span><span aria-hidden="true">▾</span></summary>
<div class="sf-options" role="group" aria-label="Languages" id="sf-languages-${suffix}">${p.languages.map(l => `<button type="button" data-sf-language-option="${e(l.code)}" aria-pressed="${l.code === 'en'}"><img src="https://flagcdn.com/w40/${l.flag}.png" alt="" width="20" height="14" loading="lazy"><span>${e(l.name)}</span>${l.code !== 'en' ? '<small>English fallback</small>' : ''}</button>`).join('')}</div></details>
</div>`;
}
function auth() {
  return '<div class="sf-auth"><button type="button" class="sf-login" data-sf-auth="Login">Login</button><button type="button" class="sf-register" data-sf-auth="Register">Register</button></div>';
}
export function renderStorefrontHeader(m: PublicSiteModel, slug: string, p: Preferences): string {
  const links = `<a href="/${slug}#store-products">Products</a>` + m.navigation.map(l => `<a href="/${slug}${e(safePublicHref(l.href))}">${e(l.label)}</a>`).join('');
  const cart = `<a class="cx-hdr-link" href="/${slug}/cart" data-cx-cart-link aria-label="Cart">Cart <span data-cx-count>0</span></a>`;
  return `<header class="site-header sf-header"><div class="wrap bar">
${renderLogo(m).replace('href="#home"', `href="/${slug}#home"`)}
<nav class="nav-desktop" aria-label="Primary">${links}</nav>
<div class="sf-desktop">${cart}${selectors(p, 'desktop')}${auth()}</div>
<details class="menu"><summary aria-label="Open mobile menu" aria-controls="mobile-navigation"><span class="burger" aria-hidden="true"></span></summary>
<div class="menu-panel" id="mobile-navigation"><nav aria-label="Mobile">${links}${cart}</nav>${selectors(p, 'mobile')}${auth()}</div></details>
</div><div class="wrap sf-notice" data-sf-notice role="status" hidden></div></header>`;
}
export const STOREFRONT_AUTH_NOTICE = `<dialog class="sf-auth-dialog" id="sf-customer-auth" aria-labelledby="sf-auth-title">
<h2 id="sf-auth-title">Customer access</h2><p>Customer Login and Register are not available yet. You can browse the store and place a guest order. This is not the subscriber or administrator login.</p>
<form method="dialog"><button class="cx-btn" autofocus>Close</button></form></dialog>`;

export const STOREFRONT_HEADER_STYLES = `
.sf-header .sf-desktop{display:none}.sf-header .bar{gap:10px}.sf-selectors,.sf-auth{display:flex;gap:8px;align-items:center;min-width:0}
.sf-picker{position:relative;min-width:0}.sf-picker summary{display:flex;align-items:center;gap:7px;min-height:40px;padding:7px 10px;border:1px solid var(--line);border-radius:9px;background:var(--card);font-size:13px;font-weight:600;cursor:pointer;list-style:none}.sf-picker summary::-webkit-details-marker{display:none}
.sf-picker img{object-fit:cover;flex:none;border:1px solid var(--line);border-radius:2px}.sf-picker summary span[data-sf-language]{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sf-options{position:absolute;inset-inline-end:0;top:calc(100% + 6px);width:260px;max-width:calc(100vw - 40px);max-height:min(360px,50dvh);overflow-y:auto;overscroll-behavior:contain;padding:5px;border:1px solid var(--line);border-radius:10px;background:var(--card);box-shadow:var(--sh);z-index:30}
.sf-options button{display:flex;align-items:center;gap:8px;text-align:start;width:100%;padding:10px 8px;min-height:40px;background:transparent;color:var(--ink);border:0;border-radius:6px;font:inherit;font-size:13px;cursor:pointer}.sf-options small{margin-inline-start:auto;font-size:10px;color:var(--muted)}.sf-options button[aria-pressed=true]{background:var(--line);font-weight:700}.sf-options button[aria-pressed=true]:after{content:"✓";color:var(--accent)}.sf-options button:hover{background:var(--line)}
.sf-auth button{min-height:40px;padding:7px 12px;border:1px solid var(--accent);border-radius:9px;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.sf-login{background:var(--card);color:var(--ink)}.sf-register{background:var(--accent);color:var(--accent-ink)}
.sf-header button:focus-visible,.sf-header .sf-picker summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.sf-notice{font-size:12px;color:var(--muted);padding-block:6px;overflow-wrap:anywhere}.sf-notice[hidden]{display:none}
.sf-auth-dialog{width:min(440px,calc(100% - 32px));max-height:80dvh;padding:24px;border:1px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink);margin:auto}.sf-auth-dialog::backdrop{background:#0008}.sf-auth-dialog p{line-height:1.6}
.sf-header .menu-panel>.sf-selectors{margin-block:14px;align-items:flex-start}.sf-header .menu-panel .sf-picker{flex:1}.sf-header .menu-panel .sf-picker summary{width:100%;min-height:44px}.sf-header .menu-panel .sf-options{position:static;width:100%;max-width:100%;box-shadow:none;margin-top:6px;max-height:220px}.sf-header .menu-panel .sf-options button{flex-wrap:wrap}.sf-header .menu-panel .sf-options small{flex-basis:100%;margin-inline-start:28px}.sf-header .menu-panel .sf-auth button{flex:1;min-height:44px}
@media(min-width:960px){.sf-header .sf-desktop{display:flex;align-items:center;gap:8px}.sf-header .brand{flex:1}.sf-header .brand-name{max-width:160px}.sf-header .nav-desktop a{padding:8px;font-size:13px}.sf-header .cx-hdr-link{padding:0 8px;font-size:13px}.sf-header .bar{flex-wrap:wrap;padding-block:8px}}
html[data-sf-direction=rtl] .sf-header .brand{margin-right:0;margin-inline-end:auto}
html[data-sf-direction=rtl] .cx{direction:rtl;text-align:start}
html[data-sf-direction=rtl] .cx-price{direction:ltr;unicode-bidi:isolate;text-align:start}
`;
