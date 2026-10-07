import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { ProductPreview } from './ProductPreview';
import './public-auth.css';

const base = import.meta.env.BASE_URL;

const MODULES = [
  { k: 'E-Commerce', t: 'E-Commerce', d: 'Sell your products and services from your own public storefront.', l: ['Public storefront for your business', 'Retail orders arrive in your panel'], s: 'Available' },
  { k: 'Catalogue', t: 'Products & Services', d: 'Manage the business catalogue your storefront is built from.', l: ['Products and services in one place', 'Published to your storefront'], s: 'Available' },
  { k: 'Orders', t: 'Retail orders', d: 'Receive and manage orders placed through your storefront.', l: ['Single order list', 'Order status in your panel'], s: 'Available' },
  { k: 'Public site', t: 'CMS / Public Website', d: 'Control branding, banners, announcements and public presentation.', l: ['Branding', 'Banners and announcements'], s: 'Available' },
  { k: 'Currencies', t: 'Currencies', d: 'Configure commercial currencies and how prices display on the storefront.', l: ['Commercial currencies', 'Storefront price display'], s: 'Available' },
  { k: 'Workspace', t: 'Customers, reports and service engines', d: 'Customers, Reports and IMEI, Server and Remote order engines appear in the panel navigation as the platform expands. They are not yet active features.', l: ['Part of the workspace navigation', 'Not enabled yet'], s: 'Planned' },
];

export function PublicShell({ mode, children }: { mode: 'login' | 'register'; children: ReactNode }) {
  const [mod, setMod] = useState(0);
  useEffect(() => {
    const prev = document.title;
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const created = !meta;
    const prevDesc = meta?.content ?? '';
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    document.title = mode === 'login' ? 'Sign in | BHRU' : 'Create your account | BHRU';
    meta.content = 'BHRU brings your unlock and server business, services, orders, customers and public storefront together.';
    return () => { document.title = prev; if (created) meta?.remove(); else if (meta) meta.content = prevDesc; };
  }, [mode]);
  const m = MODULES[mod];
  return (
    <div className="pa">
      <header className="pa-top">
        <Link href="/login" className="pa-brand" aria-label="BHRU">
          <img src={`${base}brand/bhru-icon.png`} alt="" width={34} height={34} />
          <span><b>BHRU</b><small>SaaS for Unlock Servers</small></span>
        </Link>
        <nav className="pa-nav" aria-label="Page sections">
          <a href="#modules">Modules</a><a href="#how">How it works</a>
        </nav>
        {mode === 'login'
          ? <Link href="/register" className="pa-toplink">Create an account</Link>
          : <Link href="/login" className="pa-toplink">Sign in</Link>}
      </header>
      <main className="pa-main">
        <p className="pa-intro"><b>Run your unlock or server business online.</b> Services, orders and your own storefront in one BHRU panel.</p>
        <section className="pa-panel" aria-label={mode === 'login' ? 'Sign in' : 'Create account'}>
          <div className="pa-tabs">
            <Link href="/login" aria-current={mode === 'login' ? 'page' : undefined}>Sign in</Link>
            <Link href="/register" aria-current={mode === 'register' ? 'page' : undefined}>Create account</Link>
          </div>
          {children}
          <div className="pa-trust">
            <b>BHRU, SaaS for Unlock Servers</b>
            <span>New accounts start as Pending until approved. Which modules you can use depends on your licence and add-ons.</span>
          </div>
        </section>
        <section className="pa-hero">
          <div className="pa-tag pa-copy">Operating system for unlock and server businesses</div>
          <h1 className="pa-copy">Your services, orders and storefront. <em>One BHRU.</em></h1>
          <p className="lead pa-copy">Run the business behind your unlock or server service, and give customers a public storefront that is yours, from the same panel.</p>
          <div className="intro-cta pa-copy">
            <Link href="/register" className="pa-btn p">Create an account <ArrowRight size={16} /></Link>
            <Link href="/login" className="pa-btn">Sign in</Link>
          </div>
          <ProductPreview />
        </section>
      </main>
      <section className="pa-sec" id="modules">
        <h2>Every part of the business, in one panel</h2>
        <p>Select a module to read what it does. Access to each module depends on your licence or add-on entitlement; it is not included in every account.</p>
        <div className="pa-mods">
          <div className="pa-tabl" role="group" aria-label="Modules">
            {MODULES.map((x, i) => <button key={x.k} type="button" aria-pressed={mod === i} onClick={() => setMod(i)}>{x.k}</button>)}
          </div>
          <div className="pa-modbox" aria-live="polite">
            <div className="pa-tag" style={{ margin: 0 }}>{m.s}</div><h3>{m.t}</h3><p>{m.d}</p>
            <ul>{m.l.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </div>
      </section>
      <section className="pa-sec" id="how">
        <h2>From sign-up to selling</h2>
        <div className="pa-flow" style={{ marginBlockStart: 20 }}>
          <div><b>Create your account</b><span>Two short steps: owner, then business.</span></div>
          <div><b>Get approved</b><span>New accounts start as Pending until approved.</span></div>
          <div><b>Set up your business</b><span>Add your catalogue, brand your storefront and receive retail orders.</span></div>
        </div>
      </section>
      <footer className="pa-foot">
        <span>BHRU, SaaS for Unlock Servers</span>
        <span>{mode === 'login' ? <>New to BHRU? <Link href="/register">Create an account</Link></> : <>Already a subscriber? <Link href="/login">Sign in</Link></>}</span>
      </footer>
    </div>
  );
}
