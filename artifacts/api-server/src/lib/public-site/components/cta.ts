import { escapeHTML, safePublicLink, isExternalLink } from '../safety';
import type { PublicSiteModel } from '../model';

export function renderCta(m: PublicSiteModel): string {
  const s = m.sections;
  const link = s.cta ?? m.primaryCTA;
  const href = safePublicLink(link.href, '#services');
  const ext = isExternalLink(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<section id="contact" class="section" aria-labelledby="cta-title"><div class="wrap"><div class="cta">
<h2 id="cta-title">${escapeHTML(s.ctaTitle)}</h2><p>${escapeHTML(s.ctaDescription)}</p>
<div class="actions"><a class="btn btn-accent" href="${escapeHTML(href)}"${ext}>${escapeHTML(link.label)}</a></div></div></div></section>`;
}
