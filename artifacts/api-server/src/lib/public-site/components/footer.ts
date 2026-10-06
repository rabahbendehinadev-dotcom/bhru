import { escapeHTML, safePublicHref } from '../safety';
import type { PublicSiteModel } from '../model';

export function renderFooter(m: PublicSiteModel): string {
  const links = m.footer.links.map(l => `<a href="${escapeHTML(safePublicHref(l.href))}">${escapeHTML(l.label)}</a>`).join('');
  const year = Number.isInteger(m.footer.copyrightYear) ? m.footer.copyrightYear : new Date().getUTCFullYear();
  return `<footer class="site-footer"><div class="wrap foot">
<div><strong class="foot-name">${escapeHTML(m.siteName)}</strong><p>${escapeHTML(m.footer.description)}</p>${m.businessName && m.businessName !== m.siteName ? `<p>${escapeHTML(m.businessName)}</p>` : ''}</div>
<nav aria-label="Footer" class="foot-links">${links}</nav>
<p class="copy">&copy; ${year} ${escapeHTML(m.siteName)}. All rights reserved.</p></div></footer>`;
}
