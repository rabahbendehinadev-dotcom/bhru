import { escapeHTML as e } from '../public-site/safety';
import type { PublicSiteModel } from '../public-site/model';

const localPath = (v: unknown): string | null => (typeof v === 'string' && /^\/(?!\/)[^\s"'<>\\]*$/.test(v) ? v : null);
const safeImg = (v: unknown): string | null => (typeof v === 'string' && (/^\/(?!\/)[^\s"'<>\\]*$/.test(v) || /^https:\/\/[^\s"'<>\\]+$/.test(v) || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) ? v : null);

const LINKS: [string, string][] = [['dashboard', 'Dashboard'], ['services', 'Place Order'], ['orders', 'Orders'], ['wallet', 'Wallet'], ['announcements', 'Announcements']];
const MORE: [string, string][] = [['transactions', 'Transactions'], ['profile', 'Profile'], ['security', 'Security']];

export const CLIENT_HEADER_STYLES = `
.ch-nav{display:none;align-items:center;gap:2px}.ch-nav>a,.ch-acct>summary{display:inline-flex;align-items:center;min-height:44px;padding:0 8px;border-radius:10px;font-weight:700;font-size:13px;color:var(--muted);cursor:pointer;list-style:none}
.ch-brand{flex:1;min-width:0;gap:10px}.ch-brand span{min-width:0;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ch-brand:focus-visible,.ch-nav a:focus-visible,.ch-acct summary:focus-visible,.ch-drop button:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.ch-acct>summary::-webkit-details-marker{display:none}.ch-nav>a:hover,.ch-acct>summary:hover{background:var(--line);color:var(--ink)}
.ch-acct{position:relative}.ch-drop{position:absolute;right:0;top:100%;min-width:190px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--sh);padding:6px;display:grid;z-index:30}
.ch-drop a,.ch-drop button{min-height:44px;padding:0 12px;display:flex;align-items:center;border-radius:8px;font:inherit;font-weight:600;font-size:14px;color:var(--ink);background:none;border:0;text-align:left;cursor:pointer;width:100%}
.ch-drop a:hover,.ch-drop button:hover{background:var(--line)}.ch-site{font-size:13px;color:var(--muted);text-decoration:underline}
.ch-logo{height:36px;width:auto;max-width:72px;object-fit:contain}.ch-mob{display:grid;gap:0}.ch-mob a,.ch-mob button{min-height:44px;display:flex;align-items:center;font:inherit;font-weight:700;color:var(--ink);background:none;border:0;border-bottom:1px solid var(--line);padding:0 4px;text-align:left;cursor:pointer;width:100%}
@media(min-width:960px){.ch-nav{display:flex}}
`;

export function renderClientHeader(m: PublicSiteModel): string {
  const c = m.customerAccess;
  const home = localPath(c?.homeHref) ?? '/';
  const api = localPath(c?.apiBase) ?? '';
  const acct = localPath(c?.accountHref) ?? '';
  const base = acct.replace(/\/(account|dashboard)\/?$/, '');
  const href = (p: string) => e(`${base}/${p}`);
  const logo = safeImg(m.logo);
  const brand = `<a class="brand ch-brand" href="${e(home)}">${logo ? `<img class="ch-logo" src="${e(logo)}" alt="" width="140" height="36">` : ''}<span>${e(m.siteName)}</span></a>`;
  const logout = (cls: string) => `<button type="button" data-customer-logout data-endpoint="${e(api + '/logout')}" data-home="${e(home)}" class="${cls}">Logout</button>`;
  const drop = MORE.map(([p, t]) => `<a href="${href(p)}">${e(t)}</a>`).join('') + logout('ch-out');
  const mob = [...LINKS, ...MORE].map(([p, t]) => `<a href="${href(p)}">${e(t)}</a>`).join('');
  return `<header class="site-header"><div class="wrap bar">${brand}<nav class="ch-nav" aria-label="Customer"><a href="${href('dashboard')}">Dashboard</a>${LINKS.slice(1).map(([p, t]) => `<a href="${href(p)}">${e(t)}</a>`).join('')}<details class="ch-acct"><summary>Account</summary><div class="ch-drop">${drop}</div></details><a class="ch-site" href="${e(home)}">Public website</a></nav>
<details class="menu"><summary aria-controls="mobile-navigation" aria-label="Open mobile menu"><span class="burger" aria-hidden="true"></span></summary><div class="menu-panel" id="mobile-navigation"><nav class="ch-mob" aria-label="Customer mobile navigation">${mob}<a href="${e(home)}">Public website</a>${logout('ch-out')}</nav></div></details></div></header>`;
}
