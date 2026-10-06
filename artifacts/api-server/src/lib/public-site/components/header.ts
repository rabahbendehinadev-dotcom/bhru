import { escapeHTML, safePublicHref, safePublicImage } from '../safety';
import type { PublicSiteModel } from '../model';

export function renderLogo(m: PublicSiteModel): string {
  const img = safePublicImage(m.logo);
  const mark = img
    ? `<img class="logo-img" src="${escapeHTML(img)}" alt="" width="36" height="36">`
    : `<span class="monogram" aria-hidden="true">${escapeHTML(Array.from(m.siteName.trim())[0]?.toUpperCase() || 'W')}</span>`;
  return `<a class="brand" href="#home">${mark}<span class="brand-name">${escapeHTML(m.siteName)}</span></a>`;
}

export function renderHeader(m: PublicSiteModel): string {
  const links = m.navigation.map(l => `<a href="${escapeHTML(safePublicHref(l.href))}">${escapeHTML(l.label)}</a>`).join('');
  return `<header class="site-header"><div class="wrap bar">
${renderLogo(m)}
<nav class="nav-desktop" aria-label="Primary">${links}</nav>
<a class="btn btn-ghost login" href="#customer-access">Login</a>
<details class="menu"><summary aria-label="Open menu"><span class="burger" aria-hidden="true"></span></summary>
<div class="menu-panel"><nav aria-label="Mobile">${links}<a class="btn btn-solid" href="#customer-access">Login</a></nav></div></details>
</div></header>`;
}
