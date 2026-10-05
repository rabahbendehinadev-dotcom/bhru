import { useEffect, useRef, useState, type ReactNode } from 'react';
import './subscriber.css';
import { SubscriberThemeProvider } from './theme';
import { Sidebar } from './Sidebar';
import { TopBar, SearchPalette } from './TopBar';
import { MobileHeader } from './MobileHeader';
import { MobileDrawer } from './MobileDrawer';
import { PwaThemeColor } from './PwaInstall';

interface Props { subscriberId: string; business: string; owner: string; banner?: ReactNode; children: ReactNode }

export function SubscriberLayout({ subscriberId, business, owner, banner, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch((s) => !s); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const toggleSidebar = () => {
    if (window.matchMedia('(min-width: 1024px)').matches) setCollapsed((c) => !c); else setMobileOpen((o) => !o);
  };
  return (
    <SubscriberThemeProvider subscriberId={subscriberId}>
      {(theme) => (
        <div className="sub-layout flex min-h-[100dvh] flex-col" data-theme={theme} data-testid="subscriber-layout">
          <PwaThemeColor />
          {banner}
          <div className="flex flex-1">
            <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} onOpenSearch={() => setSearch(true)} />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileHeader owner={owner} onOpenMenu={() => setMobileOpen(true)} onOpenSearch={() => setSearch(true)} menuOpen={mobileOpen} menuBtnRef={menuBtn} />
              <TopBar business={business} owner={owner} onToggleSidebar={toggleSidebar} onOpenSearch={() => setSearch(true)} />
              <main className="sl-main min-w-0 flex-1 overflow-x-hidden p-4 lg:p-6">{children}</main>
            </div>
          </div>
          <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} returnFocus={menuBtn} />
          {search && <SearchPalette onClose={() => setSearch(false)} />}
        </div>
      )}
    </SubscriberThemeProvider>
  );
}
