import type { PublicSiteModel } from './model';
import { escapeHTML as e, safePublicColor, safePublicImage } from './safety';
import { presentationLink, sanitizedTopHTML } from './presentation';
import { PUBLIC_MENU_SCRIPT_HASH } from './mobile-menu';
import { BANNER_SCRIPT, BANNER_SCRIPT_HASH } from './banner-script';
import { TOP_AREA_SCRIPT, TOP_AREA_SCRIPT_HASH } from './top-area-script';

const href=(value:string)=>{try{return presentationLink(value);}catch{return '';}};
const link=(content:string,destination:string,newTab=false)=>{
  const safe=href(destination);
  return safe?`<a href="${e(safe)}"${newTab?' target="_blank" rel="noopener noreferrer"':''}>${content}</a>`:content;
};
export const hasBanner=(model:PublicSiteModel)=>model.presentation?.heroMode==='banner' && !!model.presentation.banners.length;
export const hasSlider=(model:PublicSiteModel)=>hasBanner(model) && model.presentation!.banners.length>1;
export function publicScriptSources(model:PublicSiteModel) {
  return `'sha256-${PUBLIC_MENU_SCRIPT_HASH}'${renderTopArea(model)?` 'sha256-${TOP_AREA_SCRIPT_HASH}'`:''}${hasSlider(model)?` 'sha256-${BANNER_SCRIPT_HASH}'`:''}`;
}
export const renderBannerScript=(model:PublicSiteModel)=>
  `${renderTopArea(model)?`<script>${TOP_AREA_SCRIPT}</script>`:''}${hasSlider(model)?`<script>${BANNER_SCRIPT}</script>`:''}`;
export function renderTopArea(model:PublicSiteModel) {
  const p=model.presentation;
  if(!p)return '';
  const logos=p.logos.map(item=>{
    const image=safePublicImage(item.src);
    return image?`<li>${link(`<img src="${e(image)}" alt="${e(item.label||'Partner logo')}" height="40" decoding="async">`,item.href,item.newTab)}</li>`:'';
  }).join('');
  const bars=p.announcements.map(item=>{
    const scrolling=item.movement==='scrolling';
    const duration={slow:40,normal:25,fast:14}[item.speed];
    const track=`<div class="p2-announcement-track"${scrolling?` style="--p2-duration:${duration}s;animation-direction:${item.direction==='right'?'reverse':'normal'}"`:''}>
      <span>${e(item.text)}</span>${scrolling?`<span aria-hidden="true">${e(item.text)}</span>`:''}</div>`;
    return `<div class="p2-announcement${scrolling?' p2-scrolling':''}" style="background:${safePublicColor(item.background,'#152238')};color:${safePublicColor(item.color,'#ffffff')}">${link(track,item.href)}${scrolling?'<button type="button" class="p2-announcement-pause" data-announcement-pause aria-pressed="false">Pause motion</button>':''}</div>`;
  }).join('');
  const html=sanitizedTopHTML(p.customHTML);
  if(!logos && !bars && !html)return '';
  return `<div class="p2-top-area">${logos?`<nav class="p2-partner-strip" aria-label="Partner links" tabindex="0"><ul>${logos}</ul></nav>`:''}${bars}${html?`<div class="p2-custom">${html}</div>`:''}</div>`;
}
export function renderBanner(model:PublicSiteModel) {
  if(!hasBanner(model))return '';
  const p=model.presentation!,multi=p.banners.length>1;
  const images=p.banners.map((item,i)=>{
    const src=safePublicImage(item.src);
    if(!src)return '';
    return `<div class="p2-banner-slide"${i?' hidden':''} aria-hidden="${i?'true':'false'}">${link(`<img src="${e(src)}" alt="${e(item.alt||`Banner ${i+1}`)}" loading="${i?'lazy':'eager'}" decoding="async">`,item.href)}</div>`;
  }).join('');
  return `<section id="home" class="p2-banner" aria-label="Website banners"${multi?` aria-roledescription="carousel" data-banner-slider data-autoplay="${p.autoplay}" data-interval="${p.interval}"`:''}>
    <div class="p2-banner-images">${images}</div>${multi?`
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
.p2-top-area{width:100%;max-width:100%;overflow:hidden}
.p2-partner-strip{max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scroll-behavior:smooth;background:#fff;scrollbar-width:thin}
.p2-partner-strip ul{display:flex;align-items:center;gap:28px;width:max-content;max-width:none;list-style:none;padding:12px 24px;margin:0 auto}
.p2-partner-strip li{flex:none}.p2-partner-strip img{display:block;height:40px;width:auto;max-width:180px;object-fit:contain}
.p2-announcement{position:relative;width:100%;overflow:hidden;font-size:14px;line-height:1.5}
.p2-announcement a{display:block;color:inherit;text-decoration:underline;text-underline-offset:3px}
.p2-announcement-track>span{display:block;padding:10px 24px;text-align:center;overflow-wrap:anywhere}
.p2-scrolling .p2-announcement-track{display:flex;width:max-content;min-width:200%;animation:p2-scroll var(--p2-duration,25s) linear infinite}
.p2-scrolling .p2-announcement-track>span{flex:1 0 auto;min-width:50%;white-space:nowrap}
.p2-scrolling:hover .p2-announcement-track,.p2-scrolling:focus-within .p2-announcement-track,.p2-scrolling.p2-paused .p2-announcement-track{animation-play-state:paused}
.p2-announcement-pause{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:inherit;color:inherit;border:1px solid currentColor;border-radius:4px;padding:3px 6px;font-size:11px;cursor:pointer}
.p2-scrolling .p2-announcement-track>span{padding-inline-end:100px}
@keyframes p2-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.p2-custom{padding:12px 24px;overflow-wrap:anywhere}.p2-custom>*{max-width:100%}.p2-custom a{color:var(--accent)}
.p2-banner{position:relative;width:100%;max-width:100%;margin:0;overflow:hidden;touch-action:pan-y;scroll-margin-top:90px}
.p2-banner-slide img{display:block;width:100%;height:auto;object-fit:contain}.p2-banner-slide[hidden]{display:none}
.p2-banner-slide a{display:block}.p2-banner-arrow{position:absolute;top:45%;width:44px;height:44px;border:1px solid #ddd;border-radius:50%;background:#fff;color:#152238;font-size:30px;line-height:1;cursor:pointer}
.p2-prev{left:16px}.p2-next{right:16px}.p2-banner-controls{display:flex;justify-content:center;align-items:center;gap:10px;flex-wrap:wrap;padding:12px;background:#fff}
.p2-banner-dot{width:12px;height:12px;border-radius:50%;padding:0;border:1px solid #152238;background:#fff;cursor:pointer}
.p2-banner-dot[aria-current=true]{background:var(--accent)}.p2-banner-pause{padding:6px 12px;border:1px solid #dce2ea;border-radius:6px;background:#fff;color:#152238;cursor:pointer}
.p2-banner button:focus-visible,.p2-top-area a:focus-visible,.p2-partner-strip:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.p2-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
@media(max-width:600px){.p2-partner-strip img{height:32px;max-width:140px}.p2-partner-strip ul{gap:20px;padding:10px 16px}.p2-announcement{font-size:13px}.p2-prev{left:8px}.p2-next{right:8px}.p2-banner-arrow{width:38px;height:38px}}
@media(prefers-reduced-motion:reduce){.p2-partner-strip{scroll-behavior:auto}.p2-scrolling .p2-announcement-track{animation:none;display:block;width:auto;min-width:0}.p2-scrolling .p2-announcement-track>span{white-space:normal;min-width:0;padding-inline-end:24px}.p2-announcement-track>[aria-hidden=true],.p2-announcement-pause{display:none}}
`;
}
