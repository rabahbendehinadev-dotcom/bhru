import { escapeHTML, safePublicHref, safePublicLink, isExternalLink } from '../safety';
import type { PublicSiteModel, PublicLink } from '../model';
import { renderLogo } from './header';

const linkList = (ls: PublicLink[], local: boolean) => ls.map(l => {
  const h = local ? safePublicHref(l.href) : safePublicLink(l.href, '');
  if (!h) return '';
  const ext = isExternalLink(h) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<li><a href="${escapeHTML(h)}"${ext}>${escapeHTML(l.label)}</a></li>`;
}).join('');

export function renderFooter(m: PublicSiteModel): string {
  const f = m.footer;
  const year = Number.isInteger(f.copyrightYear) ? f.copyrightYear : new Date().getUTCFullYear();
  const col = (t: string, inner: string) => inner ? `<div class="fcol"><h4>${t}</h4><ul>${inner}</ul></div>` : '';
  const contact = (f.contact ?? []).filter(c => c.label && c.value).map(c => {
    const h = c.href ? safePublicLink(c.href, '') : '';
    const v = h ? `<a href="${escapeHTML(h)}">${escapeHTML(c.value)}</a>` : escapeHTML(c.value);
    return `<li><span class="cl">${escapeHTML(c.label)}</span>${v}</li>`;
  }).join('');
  const hasAbout = !m.sections.reasons.length;
  return `<footer class="site-footer"><div class="wrap"><div class="foot">
<div class="fbrand"${hasAbout ? ' id="about"' : ''}>${renderLogo(m)}<p>${escapeHTML(f.description)}</p></div>
${col('Navigate', linkList(f.links, true))}${col('Services', linkList(f.serviceLinks ?? [], false))}${col('Contact', contact)}${col('Follow', linkList(f.socialLinks ?? [], false))}
</div><p class="copy">&copy; ${year} ${escapeHTML(m.siteName)}. All rights reserved.</p></div></footer>`;
}
