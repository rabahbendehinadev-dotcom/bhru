import { safePublicColor } from './safety';
import type { PublicSiteModel } from './model';

export function renderStyles(m: PublicSiteModel): string {
  const a = safePublicColor(m.theme.accent, '#bbf451'), i = safePublicColor(m.theme.ink, '#17251e'), b = safePublicColor(m.theme.background, '#f7f9f6');
  return `:root{--accent:${a};--ink:${i};--bg:${b};--muted:color-mix(in srgb,${i} 66%,${b});--line:color-mix(in srgb,${i} 14%,${b});--card:color-mix(in srgb,#fff 70%,${b})}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:84px}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
h1,h2,h3,p,ul,ol{margin:0}ul,ol{padding:0;list-style:none}a{color:inherit;text-decoration:none}h1,h2,h3,p,a,strong,span{overflow-wrap:anywhere}
a:focus-visible,summary:focus-visible{outline:3px solid var(--ink);outline-offset:3px}
.wrap{width:min(1160px,100% - 40px);margin-inline:auto}
.site-header{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.bar{display:flex;align-items:center;gap:20px;min-height:68px}.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px;letter-spacing:-.02em;min-width:0;margin-right:auto}
.brand-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46vw}
.monogram{flex:none;width:36px;height:36px;border-radius:11px;background:var(--ink);color:var(--accent);display:grid;place-items:center;font-weight:800}.logo-img{flex:none;width:36px;height:36px;object-fit:contain;border-radius:8px}
.nav-desktop{display:none;gap:6px}.nav-desktop a{padding:8px 14px;border-radius:999px;font-weight:600;font-size:15px;color:var(--muted)}.nav-desktop a:hover{background:var(--line);color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border-radius:999px;font-weight:700;font-size:15px;border:2px solid var(--ink);transition:transform .15s}.btn:active{transform:scale(.97)}
.btn-solid{background:var(--ink);color:var(--accent)}.btn-outline,.btn-ghost{background:transparent}.btn-accent{background:var(--accent);color:var(--ink);border-color:var(--accent)}
.login{display:none;min-height:42px}
.menu{position:static}.menu summary{list-style:none;cursor:pointer;width:48px;height:48px;display:grid;place-items:center;border-radius:14px;border:1.5px solid var(--line)}.menu summary::-webkit-details-marker{display:none}
.burger,.burger:before,.burger:after{display:block;width:20px;height:2px;background:var(--ink);border-radius:2px;content:"";position:relative}.burger:before{top:-6px;position:absolute}.burger:after{top:6px;position:absolute}
.site-header:has(.menu[open]){position:relative}
.menu-panel{position:absolute;left:12px;right:12px;top:76px;background:#fff;border:1px solid var(--line);border-radius:20px;padding:12px;box-shadow:0 20px 50px color-mix(in srgb,var(--ink) 18%,transparent)}
.menu-panel nav{display:grid;gap:4px}.menu-panel nav a:not(.btn){padding:14px 16px;border-radius:12px;font-weight:600;min-height:48px}.menu-panel nav a:not(.btn):hover{background:var(--bg)}.menu-panel .btn{margin-top:8px}
.hero{padding:44px 0 56px;background:radial-gradient(900px 400px at 85% 0,color-mix(in srgb,var(--accent) 38%,transparent),transparent 70%)}
.hero-grid{display:grid;gap:36px;align-items:center}.eyebrow{display:inline-block;font-weight:700;font-size:13px;letter-spacing:.1em;text-transform:uppercase;background:var(--accent);color:var(--ink);padding:5px 12px;border-radius:999px}.eyebrow-sub{margin-top:8px;color:var(--muted);font-size:14px}
h1{font-size:clamp(34px,8vw,64px);line-height:1.05;letter-spacing:-.035em;margin:18px 0}.lead{font-size:clamp(17px,2.4vw,20px);color:var(--muted);max-width:56ch}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.actions .btn{flex:1 1 180px}
.hero-visual .art,.hero-img{width:100%;height:auto;max-height:440px;border-radius:32px;display:block;object-fit:cover}
.section{padding:56px 0}.alt{background:color-mix(in srgb,var(--ink) 5%,var(--bg))}
.head h2,.cta h2{font-size:clamp(28px,5vw,44px);line-height:1.1;letter-spacing:-.03em}.head p{margin-top:12px;color:var(--muted);max-width:60ch}
.grid{display:grid;gap:16px;margin-top:32px}.card{display:block;height:100%;background:var(--card);border:1px solid var(--line);border-radius:24px;padding:26px;transition:transform .2s}a.card:hover{transform:translateY(-4px)}
.service h3{font-size:20px;margin:16px 0 8px}.service p{color:var(--muted)}.is-soon{border-style:dashed}
.ico{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:var(--ink);color:var(--accent)}.ico svg{width:24px;height:24px}
.badge{display:inline-block;margin-top:14px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:4px 10px;border-radius:999px;background:var(--accent);color:var(--ink)}
.split{display:grid;gap:32px}.reasons{display:grid;gap:14px}.reason{display:flex;gap:18px;padding:22px;background:var(--card);border:1px solid var(--line);border-radius:22px}.reason h3{font-size:18px}.reason p{color:var(--muted);margin-top:4px}
.num{flex:none;font-weight:800;font-size:22px;color:var(--ink);background:var(--accent);width:48px;height:48px;border-radius:14px;display:grid;place-items:center}
.stats{display:grid;gap:14px}.stat{display:grid;gap:2px;padding:26px;border-radius:24px;border:1px solid var(--line);background:var(--card)}.stat strong{font-size:44px;line-height:1;letter-spacing:-.03em;color:var(--muted)}.stat span{font-weight:700;margin-top:8px}.stat small{color:var(--muted);font-size:14px}
.cta{background:var(--ink);color:var(--bg);border-radius:32px;padding:clamp(28px,6vw,64px)}.cta p{margin-top:12px;color:color-mix(in srgb,var(--bg) 75%,var(--ink));max-width:56ch}.cta .btn-accent{flex:0 1 auto}
.access{margin-top:16px;padding:24px;border-radius:22px;border:2px dashed var(--ink);background:var(--card)}.access h3{font-size:20px}.access p{margin-top:6px;color:var(--muted)}.access:target{background:var(--accent)}
.site-footer{background:var(--ink);color:var(--bg);padding:48px 0 28px;margin-top:24px}.foot{display:grid;gap:24px}.foot-name{font-size:20px}.foot p{color:color-mix(in srgb,var(--bg) 70%,var(--ink));margin-top:6px;font-size:14px}
.foot-links{display:flex;flex-wrap:wrap;gap:8px 20px}.foot-links a{padding:8px 0;min-height:44px;font-weight:600}.foot-links a:hover{color:var(--accent)}.copy{border-top:1px solid color-mix(in srgb,var(--bg) 20%,var(--ink));padding-top:20px}
@media(min-width:700px){.grid,.stats{grid-template-columns:repeat(2,1fr)}.section{padding:80px 0}.actions .btn{flex:0 1 auto}}
@media(min-width:960px){.nav-desktop,.login{display:flex}.menu{display:none}.hero{padding:88px 0}.hero-grid{grid-template-columns:1.1fr .9fr}.grid,.stats{grid-template-columns:repeat(3,1fr)}.split{grid-template-columns:.9fr 1.1fr;gap:64px}.foot{grid-template-columns:1.4fr 1fr;align-items:start}.copy{grid-column:1/-1}}
@media(prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}`;
}
