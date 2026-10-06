import { renderPublicHome } from './public-site/homepage';
import type { PublicSiteModel } from './public-site/model';
export type { PublicSiteNames } from './public-site/model';
const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

export function publicSiteHTML(site?: PublicSiteModel, unavailable = false): string {
  if (site) return renderPublicHome(site);
  // Preserve Phase 2 generic failure documents, independent of the template.
  const title = unavailable ? 'Website temporarily unavailable' : 'Website unavailable';
  const heading = title;
  const description = unavailable ? 'Please try again later.' : 'This website is not available.';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta name="robots" content="noindex,nofollow">
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#162032;background:#f5f6f8}
.page{min-height:100svh;display:flex;flex-direction:column;max-width:960px;padding:32px 24px;margin:auto}
header{display:flex;align-items:center;gap:12px;font-size:14px;color:#647084}.brand{font-weight:800;font-size:21px;letter-spacing:-.8px;color:#172132}
.separator{height:18px;width:1px;background:#d4dae3}main{flex:1;display:grid;align-items:center;padding:64px 0}
.card{background:white;border:1px solid #e1e5eb;border-radius:18px;padding:clamp(28px,6vw,64px);box-shadow:0 12px 40px #16203205}
.label{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#a74b08;display:flex;align-items:center;gap:8px}
.dot{width:7px;height:7px;background:#ef7b18;border-radius:50%}h1{font-size:clamp(30px,5vw,48px);letter-spacing:-1.5px;line-height:1.15;margin:22px 0 16px;overflow-wrap:anywhere}
p{font-size:16px;line-height:1.75;color:#637083;margin:0;overflow-wrap:anywhere}.business{margin-top:12px;font-size:14px}
.notice{border-top:1px solid #e8ebf0;margin-top:32px;padding-top:24px;font-size:14px}footer{font-size:12px;color:#798394;padding-bottom:8px}
@media(max-width:480px){.page{padding:24px 18px}main{padding:36px 0}h1{letter-spacing:-1px}}
</style></head><body><div class="page">
<header><span class="brand">BHRU</span><span class="separator" aria-hidden="true"></span><span>Public website</span></header>
<main><section class="card" aria-labelledby="site-name">
<div class="label"><span class="dot" aria-hidden="true"></span>Public website</div>
<h1 id="site-name">${escape(heading)}</h1>
<p>${escape(description)}</p>


</section></main><footer>Powered by BHRU</footer>
</div></body></html>`;
}
