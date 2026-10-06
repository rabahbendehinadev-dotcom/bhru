import { escapeHTML } from '../safety';
import type { PublicSiteModel } from '../model';

export function renderWhy(m: PublicSiteModel): string {
  if (!m.sections.reasons.length) return '';
  const items = m.sections.reasons.map((r, i) => `<li class="reason"><span class="num">${String(i + 1).padStart(2, '0')}</span><div><h3>${escapeHTML(r.title)}</h3><p>${escapeHTML(r.description)}</p></div></li>`).join('');
  const desc = m.sections.whyDescription ? `<p>${escapeHTML(m.sections.whyDescription)}</p>` : '';
  return `<section id="about" class="section alt" aria-labelledby="why-title"><div class="wrap split">
<div class="head"><p class="kicker">About</p><h2 id="why-title">${escapeHTML(m.sections.whyTitle)}</h2>${desc}</div>
<ol class="reasons">${items}</ol></div></section>`;
}
