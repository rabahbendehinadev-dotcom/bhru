import { escapeHTML } from '../safety';
import type { PublicSiteModel } from '../model';

export function renderStatistics(m: PublicSiteModel): string {
  if (!m.sections.statistics.length) return '';
  const items = m.sections.statistics.map(s => `<li class="stat"><strong>${escapeHTML(s.value)}</strong><span>${escapeHTML(s.label)}</span>${s.note ? `<small>${escapeHTML(s.note)}</small>` : ''}</li>`).join('');
  return `<section id="trust" class="section" aria-label="Statistics"><div class="wrap"><ul class="stats">${items}</ul></div></section>`;
}
