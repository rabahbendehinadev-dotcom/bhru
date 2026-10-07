import { escapeHTML, safePublicImage } from '../public-site/safety';
import type { PublicSiteModel } from '../public-site/model';
import { renderPublicHome } from '../public-site/homepage';
import { renderServices } from '../public-site/components/services';
import { renderCta } from '../public-site/components/cta';
import type { StoreSettings } from './validation';
import { COMMERCE_SCRIPT } from './public-script';
import { PUBLIC_CATALOG_STYLES } from './public-catalog-styles';
import { storefrontPreferences, type StorefrontPreferences } from './storefront-preferences';
import { renderStorefrontHeader, STOREFRONT_AUTH_NOTICE, STOREFRONT_HEADER_STYLES } from './storefront-header';
import { STOREFRONT_HEADER_SCRIPT, STOREFRONT_MENU_SCRIPT } from './storefront-header-script';
import { PUBLIC_MENU_SCRIPT } from '../public-site/mobile-menu';
import { convertMinor, formatCurrencyMinor, type StoreCurrency } from './currency-money';
import { STOREFRONT_MONEY_SCRIPT } from './storefront-money-script';

type View = 'home' | 'product' | 'cart' | 'checkout' | 'confirmation';
interface Img { id?: string; url: string; width?: number; height?: number }
interface Prod { id: string; name: string; slug: string; category_id?: string | null; short_description?: string; description?: string; sku?: string; price_minor: string; compare_at_minor?: string | null; featured?: boolean; in_stock: boolean; stock_quantity?: number | null; images?: Img[] }
interface Cat { id: string; name: string; description?: string; image_url?: string | null }

const e = escapeHTML;
const SLUG = /[^a-z0-9-]/gi;
/** Safe for embedding in application/json inside HTML. */
const inlineJSON = (v: unknown) => JSON.stringify(v).replace(/[<>&\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

export function formatMinor(minor: unknown, currency: string): string {
  const s = String(minor ?? '');
  if (!/^-?\d{1,20}$/.test(s)) return '';
  const neg = s.startsWith('-'), b = BigInt(neg ? s.slice(1) : s);
  const frac = (b % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${(b / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac} ${currency}`;
}
const maxQty = (p: Prod) => !p.in_stock ? 0 : p.stock_quantity == null ? 99 : Math.max(0, Math.min(99, Number(p.stock_quantity) || 0));
const num = (n: unknown, d: number) => { const v = Number(n); return Number.isInteger(v) && v > 0 && v < 10000 ? v : d; };
const isBigger = (a: unknown, b: unknown) => { try { return BigInt(String(a)) > BigInt(String(b)); } catch { return false; } };

function image(img: Img | undefined, alt: string, extra = ''): string {
  const src = img ? safePublicImage(img.url) : null;
  if (!src || !img) return '<span class="cx-ph">No image</span>';
  return `<img src="${e(src)}" alt="${e(alt)}" width="${num(img.width, 600)}" height="${num(img.height, 600)}" loading="lazy" decoding="async"${extra}>`;
}

function card(p: Prod, slug: string, cur: string, cats: Cat[]): string {
  const href = `/${slug}/product/${encodeURIComponent(p.slug)}`;
  const max = maxQty(p);
  const category = cats.find(c => c.id === p.category_id);
  const categoryLabel = category ? `<p class="cx-muted">${e(category.name)}</p>` : '';
  const was = p.compare_at_minor && isBigger(p.compare_at_minor, p.price_minor) ? `<s class="cx-was" data-sf-money="${e(p.compare_at_minor)}">${e(formatMinor(p.compare_at_minor, cur))}</s>` : '';
  const action = max > 0
    ? `<button class="cx-btn cx-btn-solid" type="button" data-cx-add="${e(p.id)}" data-max="${max}" aria-label="Add ${e(p.name)} to cart">Add to cart</button>`
    : '<p class="cx-out">Out of stock</p>';
  return `<li class="cx-card" data-cx-product="${e(href)}"><a class="cx-media" href="${e(href)}">${image(p.images?.[0], p.name)}${p.featured ? '<span class="cx-flag">Featured</span>' : ''}</a><div class="cx-body"><h3 class="cx-name"><a href="${e(href)}">${e(p.name)}</a></h3>${categoryLabel}<p class="cx-price"><strong data-sf-money="${e(p.price_minor)}">${e(formatMinor(p.price_minor, cur))}</strong>${was}</p>${max > 0 ? '<p class="cx-ok">In stock</p>' : ''}${action}</div></li>`;
}

function homeSection(slug: string, s: StoreSettings, data: any, cats: Cat[]): string {
  const rows: Prod[] = Array.isArray(data?.data) ? data.data : [];
  const chips = cats.length
    ? `<div class="cx-chips" role="group" aria-label="Filter by category"><button class="cx-chip" type="button" data-cx-cat="" aria-pressed="true">All</button>${cats.map(c => `<button class="cx-chip" type="button" data-cx-cat="${e(c.id)}" aria-pressed="false">${e(c.name)}</button>`).join('')}</div>` : '';
  return `<section class="cx cx-store" id="store-products" aria-labelledby="cx-title"><span id="services" aria-hidden="true"></span><div class="wrap"><div class="cx-head"><h2 id="cx-title">${e(s.title)}</h2><a class="cx-btn" href="/${slug}/cart" data-cx-cart-link aria-label="Cart">View cart (<span data-cx-count>0</span>)</a></div>${chips}
<ul class="cx-grid" id="cx-grid">${rows.map(p => card(p, slug, s.currency, cats)).join('')}</ul>
<p class="cx-empty" id="cx-empty"${rows.length ? ' hidden' : ''}>No products are available yet. Please check back soon.</p>
<p class="cx-muted" id="cx-home-status" role="status"></p>
<div class="cx-more"><button class="cx-btn" type="button" id="cx-more" data-page="${num(data?.page, 1)}"${data?.has_more ? '' : ' hidden'}>Load more products</button></div></div></section>`;
}

function productSection(slug: string, s: StoreSettings, p: Prod | null): string {
  if (!p) return `<section class="cx"><div class="wrap"><div class="cx-empty-state"><h1>Product not found</h1><p>This product is not available.</p><a class="cx-btn cx-btn-solid" href="/${slug}#store-products">Back to store</a></div></div></section>`;
  const imgs = (p.images ?? []).filter(i => safePublicImage(i.url));
  const first = imgs[0];
  const max = maxQty(p);
  const thumbs = imgs.length > 1 ? `<ul class="cx-thumbs" aria-label="Product images">${imgs.map((i, n) => `<li><button class="cx-thumb" type="button" data-cx-thumb data-src="${e(safePublicImage(i.url)!)}" data-alt="${e(p.name)} image ${n + 1}" aria-pressed="${n === 0}" aria-label="Show image ${n + 1} of ${imgs.length}"><img src="${e(safePublicImage(i.url)!)}" alt="" width="72" height="72" loading="lazy" decoding="async"></button></li>`).join('')}</ul>` : '';
  const main = first
    ? `<img id="cx-main-img" src="${e(safePublicImage(first.url)!)}" alt="${e(p.name)}" width="${num(first.width, 800)}" height="${num(first.height, 800)}" decoding="async">`
    : '<span class="cx-ph">No image</span>';
  const was = p.compare_at_minor && isBigger(p.compare_at_minor, p.price_minor) ? `<s class="cx-was" data-sf-money="${e(p.compare_at_minor)}">${e(formatMinor(p.compare_at_minor, s.currency))}</s>` : '';
  const buy = max > 0
    ? `<div class="cx-buy"><div class="cx-qty"><button class="cx-step" type="button" data-cx-step="-1" aria-label="Decrease quantity">-</button><input class="cx-qty-in" type="number" inputmode="numeric" min="1" max="${max}" value="1" data-cx-qty aria-label="Quantity"><button class="cx-step" type="button" data-cx-step="1" aria-label="Increase quantity">+</button></div>
<button class="cx-btn cx-btn-solid" type="button" data-cx-add="${e(p.id)}" data-cx-withqty data-max="${max}">Add to cart</button><button class="cx-btn" type="button" data-cx-buy="${e(p.id)}" data-max="${max}">Buy now</button></div>`
    : '<p class="cx-out">Out of stock</p><div class="cx-buy"><button class="cx-btn cx-btn-solid" type="button" disabled>Add to cart</button><button class="cx-btn" type="button" disabled>Buy now</button></div>';
  return `<section class="cx cx-product"><div class="wrap"><nav class="cx-crumbs" aria-label="Breadcrumb"><a href="/${slug}">Home</a><span aria-hidden="true">/</span><a href="/${slug}#store-products">${e(s.title)}</a></nav>
<div class="cx-pgrid"><div class="cx-gallery"><div class="cx-main">${main}</div>${thumbs}</div>
<div class="cx-info"><h1>${e(p.name)}</h1><p class="cx-price cx-price-lg"><strong data-sf-money="${e(p.price_minor)}">${e(formatMinor(p.price_minor, s.currency))}</strong>${was}</p>
${p.short_description ? `<p class="cx-lead">${e(p.short_description)}</p>` : ''}${p.sku ? `<p class="cx-muted">SKU: ${e(p.sku)}</p>` : ''}
${p.in_stock ? (p.stock_quantity != null ? `<p class="cx-ok">${e(String(p.stock_quantity))} in stock</p>` : '<p class="cx-ok">In stock</p>') : ''}${buy}
${p.description ? `<div class="cx-desc">${e(p.description)}</div>` : ''}</div></div></div></section>`;
}

function shell(title: string, id: string): string {
  return `<section class="cx"><div class="wrap"><div class="cx-head"><h1>${e(title)}</h1></div><div id="${id}" aria-live="polite"><noscript><p class="cx-empty">JavaScript is required to use the cart.</p></noscript></div></div></section>`;
}

const CSS = `.cx{padding:44px 0;scroll-margin-top:84px}.cx *{min-width:0}.cx h1,.cx h2,.cx h3{line-height:1.2;letter-spacing:-.02em}
.cx-store>#services{display:block;scroll-margin-top:84px}.cx-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.cx-head h1,.cx-head h2{font-size:clamp(24px,4vw,34px);margin:0}
.cx-muted{color:var(--muted);font-size:14px}.cx-empty,.cx-out{color:var(--muted)}.cx-out{font-weight:600;font-size:14px}.cx-ok{color:var(--accent);font-weight:600;font-size:14px}
.cx-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit;font-weight:700;font-size:15px;cursor:pointer;text-align:center}
.cx-btn:hover{border-color:var(--accent)}.cx-btn-solid{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}.cx-btn:disabled{opacity:.5;cursor:not-allowed}.cx-wide{width:100%}
.cx-btn:focus-visible,.cx-chip:focus-visible,.cx-step:focus-visible,.cx-thumb:focus-visible,.cx-link:focus-visible,.cx-field input:focus-visible,.cx-field textarea:focus-visible,.cx-qty-in:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.cx-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px}.cx-chip{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit;font-weight:600;font-size:14px;cursor:pointer}.cx-chip[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.cx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cx-card{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;box-shadow:var(--sh);cursor:pointer;overflow-wrap:anywhere}.cx-card .cx-muted,.cx-card .cx-ok{margin:0}
.cx-media{position:relative;display:block;aspect-ratio:1/1;background:var(--line)}.cx-media img{width:100%;height:100%;object-fit:cover;display:block}
.cx-ph{display:grid;place-items:center;width:100%;height:100%;min-height:72px;color:var(--muted);font-size:13px;background:var(--line)}.cx-ph-sm{width:72px;height:72px;border-radius:10px;flex:none}
.cx-flag{position:absolute;left:8px;top:8px;background:var(--ink);color:var(--bg);font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px}
.cx-body{display:flex;flex-direction:column;gap:8px;padding:12px;flex:1}.cx-name{font-size:15px;margin:0}.cx-price{margin:0;display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}.cx-price strong{font-size:16px}.cx-was{color:var(--muted);font-size:13px}.cx-body .cx-btn,.cx-body .cx-out{margin-top:auto}
.cx-more{display:flex;justify-content:center;margin-top:20px}
.cx-crumbs{display:flex;flex-wrap:wrap;gap:8px;font-size:14px;color:var(--muted);margin-bottom:16px}.cx-crumbs a:hover{color:var(--ink);text-decoration:underline}
.cx-pgrid{display:grid;gap:24px}.cx-main{aspect-ratio:1/1;border-radius:18px;overflow:hidden;background:var(--line);border:1px solid var(--line)}.cx-main img{width:100%;height:100%;object-fit:contain;display:block}
.cx-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.cx-thumb{width:64px;height:64px;padding:0;border-radius:10px;border:2px solid var(--line);background:var(--card);overflow:hidden;cursor:pointer}.cx-thumb[aria-pressed=true]{border-color:var(--accent)}.cx-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.cx-info{display:flex;flex-direction:column;gap:12px}.cx-info h1{font-size:clamp(26px,5vw,38px);margin:0}.cx-price-lg strong{font-size:24px}.cx-lead{font-size:17px;color:var(--muted)}.cx-desc{white-space:pre-line;color:var(--ink);border-top:1px solid var(--line);padding-top:14px}
.cx-buy{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.cx-qty{display:inline-flex;align-items:center;gap:6px}.cx-step{width:40px;height:40px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit;font-size:18px;font-weight:700;cursor:pointer}.cx-step:disabled{opacity:.4;cursor:not-allowed}
.cx-qty-in{width:64px;height:40px;text-align:center;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit}.cx-qty-n{min-width:28px;text-align:center;font-weight:700}
.cx-lines{display:grid;gap:12px}.cx-line{display:flex;gap:12px;align-items:flex-start;padding:12px;background:var(--card);border:1px solid var(--line);border-radius:14px}.cx-line img{width:72px;height:72px;border-radius:10px;object-fit:cover;flex:none}
.cx-line-info{display:flex;flex-direction:column;gap:6px;flex:1;align-items:flex-start}.cx-line-side{display:flex;flex-direction:column;align-items:flex-end;gap:6px}.cx-link{background:none;border:0;padding:6px 0;color:var(--muted);font:inherit;font-size:14px;text-decoration:underline;cursor:pointer}
.cx-sum{display:grid;gap:10px;margin-top:18px;padding:16px;background:var(--card);border:1px solid var(--line);border-radius:16px;align-self:start}.cx-sum h2{font-size:18px;margin:0}.cx-sum-row{display:flex;justify-content:space-between;gap:12px;margin:0}.cx-sum-total{font-size:18px;border-top:1px solid var(--line);padding-top:10px}
.cx-note{padding:10px 12px;border-radius:10px;background:var(--line);margin-bottom:12px}
.cx-checkout{display:grid;gap:18px}.cx-form{display:grid;gap:14px;order:2}.cx-checkout .cx-sum{order:1;margin-top:0}.cx-form h2{font-size:20px;margin:0}
.cx-field{display:grid;gap:5px}.cx-field label{font-weight:600;font-size:14px}.cx-field input,.cx-field textarea{width:100%;min-height:44px;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit}.cx-field [aria-invalid=true]{border-color:#b42318}
.cx-field-err,.cx-form-error{color:#b42318;font-size:14px;font-weight:600;margin:0}
.cx-empty-state,.cx-confirm{max-width:520px;margin:0 auto;text-align:center;display:grid;gap:12px;justify-items:center;padding:28px 16px;background:var(--card);border:1px solid var(--line);border-radius:18px}.cx-empty-state h1,.cx-empty-state h2,.cx-confirm h2{margin:0;font-size:22px}.cx-empty-state p{color:var(--muted);margin:0}
.cx-ref{font:700 22px/1.2 ui-monospace,monospace;letter-spacing:.04em;padding:8px 14px;border-radius:10px;background:var(--line)}.cx-facts{display:grid;gap:8px;width:100%;margin:0}.cx-facts div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding-bottom:6px}.cx-facts dt{color:var(--muted)}.cx-facts dd{margin:0;font-weight:700;text-align:right}
.cx-skel{height:160px;border-radius:16px;background:var(--line);opacity:.6}.cx-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.cx-hdr-link{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 12px;border-radius:10px;font-weight:700;font-size:14px;border:1px solid var(--line);background:var(--card);white-space:nowrap}.cx-hdr-link span{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:var(--accent);color:var(--accent-ink);font-size:12px}
.cx-hdr-nav{display:none}
@media(min-width:640px){.cx-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.cx-body{padding:14px}}
@media(min-width:900px){.cx-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.cx-pgrid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px}.cx-checkout{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);align-items:start}.cx-form{order:1}.cx-checkout .cx-sum{order:2}.cx-hdr-nav{display:inline-flex}}
@media(max-width:420px){.cx-hdr-products{display:none}.cx-hdr-link{padding:0 9px}}
@media(prefers-reduced-motion:reduce){.cx *{transition:none!important;scroll-behavior:auto!important}}`;

export function renderCommerceDocument(model: PublicSiteModel, slugIn: string, settings: StoreSettings, view: View, data: any, categories: any[], tenantPreferences?: Partial<StorefrontPreferences>, configuredCurrencies?: StoreCurrency[]): string {
  const slug = slugIn.replace(SLUG, '');
  const cats = (Array.isArray(categories) ? categories : []) as Cat[];
  let html = renderPublicHome(model);

  let content: string;
  if (view === 'home') content = homeSection(slug, settings, data, cats);
  else if (view === 'product') content = productSection(slug, settings, data && typeof data === 'object' ? data as Prod : null);
  else if (view === 'cart') content = shell('Your cart', 'cx-cart');
  else if (view === 'checkout') content = shell('Checkout', 'cx-checkout');
  else content = shell('Order confirmation', 'cx-confirmation');

  const live = '<div id="cx-live" class="cx-sr" role="status" aria-live="polite"></div>';
  if (view === 'home') {
    // Replace only the legacy placeholder area; preserve the surrounding V2 sections.
    const cta = renderCta(model);
    // The CTA renderer also contains the existing Login overlay. Keep that untouched.
    const deviceCta = cta.slice(0, cta.indexOf('</section>') + '</section>'.length);
    html = html.replace(renderServices(model), () => content).replace(deviceCta, '')
      .replace('<footer', '<span id="contact" aria-hidden="true"></span><footer');
  } else {
    const a = html.indexOf('<main>'), b = html.indexOf('</main>');
    if (a >= 0 && b > a) html = html.slice(0, a + 6) + content + html.slice(b);
    // Header anchors point at homepage sections; keep them working from commerce pages.
    const h0 = html.indexOf('<header class="site-header">'), h1 = html.indexOf('</header>');
    if (h0 >= 0 && h1 > h0) html = html.slice(0, h0) + html.slice(h0, h1).split('href="#').join(`href="/${slug}#`) + html.slice(h1);
    const titles: Record<string, string> = { product: data?.name ? String(data.name) : 'Product', cart: 'Cart', checkout: 'Checkout', confirmation: 'Order confirmation' };
    html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${e(titles[view] ?? settings.title)} | ${e(model.siteName)}</title>`);
  }

  const preferences = storefrontPreferences(settings.currency, tenantPreferences, configuredCurrencies);
  const clientDefault = preferences.currencies.find(c => c.code === preferences.defaultCurrency)!;
  html = html.replace(/(<(?:strong|s)[^>]* data-sf-money="(\d+)"[^>]*>)[^<]*(<\/(?:strong|s)>)/g, (_match, start, raw, end) => {
    try { return start + e(formatCurrencyMinor(convertMinor(raw, clientDefault), clientDefault)) + end; }
    catch { return start + 'Amount unavailable' + end; }
  });
  html = html.replace(/<header class="site-header">[\s\S]*?<\/header>/, () => renderStorefrontHeader(model, slug, preferences))
    .replace(PUBLIC_MENU_SCRIPT, () => STOREFRONT_MENU_SCRIPT);

  const cfg = {
    slug, currency: settings.currency, view,
    settings: { email_mode: settings.email_mode, address_mode: settings.address_mode, show_state: !!settings.show_state, show_city: !!settings.show_city, show_note: !!settings.show_note },
    page: view === 'home' ? num(data?.page, 1) : 1,
    categories: view === 'home' ? cats.map(c => ({ id: c.id, name: c.name })) : [],
  };
  html = html.replace('</style></head>', () => `${CSS}${view === 'home' ? PUBLIC_CATALOG_STYLES : ''}${STOREFRONT_HEADER_STYLES}</style></head>`);
  const tail = `${live}${STOREFRONT_AUTH_NOTICE}<script type="application/json" id="sf-config">${inlineJSON({ slug, view, ...preferences })}</script><script>${STOREFRONT_MONEY_SCRIPT}</script><script type="application/json" id="cx-config">${inlineJSON(cfg)}</script><script>${COMMERCE_SCRIPT}</script><script>${STOREFRONT_HEADER_SCRIPT}</script>`;
  const end = html.lastIndexOf('</body>');
  return end >= 0 ? html.slice(0, end) + tail + html.slice(end) : html + tail;
}
