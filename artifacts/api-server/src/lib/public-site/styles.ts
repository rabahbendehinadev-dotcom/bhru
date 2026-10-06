import { safePublicColor } from './safety';
import type { PublicSiteModel } from './model';

export function renderStyles(m: PublicSiteModel): string {
  const a = safePublicColor(m.theme.accent, '#2563eb'), i = safePublicColor(m.theme.ink, '#152238'), b = safePublicColor(m.theme.background, '#f7f9fc');
  const luminance = [1, 3, 5].map(offset => {
    const channel = parseInt(a.slice(offset, offset + 2), 16) / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const accentInk = luminance > .179 ? '#000000' : '#ffffff';
  return `:root{--accent:${a};--accent-ink:${accentInk};--ink:${i};--bg:${b};--muted:color-mix(in srgb,${i} 68%,${b});--line:color-mix(in srgb,${i} 13%,${b});--card:color-mix(in srgb,#fff 82%,${b});--sh:0 1px 2px color-mix(in srgb,${i} 8%,transparent),0 8px 24px color-mix(in srgb,${i} 7%,transparent)}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:84px}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-text-size-adjust:100%}
h1,h2,h3,h4,p,ul,ol{margin:0}ul,ol{padding:0;list-style:none}a{color:inherit;text-decoration:none}h1,h2,h3,p,a,strong,span{overflow-wrap:anywhere}
a:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.wrap{width:min(1180px,100% - 40px);margin-inline:auto}
.site-header{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.site-header:has(.menu[open]){position:relative;background:var(--bg)}
.bar{display:flex;align-items:center;gap:16px;min-height:72px}.brand{display:flex;align-items:center;gap:12px;font-weight:800;font-size:18px;letter-spacing:-.02em;min-width:0;margin-right:auto}
.brand-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:52vw}
.monogram{flex:none;width:40px;height:40px;border-radius:12px;background:var(--ink);color:#fff;display:grid;place-items:center;font-weight:800;box-shadow:inset 0 -3px 0 var(--accent)}.logo-img{flex:none;width:40px;height:40px;object-fit:contain;border-radius:10px}
.nav-desktop{display:none;gap:4px}.nav-desktop a{padding:8px 14px;border-radius:10px;font-weight:600;font-size:15px;color:var(--muted);transition:background .15s,color .15s}.nav-desktop a:hover{background:var(--line);color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:50px;padding:0 26px;border-radius:12px;font-weight:700;font-size:15px;border:1.5px solid var(--ink);transition:transform .15s,box-shadow .15s,background .15s}.btn:hover{transform:translateY(-2px);box-shadow:var(--sh)}.btn:active{transform:scale(.98)}
.btn-solid{background:var(--ink);color:#fff}.btn-outline{background:transparent}.btn-outline:hover{background:var(--line)}.btn-accent{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.login{display:none;align-items:center;min-height:44px;padding:0 20px;border-radius:10px;background:var(--accent);color:var(--accent-ink);font-weight:700;font-size:15px;transition:transform .15s}.login:hover{transform:translateY(-1px)}
.menu{position:static}.menu summary{list-style:none;cursor:pointer;width:46px;height:46px;display:grid;place-items:center;border-radius:12px;border:1.5px solid var(--line);background:var(--card)}.menu summary::-webkit-details-marker{display:none}
.burger,.burger:before,.burger:after{display:block;width:20px;height:2px;background:var(--ink);border-radius:2px;content:"";position:relative;transition:transform .2s,background .2s}.burger:before{top:-6px;position:absolute}.burger:after{top:6px;position:absolute}
.menu[open] .burger{background:transparent}.menu[open] .burger:before{top:0;transform:rotate(45deg)}.menu[open] .burger:after{top:0;transform:rotate(-45deg)}
.menu-panel{position:absolute;left:0;right:0;top:100%;width:100%;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 20px 20px;box-shadow:0 24px 40px color-mix(in srgb,var(--ink) 14%,transparent)}
.menu-panel nav{display:grid;gap:2px}.menu-panel nav a:not(.btn){padding:14px 12px;border-radius:10px;font-weight:600;min-height:50px;border-bottom:1px solid var(--line)}.menu-panel nav a:not(.btn):hover{background:var(--line)}.menu-panel .btn{margin-top:14px;background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.hero{padding:40px 0 56px;background:radial-gradient(800px 380px at 90% 0,color-mix(in srgb,var(--accent) 16%,transparent),transparent 70%)}
.hero-grid{display:grid;gap:36px;align-items:center}.eyebrow{display:inline-flex;align-items:center;gap:8px;max-width:100%;font-weight:700;font-size:13px;letter-spacing:.04em;background:var(--card);border:1px solid var(--line);color:var(--ink);padding:6px 14px;border-radius:999px;box-shadow:var(--sh)}.dot{flex:none;width:8px;height:8px;border-radius:50%;background:var(--accent)}
h1{font-size:clamp(32px,8.4vw,60px);line-height:1.06;letter-spacing:-.035em;margin:20px 0 16px}.lead{font-size:clamp(17px,2.4vw,19px);color:var(--muted);max-width:56ch}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.actions .btn{flex:1 1 100%}
.hero-visual{min-width:0}.art,.hero-img{width:100%;border-radius:24px;display:block;box-shadow:0 30px 60px -20px color-mix(in srgb,var(--ink) 40%,transparent);border:1px solid var(--line)}.art{overflow:hidden;aspect-ratio:13/10}.art svg{width:100%;height:100%;display:block}.hero-img{aspect-ratio:13/10;object-fit:cover;height:auto}
.section{padding:60px 0}.alt{background:color-mix(in srgb,var(--ink) 4%,var(--bg));border-block:1px solid var(--line)}
.kicker{font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:10px}
.head h2,.cta h2{font-size:clamp(28px,5vw,42px);line-height:1.1;letter-spacing:-.03em}.head p:not(.kicker){margin-top:14px;color:var(--muted);max-width:60ch}
.grid{display:grid;gap:18px;margin-top:36px;grid-template-columns:minmax(0,1fr)}.grid>li{min-width:0}
.card{display:flex;flex-direction:column;height:100%;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px;box-shadow:var(--sh);transition:transform .2s,border-color .2s,box-shadow .2s}a.card:hover{transform:translateY(-4px);border-color:var(--accent)}
.svc-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.service .cat{margin-top:20px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}.service h3{font-size:20px;line-height:1.25;margin:18px 0 8px}.service .cat+h3{margin-top:4px}.service p{color:var(--muted);flex:1}.is-soon{background:transparent;box-shadow:none;border-style:dashed}
.ico{display:grid;place-items:center;width:52px;height:52px;border-radius:14px;background:color-mix(in srgb,var(--accent) 12%,var(--bg));color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 25%,var(--bg))}.ico svg{width:26px;height:26px}
.svc-media{display:block;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden}.svc-media img{width:100%;height:100%;object-fit:cover;display:block}.svc-top:has(.svc-media){flex-direction:column}
.badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:var(--line);color:var(--muted);white-space:nowrap}.badge.live{background:color-mix(in srgb,var(--accent) 14%,var(--bg));color:var(--accent)}
.svc-cta{display:inline-flex;align-items:center;gap:6px;margin-top:20px;font-weight:700;font-size:15px;color:var(--accent)}
.split{display:grid;gap:32px}.reasons{display:grid;gap:14px}.reason{display:flex;gap:18px;padding:22px;background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:var(--sh)}.reason h3{font-size:18px}.reason p{color:var(--muted);margin-top:4px}
.num{flex:none;font-weight:800;font-size:16px;color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--bg));width:46px;height:46px;border-radius:12px;display:grid;place-items:center}
.stats{display:grid;gap:14px}.stat{display:grid;gap:2px;padding:26px;border-radius:20px;border:1px solid var(--line);background:var(--card)}.stat strong{font-size:42px;line-height:1;letter-spacing:-.03em;color:var(--accent)}.stat span{font-weight:700;margin-top:8px}.stat small{color:var(--muted);font-size:14px}
.cta{position:relative;overflow:hidden;background:var(--ink);color:#fff;border-radius:28px;padding:clamp(28px,6vw,64px);background-image:radial-gradient(500px 240px at 100% 0,color-mix(in srgb,var(--accent) 45%,transparent),transparent 70%)}.cta p{margin-top:12px;color:color-mix(in srgb,#fff 78%,var(--ink));max-width:56ch}.cta .btn-accent{flex:0 1 auto}
.access{display:none}.access:target{display:grid;position:fixed;inset:0;z-index:50;place-items:center;padding:20px}
.access-bg{position:absolute;inset:0;background:color-mix(in srgb,var(--ink) 55%,transparent);backdrop-filter:blur(4px)}
.access-card{position:relative;width:min(440px,100%);background:var(--bg);border:1px solid var(--line);border-radius:22px;padding:32px 28px 28px;box-shadow:0 30px 70px color-mix(in srgb,var(--ink) 35%,transparent);animation:pop .25s ease-out}
.access-card h3{font-size:22px;letter-spacing:-.02em;padding-right:32px}.access-card p{margin:10px 0 22px;color:var(--muted)}.access-card .btn{width:100%}
.access-x{position:absolute;top:12px;right:12px;width:40px;height:40px;display:grid;place-items:center;border-radius:10px;font-size:26px;line-height:1;color:var(--muted)}.access-x:hover{background:var(--line)}
@keyframes pop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.site-footer{background:var(--ink);color:#fff;padding:56px 0 28px}.foot{display:grid;gap:32px;grid-template-columns:minmax(0,1fr)}.fbrand p{margin-top:14px;font-size:14px;color:color-mix(in srgb,#fff 68%,var(--ink));max-width:42ch}.fbrand .brand-name{white-space:normal;overflow:visible;max-width:none}
.fcol h4{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb,#fff 55%,var(--ink));margin-bottom:12px}.fcol li{font-size:15px}.fcol a{display:inline-block;padding:6px 0;min-height:36px}.fcol a:hover{color:var(--accent);filter:brightness(1.4)}.cl{display:block;font-size:12px;color:color-mix(in srgb,#fff 55%,var(--ink))}
.copy{border-top:1px solid color-mix(in srgb,#fff 16%,var(--ink));margin-top:32px;padding-top:20px;font-size:14px;color:color-mix(in srgb,#fff 62%,var(--ink))}
@media(min-width:640px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.stats{grid-template-columns:repeat(2,1fr)}.section{padding:84px 0}.actions .btn{flex:0 1 auto}.foot{grid-template-columns:repeat(2,minmax(0,1fr))}.fbrand,.copy{grid-column:1/-1}}
@media(min-width:960px){.nav-desktop,.login{display:flex}.menu{display:none}.hero{padding:88px 0}.hero-grid{grid-template-columns:1.05fr .95fr;gap:56px}.grid{grid-template-columns:repeat(3,minmax(0,1fr))}.stats{grid-template-columns:repeat(3,1fr)}.split{grid-template-columns:.9fr 1.1fr;gap:64px}.foot{grid-template-columns:repeat(auto-fit,minmax(180px,1fr));align-items:start}.fbrand{grid-column:auto}}
@media(min-width:1200px){.grid:has(li:nth-child(4)){grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}`;
}
