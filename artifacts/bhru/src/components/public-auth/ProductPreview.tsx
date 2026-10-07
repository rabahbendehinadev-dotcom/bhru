import { useId } from 'react';
import { LayoutDashboard, ShoppingBag, Package, Newspaper, Coins, Settings, Store, Search, ShoppingCart, Home, User, Grid2x2, Plus, Inbox } from 'lucide-react';

const base = import.meta.env.BASE_URL;

const NAV: [string, typeof Package][] = [
  ['Dashboard', LayoutDashboard], ['Products', Package], ['Retail orders', ShoppingBag],
  ['E-Commerce', Store], ['CMS / Blog', Newspaper], ['Currencies', Coins], ['Settings', Settings],
];

/** Hand-drawn illustrative product: a USB service dongle. */
export function Dongle({ size = 64 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 120 74" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c3446" /><stop offset="1" stopColor="#11161f" /></linearGradient>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e9ecf1" /><stop offset="1" stopColor="#9aa2b1" /></linearGradient>
      </defs>
      <ellipse cx="60" cy="66" rx="48" ry="5" fill="#141c2e" opacity=".12" />
      <rect x="4" y="27" width="20" height="18" rx="2" fill={`url(#${id}-metal)`} />
      <rect x="8" y="31" width="5" height="4" fill="#5b6578" /><rect x="8" y="38" width="5" height="4" fill="#5b6578" />
      <rect x="22" y="14" width="92" height="44" rx="12" fill={`url(#${id}-body)`} />
      <rect x="26" y="17" width="84" height="6" rx="3" fill="#fff" opacity=".08" />
      <circle cx="98" cy="36" r="4" fill="#f26a1b" /><circle cx="98" cy="36" r="7" fill="#f26a1b" opacity=".2" />
      <text x="42" y="41" fill="#c9ced8" fontSize="10" fontWeight="700" fontFamily="system-ui" letterSpacing="1.5">BOX</text>
    </svg>
  );
}

export function ProductPreview() {
  return (
    <figure className="pv" aria-label="Illustrative BHRU interface">
      <div className="pv-stage" aria-hidden="true">
        <div className="pv-laptop">
          <div className="pv-screen">
            <div className="pv-win">
              <aside className="pv-nav">
                <div className="pv-logo"><img src={`${base}brand/bhru-icon.png`} alt="" width={18} height={18} /><b>BHRU</b></div>
                {NAV.map(([n, I], i) => <span key={n} className={i === 0 ? 'on' : ''}><I size={11} /><em>{n}</em></span>)}
              </aside>
              <div className="pv-body">
                <div className="pv-topbar"><span className="pv-search"><Search size={9} /> Search</span><span className="pv-av">AB</span></div>
                <div className="pv-h"><b>Dashboard</b><span className="pv-pill">Pending setup</span></div>
                <div className="pv-kpis">
                  {[['Products', Package, '0'], ['Retail orders', ShoppingBag, '0'], ['Storefront', Store, 'Draft'], ['Currencies', Coins, 'USD']].map(([l, I, v]) => {
                    const Ic = I as typeof Package;
                    return <div key={l as string}><i><Ic size={10} /></i><small>{l as string}</small><b>{v as string}</b></div>;
                  })}
                </div>
                <div className="pv-cols">
                  <div className="pv-card">
                    <div className="pv-ch"><b>Catalogue</b><span><Plus size={8} /> Add item</span></div>
                    <div className="pv-tr th"><span>Item</span><span>Type</span><span>Price</span><span>Status</span></div>
                    <div className="pv-tr"><span className="pv-it"><i className="pv-th"><Dongle size={22} /></i>Service dongle</span><span>Product</span><span>$85.00</span><span className="pv-st ok">Published</span></div>
                    <div className="pv-tr"><span className="pv-it"><i className="pv-th s"><Settings size={9} /></i>Remote setup</span><span>Service</span><span>$20.00</span><span className="pv-st">Draft</span></div>
                  </div>
                  <div className="pv-card">
                    <div className="pv-ch"><b>Retail orders</b></div>
                    <div className="pv-empty"><Inbox size={16} /><b>No orders yet</b><span>Orders from your storefront appear here.</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="pv-base" />
        </div>
        <div className="pv-phone">
          <div className="pv-notch" />
          <div className="pv-ph-top"><b>Your store</b><ShoppingCart size={11} /></div>
          <div className="pv-ph-search"><Search size={8} /> Search products</div>
          <div className="pv-ph-chips"><span className="on">All</span><span>Tools</span><span>Services</span></div>
          <div className="pv-ph-img"><Dongle size={96} /></div>
          <b className="pv-ph-t">Service dongle</b>
          <span className="pv-ph-p">$85.00</span>
          <span className="pv-ph-btn">Add to cart</span>
          <div className="pv-ph-nav"><span className="on"><Home size={10} />Home</span><span><Grid2x2 size={10} />Shop</span><span><ShoppingCart size={10} />Cart</span><span><User size={10} />Account</span></div>
        </div>
      </div>
      <figcaption>Illustrative interface. Example item and price, no real account data.</figcaption>
    </figure>
  );
}
