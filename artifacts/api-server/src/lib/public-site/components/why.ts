import { escapeHTML } from '../safety';
import type { PublicSiteModel } from '../model';

export function renderWhy(m: PublicSiteModel): string {
  const items = m.sections.reasons.map((r, i) => `<li class="reason"><span class="num">${String(i + 1).padStart(2, '0')}</span><div><h3>${escapeHTML(r.title)}</h3><p>${escapeHTML(r.description)}</p></div></li>`).join('');
  return `<section id="about" class="section alt" aria-labelledby="why-title"><div class="wrap split">
<div class="head"><h2 id="why-title">${escapeHTML(m.sections.whyTitle)}</h2><p>${escapeHTML(m.sections.whyDescription)}</p></div>
<ol class="reasons">${items}</ol></div></section>`;
}
