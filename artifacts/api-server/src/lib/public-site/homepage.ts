import { escapeHTML, safePublicColor } from './safety';
import type { PublicSiteModel } from './model';
import { renderStyles } from './styles';
import { renderHeader } from './components/header';
import { renderHero } from './components/hero';
import { renderServices } from './components/services';
import { renderWhy } from './components/why';
import { renderStatistics } from './components/statistics';
import { renderCta } from './components/cta';
import { renderFooter } from './components/footer';
import { PUBLIC_MENU_SCRIPT } from './mobile-menu';
import { renderTopArea, renderBanner, renderPresentationStyles, renderBannerScript } from './presentation-render';

export function renderPublicHome(model: PublicSiteModel): string {
  const title = `${model.siteName} — Public website`;
  const desc = model.heroDescription;
  const t = escapeHTML(title), d = escapeHTML(desc);
  // Self-contained public monogram: no browser fallback request to app favicon
  // routes, and no private/session-backed asset bootstrap.
  const letter = escapeHTML(Array.from(model.siteName.trim())[0]?.toUpperCase() || 'W');
  const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="${safePublicColor(model.theme.ink, '#152238')}"/><text x="32" y="45" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="700" fill="${safePublicColor(model.theme.accent, '#2563eb')}">${letter}</text></svg>`;
  const favicon = escapeHTML(`data:image/svg+xml,${encodeURIComponent(icon)}`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" type="image/svg+xml" href="${favicon}">
<title>${t}</title>
<meta name="description" content="${d}">
<meta name="robots" content="noindex,nofollow">
<meta property="og:type" content="website"><meta property="og:title" content="${t}"><meta property="og:description" content="${d}"><meta property="og:site_name" content="${escapeHTML(model.siteName)}">
<style>${renderStyles(model)}${renderPresentationStyles(model)}</style></head><body data-public-template="bhru-v1">
${renderTopArea(model)}${renderHeader(model)}
<button class="mobile-menu-backdrop" type="button" aria-label="Close mobile menu" tabindex="-1" hidden></button>
<main>${renderBanner(model)||renderHero(model)}${renderServices(model)}${renderWhy(model)}${renderStatistics(model)}${renderCta(model)}</main>
${renderFooter(model)}
<script>${PUBLIC_MENU_SCRIPT}</script>${renderBannerScript(model)}
</body></html>`;
}
