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

export const PANEL_HEADER_STYLES = `
.site-header.ph{background:var(--card);backdrop-filter:none}
.ph .wrap{width:min(1400px,100% - 32px)}.ph .bar{min-height:56px;gap:14px}.ph-brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:15px;min-width:0;margin-right:auto}
.ph-logo{height:36px;width:auto;max-width:120px;object-fit:contain}.ph-brand span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.ph-nav{display:none;align-items:center;gap:2px;margin:0 auto}.ph-nav a{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border-radius:8px;font-size:13px;font-weight:500;color:var(--muted)}
.ph-nav a:hover{background:var(--line);color:var(--ink)}.ph-nav a[aria-current=page]{background:color-mix(in srgb,var(--accent) 12%,var(--bg));color:var(--ink);font-weight:600}
.ph-right{display:none;align-items:center;gap:10px;margin-left:auto}.ph-mbal{margin-left:auto}.ph-bal{display:grid;line-height:1.2;text-align:right;padding:4px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card)}
.ph-bal b{font-size:13px;font-weight:600}.ph-bal small{font-size:11px;color:var(--muted)}
.ph-acct{position:relative}.ph-acct>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;min-height:36px;padding:0 6px;border-radius:8px;font-size:13px;font-weight:500}.ph-acct>summary::-webkit-details-marker{display:none}.ph-acct>summary:hover{background:var(--line)}
.ph-av{width:26px;height:26px;border-radius:50%;background:var(--accent);color:var(--accent-ink);display:grid;place-items:center;font-size:12px;font-weight:600}
.ph-name{max-width:96px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ph-bal{max-width:180px;overflow-wrap:anywhere}
.ph-drop{position:absolute;right:0;top:100%;min-width:180px;background:var(--card);border:1px solid var(--line);border-radius:10px;box-shadow:var(--sh);padding:4px;display:grid;z-index:30}
.ph-drop a,.ph-drop button{min-height:36px;padding:0 10px;display:flex;align-items:center;border-radius:6px;font:inherit;font-size:13px;font-weight:500;background:none;border:0;color:var(--ink);cursor:pointer;width:100%;text-align:left}.ph-drop a:hover,.ph-drop button:hover{background:var(--line)}
.ph a:focus-visible,.ph summary:focus-visible,.ph button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media(min-width:960px){.ph-brand{margin-right:0}.ph-nav,.ph-right{display:flex}.ph-mbal{display:none}}
@media(min-width:960px) and (max-width:1199px){.ph-nav a{padding-inline:8px}.ph-logo{max-width:88px}.ph-brand span{max-width:130px}.ph-name{max-width:64px}.ph-bal{max-width:140px}.ph .bar{gap:10px}}
`;
export interface PanelHeaderOptions { page: string; firstName?: string }

function renderPanelHeader(m: PublicSiteModel, o: PanelHeaderOptions): string {
  const c = m.customerAccess;
  const home = localPath(c?.homeHref) ?? '/';
  const api = localPath(c?.apiBase) ?? '';
  const base = (localPath(c?.accountHref) ?? '').replace(/\/(account|dashboard)\/?$/, '');
  const href = (p: string) => e(`${base}/${p}`);
  const logo = safeImg(m.logo);
  const name = (o.firstName ?? '').trim();
  const brand = `<a class="brand ph-brand" href="${href('dashboard')}">${logo ? `<img class="ph-logo" src="${e(logo)}" alt="" height="36">` : ''}<span>${e(m.siteName)}</span></a>`;
  const nav = LINKS.map(([p, t]) => `<a href="${href(p)}"${p === o.page ? ' aria-current="page"' : ''}>${e(t)}</a>`).join('');
  const bal = `<div class="ph-bal" aria-live="polite"><b data-hdr-bal>Loading balance</b><small data-hdr-cur></small></div>`;
  const out = (cls: string) => `<button type="button" data-customer-logout data-endpoint="${e(api + '/logout')}" data-home="${e(home)}" class="${cls}">Logout</button>`;
  const drop = MORE.map(([p, t]) => `<a href="${href(p)}"${p === o.page ? ' aria-current="page"' : ''}>${e(t)}</a>`).join('') + `<a href="${e(home)}">Public website</a>` + out('ch-out');
  const mob = [...LINKS, ...MORE].map(([p, t]) => `<a href="${href(p)}"${p === o.page ? ' aria-current="page"' : ''}>${e(t)}</a>`).join('');
  return `<header class="site-header ph"><div class="wrap bar">${brand}<nav class="ph-nav" aria-label="Customer panel">${nav}</nav><div class="ph-right">${bal}<details class="ph-acct"><summary aria-label="Account menu"><span class="ph-av" aria-hidden="true">${e((name || 'A').charAt(0).toUpperCase())}</span><span class="ph-name">${e(name || 'Account')}</span><svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></summary><div class="ph-drop">${drop}</div></details></div>
<details class="menu"><summary aria-controls="mobile-navigation" aria-label="Open mobile menu"><span class="burger" aria-hidden="true"></span></summary><div class="menu-panel" id="mobile-navigation"><nav class="ch-mob" aria-label="Customer mobile navigation">${mob}<a href="${e(home)}">Public website</a>${out('ch-out')}</nav></div></details></div></header>`;
}

export function renderClientHeader(m: PublicSiteModel, panel?: PanelHeaderOptions): string {
  if (panel) return renderPanelHeader(m, panel);
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
