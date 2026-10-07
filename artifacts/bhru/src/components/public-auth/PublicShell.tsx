import { useEffect, useState, type ReactNode, type MouseEvent } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Store, Newspaper, Package, Users, ShoppingBag, Coins, BarChart3, Wrench, MousePointerClick, Layers, TrendingUp, ShieldCheck, Clock } from 'lucide-react';
import { ProductPreview, Dongle } from './ProductPreview';
import './public-auth.css';

const base = import.meta.env.BASE_URL;

type Mod = { k: string; t: string; d: string; long: string; l: string[]; s: 'Available' | 'Coming later'; I: typeof Store; c: string; x: number };
const CARDS: Mod[] = [
  { k: 'ecom', t: 'E-Commerce', d: 'Sell products and services from your own storefront.', long: 'A public storefront that belongs to your business, built from your catalogue.', l: ['Public storefront', 'Cart and checkout to retail orders'], s: 'Available', I: Store, c: 'o', x: 0 },
  { k: 'cms', t: 'CMS / Blog', d: 'Branding, banners, announcements and pages.', long: 'Control how your public site looks: logo, banners, announcements and content.', l: ['Branding and banners', 'Announcements'], s: 'Available', I: Newspaper, c: 'b', x: 3 },
  { k: 'cat', t: 'Products & Services', d: 'One catalogue for items and the work you do.', long: 'Products and services share one catalogue, published to your storefront.', l: ['Products and services together', 'Publish or keep as draft'], s: 'Available', I: Package, c: 'v', x: 1 },
  { k: 'ord', t: 'Orders', d: 'Retail orders from your storefront, in your panel.', long: 'Every storefront order lands in a single list in your panel.', l: ['Single order list', 'Order status tracking'], s: 'Available', I: ShoppingBag, c: 'r', x: 2 },
  { k: 'cur', t: 'Currencies', d: 'Commercial currencies and storefront display.', long: 'Configure the currencies you trade in and which ones the storefront shows.', l: ['Commercial currencies', 'Storefront price display'], s: 'Available', I: Coins, c: 'y', x: 4 },
  { k: 'cus', t: 'Customers', d: 'Part of the workspace. Coming later.', long: 'Customers, Reports and IMEI, Server and Remote engines appear in the panel navigation as the platform expands. They are not active features yet.', l: ['In workspace navigation', 'Not enabled yet'], s: 'Coming later', I: Users, c: 'g', x: 5 },
  { k: 'rep', t: 'Reports', d: 'Part of the workspace. Coming later.', long: 'Customers, Reports and IMEI, Server and Remote engines appear in the panel navigation as the platform expands. They are not active features yet.', l: ['In workspace navigation', 'Not enabled yet'], s: 'Coming later', I: BarChart3, c: 'v', x: 5 },
  { k: 'eng', t: 'Service engines', d: 'IMEI, Server and Remote. Coming later.', long: 'Customers, Reports and IMEI, Server and Remote engines appear in the panel navigation as the platform expands. They are not active features yet.', l: ['In workspace navigation', 'Not enabled yet'], s: 'Coming later', I: Wrench, c: 'n', x: 5 },
];
const TABS = ['E-Commerce', 'Catalogue', 'Orders', 'Public site', 'Currencies', 'Workspace'];
const TAB_MOD = [0, 2, 3, 1, 4, 5];

function ExplorerVisual({ i }: { i: number }) {
  if (i === 0) return <div className="ev-shop">{['Service dongle', 'Remote setup'].map((n, j) => <div key={n}><span className="ev-img">{j === 0 ? <Dongle size={70} /> : <Wrench size={22} />}</span><b>{n}</b><em>{j === 0 ? '$85.00' : '$20.00'}</em><span className="ev-btn">Add to cart</span></div>)}</div>;
  if (i === 1) return <div className="ev-list">{[['Service dongle', 'Product', 'Published'], ['Remote setup', 'Service', 'Draft']].map(([a, b, c]) => <div key={a}><b>{a}</b><span>{b}</span><span className={c === 'Published' ? 'pv-st ok' : 'pv-st'}>{c}</span></div>)}</div>;
  if (i === 2) return <div className="pv-empty ev-big"><ShoppingBag size={22} /><b>No orders yet</b><span>New storefront orders will be listed here with their status.</span></div>;
  if (i === 3) return <div className="ev-site"><div className="ev-ann">Announcement bar</div><div className="ev-ban"><b>Your banner headline</b><span>Shown at the top of your storefront</span></div></div>;
  if (i === 4) return <div className="ev-list">{[['USD', 'Client default'], ['EUR', 'Shown on storefront'], ['GBP', 'Hidden']].map(([a, b], j) => <div key={a}><b>{a}</b><span>{b}</span><i className={j < 2 ? 'sw on' : 'sw'} /></div>)}</div>;
  return <div className="ev-list">{['Customers', 'Reports', 'IMEI orders', 'Server orders', 'Remote orders'].map((a) => <div key={a}><b>{a}</b><span className="pv-st">Coming later</span></div>)}</div>;
}

export function PublicShell({ mode, children }: { mode: 'login' | 'register'; children: ReactNode }) {
  const [tab, setTab] = useState(0);
  useEffect(() => {
    const prev = document.title;
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const created = !meta;
    const prevDesc = meta?.content ?? '';
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    document.title = mode === 'login' ? 'Sign in | BHRU' : 'Create your account | BHRU';
    meta.content = 'BHRU brings your unlock and server business, services, orders and public storefront together.';
    return () => { document.title = prev; if (created) meta?.remove(); else if (meta) meta.content = prevDesc; };
  }, [mode]);

  const focusAuth = (e?: MouseEvent) => {
    e?.preventDefault();
    const el = document.getElementById('auth');
    el?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    el?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  };
  const learn = (m: Mod) => {
    setTab(m.x);
    document.getElementById('explorer')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };
  const m = CARDS[TAB_MOD[tab]];

  return (
    <div className="pa">
      <header className="pa-top">
        <Link href="/login" className="pa-brand" aria-label="BHRU home">
          <img src={`${base}brand/bhru-icon.png`} alt="" width={36} height={36} />
          <span><b><i>B</i>HRU</b><small>SaaS for Unlock Servers</small></span>
        </Link>
        <nav className="pa-nav" aria-label="Page sections">
          <a href="#features">Features</a><a href="#explorer">Solutions</a><a href="#how">How it works</a>
        </nav>
        {mode === 'login'
          ? <a href="#auth" className="pa-toplink" onClick={focusAuth} data-testid="link-header-signin">Sign in</a>
          : <Link href="/login" className="pa-toplink" data-testid="link-header-signin">Sign in</Link>}
      </header>

      <main className="pa-main">
        <div className="pa-deco" aria-hidden="true" />
        <section className="pa-hero">
          <div className="pa-tag">All-in-one platform for unlock &amp; server businesses</div>
          <h1><span>Manage, sell and</span><span>grow your business</span><span>with <em>BHRU.</em></span></h1>
          <p className="lead">Products, services, customer orders, your website, e-commerce and currencies. One workspace for your business.</p>
          <div className="intro-cta">
            <Link href="/register" onClick={mode === 'register' ? focusAuth : undefined} className="pa-btn p" data-testid="link-hero-register">Create an account <ArrowRight size={16} /></Link>
            <a href="#features" className="pa-btn" data-testid="link-hero-features">Explore features</a>
          </div>
          <ul className="pa-bens">
            <li><i><MousePointerClick size={13} /></i>Easy to use</li>
            <li><i><Layers size={13} /></i>Powerful modules</li>
            <li><i><TrendingUp size={13} /></i>Built for growth</li>
          </ul>
        </section>

        <div className="pa-visual"><ProductPreview /></div>

        <section className="pa-panel" id="auth" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
          <div className="pa-plogo">
            <img src={`${base}brand/bhru-icon.png`} alt="" width={40} height={40} />
            <span><b><i>B</i>HRU</b><small>SaaS for Unlock Servers</small></span>
          </div>
          <div className="pa-tabs">
            <Link href="/login" aria-current={mode === 'login' ? 'page' : undefined}>Sign in</Link>
            <Link href="/register" aria-current={mode === 'register' ? 'page' : undefined}>Create an account</Link>
          </div>
          {children}
          <div className="pa-trust">
            <span><ShieldCheck size={14} />New accounts start as Pending until approved.</span>
            <span><Clock size={14} />Available modules depend on your licence and add-ons.</span>
          </div>
        </section>

        <section className="pa-cards" id="features" aria-label="Modules">
          {CARDS.map((c) => (
            <article key={c.k} className="pa-card">
              <i className={`ic ${c.c}`}><c.I size={18} /></i>
              <div>
                <h3>{c.t}{c.s !== 'Available' && <span className="soon">Later</span>}</h3>
                <p>{c.d}</p>
                <button type="button" onClick={() => learn(c)} data-testid={`button-learn-${c.k}`}>Learn more <ArrowRight size={13} /></button>
              </div>
            </article>
          ))}
        </section>
      </main>

      <section className="pa-sec" id="explorer">
        <div className="pa-sh"><div className="pa-tag">Module explorer</div><h2>Every part of the business, in one panel</h2></div>
        <div className="pa-mods">
          <div className="pa-tabl" role="group" aria-label="Modules">
            {TABS.map((x, i) => <button key={x} type="button" aria-pressed={tab === i} onClick={() => setTab(i)} data-testid={`tab-module-${i}`}>{x}</button>)}
          </div>
          <div className="pa-modbox" aria-live="polite">
            <div className="pa-modtxt">
              <span className={m.s === 'Available' ? 'pa-badge ok' : 'pa-badge'}>{m.s}</span>
              <h3>{TABS[tab] === 'Workspace' ? 'Customers, reports and service engines' : m.t}</h3>
              <p>{m.long}</p>
              <ul>{m.l.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
            <div className="pa-modvis" aria-hidden="true"><ExplorerVisual i={tab} /></div>
          </div>
          <p className="pa-example-note">Illustrative previews with example items and prices. Module access depends on your licence and add-ons.</p>
        </div>
      </section>

      <section className="pa-sec" id="how">
        <div className="pa-sh"><div className="pa-tag">How it works</div><h2>From sign-up to selling</h2></div>
        <ol className="pa-flow">
          <li><b>Create your account</b><span>Two short steps: owner, then business.</span></li>
          <li><b>Get approved</b><span>New accounts start as Pending until approved.</span></li>
          <li><b>Set up your business</b><span>Add your catalogue, brand your storefront and receive retail orders.</span></li>
        </ol>
      </section>

      <footer className="pa-foot">
        <span>BHRU, SaaS for Unlock Servers</span>
        <span>{mode === 'login' ? <>New to BHRU? <Link href="/register">Create an account</Link></> : <>Already a subscriber? <Link href="/login">Sign in</Link></>}</span>
      </footer>
    </div>
  );
}
