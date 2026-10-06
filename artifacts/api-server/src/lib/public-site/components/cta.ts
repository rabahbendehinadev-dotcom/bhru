import { escapeHTML, safePublicHref } from '../safety';
import type { PublicSiteModel } from '../model';

export function renderCta(m: PublicSiteModel): string {
  const s = m.sections;
  return `<section id="contact" class="section" aria-labelledby="cta-title"><div class="wrap"><div class="cta">
<h2 id="cta-title">${escapeHTML(s.ctaTitle)}</h2><p>${escapeHTML(s.ctaDescription)}</p>
<div class="actions"><a class="btn btn-accent" href="${escapeHTML(safePublicHref(m.primaryCTA.href))}">${escapeHTML(m.primaryCTA.label)}</a></div></div>
<div id="customer-access" class="access" role="note" tabindex="-1"><h3>${escapeHTML(s.customerAccessTitle)}</h3><p>${escapeHTML(s.customerAccessDescription)}</p></div></div></section>`;
}
