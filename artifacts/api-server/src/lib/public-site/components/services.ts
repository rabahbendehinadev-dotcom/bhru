import { escapeHTML, safePublicHref } from '../safety';
import type { PublicService, PublicSiteModel } from '../model';

const icons: Record<PublicService['icon'], string> = {
  device: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.01M7 17.5h.01"/>',
  support: '<path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/>',
};

export function renderServiceCard(s: PublicService): string {
  const live = s.state === 'published';
  const href = live && s.href ? safePublicHref(s.href) : null;
  const badge = live ? '' : '<span class="badge">Coming soon</span>';
  const body = `<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[s.icon] ?? icons.device}</svg></span>${badge}
<h3>${escapeHTML(s.title)}</h3><p>${escapeHTML(s.description)}</p>`;
  return href ? `<li><a class="card service" href="${escapeHTML(href)}">${body}</a></li>` : `<li><article class="card service${live ? '' : ' is-soon'}">${body}</article></li>`;
}

export function renderServices(m: PublicSiteModel): string {
  return `<section id="services" class="section" aria-labelledby="services-title"><div class="wrap">
<div class="head"><h2 id="services-title">${escapeHTML(m.sections.servicesTitle)}</h2><p>${escapeHTML(m.sections.servicesDescription)}</p></div>
<ul class="grid">${m.services.map(renderServiceCard).join('')}</ul></div></section>`;
}
