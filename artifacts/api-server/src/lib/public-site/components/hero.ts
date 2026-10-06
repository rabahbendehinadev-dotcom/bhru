import { escapeHTML, safePublicLink, safePublicImage } from '../safety';
import type { PublicSiteModel } from '../model';

// Neutral studio-like device silhouettes, never a demo product or service claim.
// A configured banner replaces this entire fallback.
const art = `<div class="art" role="img" aria-label="Neutral device illustration"><svg viewBox="0 0 520 400" aria-hidden="true"><defs>
<linearGradient id="studio" x2=".8" y2="1"><stop stop-color="#f1f4f8"/><stop offset="1" stop-color="#dce3ec"/></linearGradient>
<linearGradient id="frame" x2="1" y2=".5"><stop stop-color="#f9fafc"/><stop offset=".45" stop-color="#a8b5c5"/><stop offset="1" stop-color="#f3f6fa"/></linearGradient>
<linearGradient id="glass" x2="1" y2="1"><stop stop-color="#344155"/><stop offset=".52" stop-color="#101a2a"/><stop offset="1" stop-color="#26364c"/></linearGradient>
<radialGradient id="aura"><stop stop-color="var(--accent)" stop-opacity=".17"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient>
<filter id="device-shadow" x="-70%" y="-30%" width="240%" height="190%"><feDropShadow dx="0" dy="20" stdDeviation="14" flood-color="#142137" flood-opacity=".22"/></filter>
</defs><rect width="520" height="400" fill="url(#studio)"/><circle cx="260" cy="190" r="190" fill="url(#aura)"/>
<ellipse cx="272" cy="355" rx="164" ry="16" fill="#aebdce" opacity=".24"/>
<g transform="rotate(-13 197 201)" filter="url(#device-shadow)">
<rect x="112" y="59" width="161" height="289" rx="27" fill="url(#frame)" stroke="#8c9aac"/>
<rect x="118" y="65" width="149" height="277" rx="23" fill="#e7ecf3" stroke="#fff" stroke-opacity=".7"/>
<rect x="129" y="78" width="43" height="80" rx="19" fill="#d5deea" stroke="#c0cbd9"/>
<circle cx="150" cy="100" r="13" fill="#8c9aaf"/><circle cx="150" cy="100" r="9" fill="#1d2b40"/><circle cx="147" cy="97" r="3" fill="#58718b"/>
<circle cx="150" cy="137" r="13" fill="#8c9aaf"/><circle cx="150" cy="137" r="9" fill="#1d2b40"/><circle cx="147" cy="134" r="3" fill="#58718b"/>
<path d="M134 182h117" stroke="#fff" stroke-opacity=".45"/>
</g><g transform="rotate(12 323 199)" filter="url(#device-shadow)">
<rect x="247" y="51" width="159" height="297" rx="28" fill="url(#frame)" stroke="#66788f"/>
<rect x="252" y="56" width="149" height="287" rx="24" fill="#101827"/>
<rect x="258" y="62" width="137" height="275" rx="19" fill="url(#glass)"/>
<path d="M259 284c50-31 63-112 136-126v117c-63 20-69 60-105 61h-16a16 16 0 0 1-15-16z" fill="#71859f" opacity=".13"/>
<path d="M258 76c52 12 80 66 137 69" fill="none" stroke="#aebdd2" stroke-opacity=".17" stroke-width="2"/>
<rect x="308" y="71" width="36" height="6" rx="3" fill="#07101c"/><circle cx="352" cy="74" r="3" fill="#07101c"/>
<rect x="302" y="322" width="49" height="3" rx="1.5" fill="#c1cedc" opacity=".4"/>
</g></svg></div>`;

export function renderHero(m: PublicSiteModel): string {
  const img = safePublicImage(m.heroImage);
  const visual = img ? `<img class="hero-img" src="${escapeHTML(img)}" alt="" loading="eager">` : art;
  const badge = m.heroBadge || (m.businessName && m.businessName !== m.siteName ? m.businessName : m.siteName);
  return `<section id="home" class="hero" aria-labelledby="hero-title"><div class="wrap hero-grid"><div class="hero-copy">
<p class="eyebrow"><span class="dot"></span>${escapeHTML(badge)}</p>
<h1 id="hero-title">${escapeHTML(m.heroTitle)}</h1>
<p class="lead">${escapeHTML(m.heroDescription)}</p>
<div class="actions"><a class="btn btn-solid" href="${escapeHTML(safePublicLink(m.primaryCTA.href))}">${escapeHTML(m.primaryCTA.label)}</a>
<a class="btn btn-outline" href="${escapeHTML(safePublicLink(m.secondaryCTA.href))}">${escapeHTML(m.secondaryCTA.label)}</a></div></div>
<div class="hero-visual">${visual}</div></div></section>`;
}
