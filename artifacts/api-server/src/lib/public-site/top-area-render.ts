import type { PublicSiteModel } from './model';
import { escapeHTML as e, safePublicColor, safePublicImage } from './safety';
import { presentationLink, sanitizedTopHTML } from './presentation';

function link(content:string,destination:string,newTab=false) {
  let href='';try{href=presentationLink(destination);}catch{/* unsafe links remain plain content */}
  return href?`<a href="${e(href)}"${newTab?' target="_blank" rel="noopener noreferrer"':''}>${content}</a>`:content;
}
function movement(settings:{display:'static'|'moving';speed:'slow'|'normal'|'fast';direction:'left'|'right';pause_on_hover:boolean}) {
  return settings.display==='moving'
    ? ` class="p2-loop" data-ticker data-speed="${{slow:25,normal:45,fast:75}[settings.speed]}" data-pause-hover="${settings.pause_on_hover}" style="--p2-direction:${settings.direction==='right'?'reverse':'normal'}"`
    : '';
}
const pause=(moving:boolean)=>moving?'<button type="button" class="p2-ticker-pause" data-ticker-pause aria-pressed="false" hidden>Pause motion</button>':'';

export function renderTopArea(model:PublicSiteModel) {
  const p=model.presentation;if(!p)return '';
  const logos=p.logos.map(item=>{
    const src=safePublicImage(item.src);if(!src)return '';
    const content=`<img src="${e(src)}" alt="${e(item.label||'Partner logo')}" width="${item.width||40}" height="${item.height||40}" decoding="async" loading="lazy">${item.label?`<span class="p2-logo-label">${e(item.label)}</span>`:''}`;
    return `<li class="p2-logo-card">${link(content,item.href,item.newTab)}</li>`;
  }).join('');
  const logoSettings=p.logoSettings??{display:'static',speed:'normal',direction:'left',pause_on_hover:true};
  const first=p.announcements[0];
  const ticker=p.tickerSettings??{
    display:first?.movement==='scrolling'?'moving':'static',speed:first?.speed??'normal',
    direction:first?.direction??'left',pause_on_hover:true,background_color:first?.background??'#152238',
    text_color:first?.color??'#FFFFFF',separator:'•',
  };
  const messages=p.announcements.map(item=>
    `<li class="p2-message">${link(`<bdi>${item.icon?`${e(item.icon)} `:''}${e(item.text)}</bdi>`,item.href)}<span class="p2-separator" aria-hidden="true">${e(ticker.separator)}</span></li>`
  ).join('');
  const html=sanitizedTopHTML(p.customHTML);
  if(!logos&&!messages&&!html)return '';
  const strip=logos?`<nav class="p2-partner-strip" aria-label="Partner links"><div${movement({...logoSettings,pause_on_hover:false})}>
    <div class="p2-ticker-track"><ul class="p2-ticker-group p2-logo-group">${logos}</ul></div></div></nav>`:'';
  const announcements=messages?`<section class="p2-announcement" aria-label="Announcements" style="background:${safePublicColor(ticker.background_color,'#152238')};color:${safePublicColor(ticker.text_color,'#FFFFFF')}"><div${movement(ticker)}>
    <div class="p2-ticker-track"><ul class="p2-ticker-group p2-message-group">${messages}</ul></div>${pause(ticker.display==='moving')}</div></section>`:'';
  return `<div class="p2-top-area">${strip}${announcements}${html?`<div class="p2-custom">${html}</div>`:''}</div>`;
}

export const TOP_AREA_STYLES=`
.p2-top-area{width:100%;max-width:100%;overflow:hidden}
.p2-partner-strip{width:100%;min-width:0;max-width:100%;overflow-x:auto;background:#f8fafc;scrollbar-width:thin}
.p2-ticker-track{display:flex;width:max-content;max-width:none}
.p2-ticker-group{display:flex;align-items:center;flex:none;width:max-content;list-style:none;margin:0;padding:12px 16px;direction:ltr}
.p2-logo-group{gap:16px;margin:0 auto}
.p2-partner-strip .p2-loop{padding-bottom:0}
.p2-partner-strip .p2-loop .p2-logo-group{margin:0}
.p2-partner-strip:not(:has([data-ticker])) .p2-ticker-track{min-width:100%}
.p2-logo-card{display:flex;flex:none;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:152px;height:84px;padding:8px 12px;border:1px solid #e5eaf1;border-radius:12px;box-sizing:border-box;background:#fff;box-shadow:0 2px 8px rgba(21,34,56,.045)}
.p2-logo-card a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:100%;min-width:0;color:#152238;text-decoration:none}
.p2-logo-card img{display:block;flex:none;height:48px;width:100%;max-width:100%;object-fit:contain;object-position:center}
.p2-logo-card:not(:has(.p2-logo-label)) img{height:56px}
.p2-logo-label{display:block;flex:none;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:14px;color:#152238}
.p2-announcement{width:100%;max-width:100%;overflow-x:auto;font-size:14px;line-height:1.5}
.p2-announcement a{color:inherit;text-decoration:underline;text-underline-offset:3px}
.p2-announcement>div:not([data-ticker]) .p2-ticker-track{width:100%}
.p2-announcement>div:not([data-ticker]) .p2-message-group{flex-wrap:wrap;justify-content:center;width:100%;box-sizing:border-box}
.p2-message-group{padding:10px 16px}
.p2-message{display:flex;align-items:center;flex:none;gap:24px;max-width:100%}
.p2-message bdi{overflow-wrap:anywhere}
.p2-separator{flex:none;padding-right:24px}
.p2-loop{position:relative;max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain;scrollbar-width:thin;padding-bottom:28px}
.p2-loop .p2-message{max-width:none;white-space:nowrap}
.p2-loop .p2-logo-group{padding-inline:0;padding-right:16px}
.p2-loop .p2-message-group{padding-inline:0}
.p2-loop.p2-ready{overflow:hidden}
.p2-loop.p2-ready .p2-ticker-track{animation:p2-loop var(--p2-duration,25s) linear infinite;animation-direction:var(--p2-direction,normal);will-change:transform}
.p2-loop[data-pause-hover=true]:hover .p2-ticker-track,.p2-loop:focus-within .p2-ticker-track,.p2-loop.p2-paused .p2-ticker-track,.p2-loop.p2-background-paused .p2-ticker-track,.p2-menu-paused .p2-loop.p2-ready .p2-ticker-track{animation-play-state:paused}
.p2-loop.p2-focus-static{overflow-x:auto}.p2-loop.p2-focus-static .p2-ticker-track{animation:none;transform:none}.p2-focus-static [data-ticker-copy]{display:none}
.p2-ticker-pause{position:absolute;right:8px;bottom:4px;display:block;margin:0;border:1px solid currentColor;border-radius:4px;padding:3px 7px;background:transparent;color:inherit;font-size:11px;cursor:pointer}
.p2-ticker-pause[hidden]{display:none}
@keyframes p2-loop{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.p2-custom{padding:12px 24px;overflow-wrap:anywhere}.p2-custom>*{max-width:100%}.p2-custom a{color:var(--accent)}
.p2-top-area a:focus-visible,.p2-ticker-pause:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
@media(max-width:600px){.p2-logo-card{width:128px;height:72px;padding:8px 10px;border-radius:10px}.p2-logo-card img{height:36px}.p2-logo-card:not(:has(.p2-logo-label)) img{height:48px}.p2-logo-group{gap:12px;padding:10px 12px}.p2-loop .p2-logo-group{padding-right:12px}.p2-announcement{font-size:13px}.p2-message{gap:16px}.p2-separator{padding-right:16px}}
@media(prefers-reduced-motion:reduce){.p2-loop{padding-bottom:0}.p2-loop.p2-ready{overflow-x:auto}.p2-loop.p2-ready .p2-ticker-track{animation:none;transform:none;will-change:auto}.p2-loop [data-ticker-copy],.p2-ticker-pause{display:none}.p2-loop .p2-message{max-width:100%;white-space:normal}.p2-loop:has(.p2-message-group) .p2-ticker-track{width:100%}.p2-loop .p2-message-group{width:100%;box-sizing:border-box;flex-wrap:wrap}}
`;
