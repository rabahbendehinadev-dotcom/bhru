import { escapeHTML, safePublicImage, safePublicLink, isExternalLink } from '../safety';
import type { PublicService, PublicSiteModel } from '../model';

const icons: Record<string, string> = {
  device: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  support: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
};

export function renderServiceCard(s: PublicService): string {
  const live = s.state === 'published';
  const href = live && s.href ? safePublicLink(s.href, '') : '';
  const img = safePublicImage(s.image ?? null);
  const media = img
    ? `<span class="svc-media"><img src="${escapeHTML(img)}" alt="" loading="lazy"></span>`
    : `<span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[s.icon] ?? icons.device}</svg></span>`;
  const tag = s.category ? `<span class="cat">${escapeHTML(s.category)}</span>` : '';
  const status = s.statusLabel ? s.statusLabel : live ? '' : 'Coming soon';
  const badge = status ? `<span class="badge${live ? ' live' : ''}">${escapeHTML(status)}</span>` : '';
  const cta = href ? `<span class="svc-cta">${escapeHTML(s.ctaLabel || 'View service')}<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>` : '';
  const body = `<span class="svc-top">${media}${badge}</span>${tag}<h3>${escapeHTML(s.title)}</h3><p>${escapeHTML(s.description)}</p>${cta}`;
  if (href) {
    const ext = isExternalLink(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<li><a class="card service" href="${escapeHTML(href)}"${ext}>${body}</a></li>`;
  }
  return `<li><article class="card service${live ? '' : ' is-soon'}">${body}</article></li>`;
}

export function renderServices(m: PublicSiteModel): string {
  if (!m.services.length) return '';
  return `<section id="services" class="section" aria-labelledby="services-title"><div class="wrap">
<div class="head"><p class="kicker">Services</p><h2 id="services-title">${escapeHTML(m.sections.servicesTitle)}</h2><p>${escapeHTML(m.sections.servicesDescription)}</p></div>
<ul class="grid">${m.services.map(renderServiceCard).join('')}</ul></div></section>`;
}
