import { escapeHTML, safePublicHref, safePublicImage } from '../safety';
import type { PublicSiteModel } from '../model';

const art = `<svg class="art" viewBox="0 0 480 400" role="img" aria-label="Abstract illustration of connected devices and servers"><defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--ink)"/></linearGradient></defs>
<rect x="20" y="30" width="440" height="340" rx="36" fill="url(#g1)" opacity=".12"/>
<g fill="none" stroke="var(--ink)" stroke-width="3" opacity=".35"><path d="M130 200h90M260 200h90M240 120v60M240 220v70"/></g>
<rect x="190" y="150" width="100" height="100" rx="24" fill="var(--ink)"/><circle cx="240" cy="200" r="22" fill="var(--accent)"/>
<rect x="60" y="70" width="90" height="150" rx="16" fill="#fff" stroke="var(--ink)" stroke-width="3"/><rect x="95" y="80" width="20" height="5" rx="2.5" fill="var(--ink)"/><rect x="72" y="100" width="66" height="8" rx="4" fill="var(--accent)"/>
<rect x="330" y="80" width="100" height="60" rx="14" fill="#fff" stroke="var(--ink)" stroke-width="3"/><circle cx="350" cy="110" r="5" fill="var(--accent)"/><rect x="365" y="106" width="50" height="8" rx="4" fill="var(--ink)" opacity=".4"/>
<rect x="330" y="160" width="100" height="60" rx="14" fill="#fff" stroke="var(--ink)" stroke-width="3"/><circle cx="350" cy="190" r="5" fill="var(--accent)"/><rect x="365" y="186" width="50" height="8" rx="4" fill="var(--ink)" opacity=".4"/>
<rect x="150" y="290" width="180" height="50" rx="25" fill="#fff" stroke="var(--ink)" stroke-width="3"/><circle cx="185" cy="315" r="9" fill="var(--accent)"/><rect x="210" y="311" width="95" height="8" rx="4" fill="var(--ink)" opacity=".4"/></svg>`;

export function renderHero(m: PublicSiteModel): string {
  const img = safePublicImage(m.heroImage);
  const visual = img ? `<img class="hero-img" src="${escapeHTML(img)}" alt="" loading="eager">` : art;
  const sub = m.businessName && m.businessName !== m.siteName ? `<p class="eyebrow-sub">${escapeHTML(m.businessName)}</p>` : '';
  return `<section id="home" class="hero" aria-labelledby="hero-title"><div class="wrap hero-grid"><div class="hero-copy">
<p class="eyebrow">${escapeHTML(m.siteName)}</p>${sub}
<h1 id="hero-title">${escapeHTML(m.heroTitle)}</h1>
<p class="lead">${escapeHTML(m.heroDescription)}</p>
<div class="actions"><a class="btn btn-solid" href="${escapeHTML(safePublicHref(m.primaryCTA.href))}">${escapeHTML(m.primaryCTA.label)}</a>
<a class="btn btn-outline" href="${escapeHTML(safePublicHref(m.secondaryCTA.href))}">${escapeHTML(m.secondaryCTA.label)}</a></div></div>
<div class="hero-visual">${visual}</div></div></section>`;
}
