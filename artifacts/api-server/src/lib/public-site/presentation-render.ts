import type { PublicSiteModel } from './model';
import { escapeHTML as e, safePublicImage } from './safety';
import { presentationLink } from './presentation';
import { PUBLIC_MENU_SCRIPT_HASH } from './mobile-menu';
import { BANNER_SCRIPT, BANNER_SCRIPT_HASH } from './banner-script';
import { TOP_AREA_SCRIPT, TOP_AREA_SCRIPT_HASH } from './top-area-script';
import { renderTopArea, TOP_AREA_STYLES } from './top-area-render';
export { renderTopArea } from './top-area-render';

const href=(value:string)=>{try{return presentationLink(value);}catch{return '';}};
const link=(content:string,destination:string,newTab=false)=>{
  const safe=href(destination);
  return safe?`<a href="${e(safe)}"${newTab?' target="_blank" rel="noopener noreferrer"':''}>${content}</a>`:content;
};
export const hasBanner=(model:PublicSiteModel)=>model.presentation?.heroMode==='banner' && !!model.presentation.banners.length;
export const hasSlider=(model:PublicSiteModel)=>hasBanner(model) && model.presentation!.banners.length>1;
export function publicScriptSources(model:PublicSiteModel) {
  return `'sha256-${PUBLIC_MENU_SCRIPT_HASH}'${renderTopArea(model)?` 'sha256-${TOP_AREA_SCRIPT_HASH}'`:''}${hasBanner(model)?` 'sha256-${BANNER_SCRIPT_HASH}'`:''}`;
}
export const renderBannerScript=(model:PublicSiteModel)=>
  `${renderTopArea(model)?`<script>${TOP_AREA_SCRIPT}</script>`:''}${hasBanner(model)?`<script>${BANNER_SCRIPT}</script>`:''}`;
export function renderBannerPreload(model:PublicSiteModel) {
  const src=hasBanner(model)?safePublicImage(model.presentation!.banners[0]!.src):'';
  return src?`\n<link rel="preload" as="image" href="${e(src)}" fetchpriority="high">`:'';
}
export function renderBanner(model:PublicSiteModel) {
  if(!hasBanner(model))return '';
  const p=model.presentation!,multi=p.banners.length>1;
  const images=p.banners.map((item,i)=>{
    const src=safePublicImage(item.src);
    if(!src)return '';
    return `<div class="p2-banner-slide"${i?' hidden':''} aria-hidden="${i?'true':'false'}">${link(`<img ${i?'data-src':'src'}="${e(src)}" alt="${e(item.alt||`Banner ${i+1}`)}" width="${item.width||16}" height="${item.height||9}" loading="${i?'lazy':'eager'}" fetchpriority="${i?'low':'high'}" decoding="async">`,item.href)}</div>`;
  }).join('');
  return `<section id="home" class="p2-banner" data-banner-stage aria-label="Website banners"${multi?` aria-roledescription="carousel" data-banner-slider data-autoplay="${p.autoplay}" data-interval="${p.interval}"`:''}>
    <div class="p2-banner-images" aria-busy="true" style="aspect-ratio:${p.banners[0]!.width||16}/${p.banners[0]!.height||9}">${images}</div>
    <noscript><style>.p2-banner-slide img{opacity:1}</style></noscript>${multi?`
    <button type="button" class="p2-banner-arrow p2-prev" data-banner-prev aria-label="Previous banner">‹</button>
    <button type="button" class="p2-banner-arrow p2-next" data-banner-next aria-label="Next banner">›</button>
    <div class="p2-banner-controls">${p.banners.map((_,i)=>`<button type="button" class="p2-banner-dot" data-banner-dot aria-label="Go to banner ${i+1}" aria-current="${i===0}"></button>`).join('')}
    <button type="button" class="p2-banner-pause" data-banner-pause aria-pressed="${!p.autoplay}">${p.autoplay?'Pause slideshow':'Play slideshow'}</button></div>
    <span class="p2-sr" data-banner-status aria-live="polite">Banner 1 of ${p.banners.length}</span>`:''}
  </section>`;
}
/** Scoped extensions only; returns nothing for an unchanged V2 site. */
export function renderPresentationStyles(model:PublicSiteModel) {
  if(!renderTopArea(model) && !hasBanner(model))return '';
  return `
${TOP_AREA_STYLES}
.p2-banner{position:relative;width:100%;max-width:100%;margin:0;overflow:hidden;touch-action:pan-y;scroll-margin-top:90px}
.p2-banner-images{position:relative;width:100%;background:#f7f9fe}
.p2-banner-slide{position:absolute;inset:0}.p2-banner-slide img{display:block;width:100%;height:100%;object-fit:contain;opacity:0;transition:opacity .18s ease}.p2-banner-slide img.p2-image-ready{opacity:1}.p2-banner-slide[hidden]{display:none}
.p2-banner-slide a{display:block;height:100%}.p2-banner-arrow{position:absolute;top:45%;width:44px;height:44px;border:1px solid #ddd;border-radius:50%;background:#fff;color:#152238;font-size:30px;line-height:1;cursor:pointer}
.p2-prev{left:16px}.p2-next{right:16px}.p2-banner-controls{display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap;padding:12px;background:#fff}
.p2-banner-dot{width:12px;height:12px;border-radius:50%;padding:0;border:1px solid #152238;background:#fff;cursor:pointer}
.p2-banner-dot[aria-current=true]{background:var(--accent)}.p2-banner-pause{padding:6px 12px;border:1px solid #dce2ea;border-radius:6px;background:#fff;color:#152238;cursor:pointer}
.p2-banner button:focus-visible,.p2-top-area a:focus-visible,.p2-partner-strip:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.p2-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media(max-width:600px){.p2-prev{left:8px}.p2-next{right:8px}.p2-banner-arrow{width:38px;height:38px}}
@media(prefers-reduced-motion:reduce){.p2-banner-slide img{transition:none}}
`;
}
