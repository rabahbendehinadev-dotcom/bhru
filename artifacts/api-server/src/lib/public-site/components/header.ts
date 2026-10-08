import { escapeHTML, safePublicHref, safePublicImage } from '../safety';
import type { PublicSiteModel } from '../model';
import { renderCustomerActions } from '../../customer-auth/ui';

export function renderLogo(m: PublicSiteModel): string {
  const img = safePublicImage(m.logo);
  const mark = img
    ? `<img class="logo-img" src="${escapeHTML(img)}" alt="" width="40" height="40">`
    : `<span class="monogram" aria-hidden="true">${escapeHTML(Array.from(m.siteName.trim())[0]?.toUpperCase() || 'W')}</span>`;
  return `<a class="brand" href="#home">${mark}<span class="brand-name">${escapeHTML(m.siteName)}</span></a>`;
}

export function renderHeader(m: PublicSiteModel): string {
  const links = m.navigation.map(l => `<a href="${escapeHTML(safePublicHref(l.href))}">${escapeHTML(l.label)}</a>`).join('');
  return `<header class="site-header"><div class="wrap bar">
${renderLogo(m)}
<nav class="nav-desktop" aria-label="Primary">${links}</nav>
${renderCustomerActions(m)}
<details class="menu"><summary aria-label="Open mobile menu" aria-controls="mobile-navigation"><span class="burger" aria-hidden="true"></span></summary>
<div class="menu-panel" id="mobile-navigation"><nav aria-label="Mobile">${links}${renderCustomerActions(m, true)}</nav></div></details>
</div></header>`;
}
