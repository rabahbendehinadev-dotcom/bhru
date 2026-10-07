import { useState } from 'react';
import { LayoutDashboard, ShoppingBag, Package, Newspaper, Coins, Globe, Wrench, Image as ImageIcon, Megaphone, Check } from 'lucide-react';

const VIEWS = ['Catalogue', 'Public website', 'Currencies'] as const;
type View = typeof VIEWS[number];
const NAV: [string, typeof Package, View | null][] = [
  ['Dashboard', LayoutDashboard, null], ['Retail orders', ShoppingBag, null], ['Products', Package, 'Catalogue'],
  ['CMS', Newspaper, 'Public website'], ['Currencies', Coins, 'Currencies'],
];

const Row = ({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) => (
  <div className="pv-f"><span className="pv-l">{label}</span><span className="pv-v">{icon}{value}</span></div>
);

export function ProductPreview() {
  const [view, setView] = useState<View>('Catalogue');
  return (
    <figure className="pv" aria-label="Illustrative BHRU interface">
      <div className="pv-bar" role="group" aria-label="Preview section">
        {VIEWS.map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>)}
      </div>
      <div className="pv-win">
        <div className="pv-nav" aria-hidden="true">
          <div className="pv-logo">BHRU</div>
          {NAV.map(([n, I, v]) => <span key={n} className={v === view ? 'on' : ''}><I size={15} /><em>{n}</em></span>)}
        </div>
        <div className="pv-body">
          {view === 'Catalogue' && (
            <>
              <div className="pv-h"><b>Add to catalogue</b><span>Products and services share one catalogue</span></div>
              <div className="pv-types" aria-hidden="true">
                <span className="on"><Package size={20} /><b>Product</b><em>Physical or digital item</em><Check size={14} className="ck" /></span>
                <span><Wrench size={20} /><b>Service</b><em>Work you perform for a customer</em></span>
              </div>
              <div className="pv-grid" aria-hidden="true">
                <Row label="Name" value="Item name" /><Row label="Category" value="Choose category" />
                <Row label="Price" value="0.00" /><Row label="Currency" value="Storefront currency" />
              </div>
              <div className="pv-foot" aria-hidden="true"><span className="pv-pub"><Globe size={13} /> Published to storefront</span></div>
            </>
          )}
          {view === 'Public website' && (
            <>
              <div className="pv-h"><b>Public website</b><span>What customers see on your storefront</span></div>
              <div className="pv-site" aria-hidden="true">
                <div className="pv-ban"><ImageIcon size={18} /><span>Banner</span></div>
                <div className="pv-ann"><Megaphone size={14} /><span>Announcement text</span></div>
              </div>
              <div className="pv-grid" aria-hidden="true">
                <Row label="Business name" value="Your brand" /><Row label="Logo" value="Upload image" icon={<ImageIcon size={13} />} />
                <Row label="Storefront address" value="your-business" /><Row label="Visibility" value="Public" />
              </div>
            </>
          )}
          {view === 'Currencies' && (
            <>
              <div className="pv-h"><b>Currencies</b><span>Commercial currencies and storefront display</span></div>
              <div className="pv-cur" aria-hidden="true">
                {[['USD', 'Client Default'], ['EUR', 'Shown on storefront'], ['DZD', 'Not shown']].map(([c, d], i) => (
                  <div key={c}><Coins size={16} /><b>{c}</b><em>{d}</em><span className={i < 2 ? 'sw on' : 'sw'} /></div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <figcaption>Illustrative interface based on the BHRU subscriber panel. Sample labels only, no real data.</figcaption>
    </figure>
  );
}
