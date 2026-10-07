import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { Bell, LogOut, Menu, Search } from 'lucide-react';
import { logout, useStore, errorMessage } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { useAdminPath } from '@/lib/admin-entry';
import { titleForLocation } from './nav-catalog';
import { ThemeToggle } from './ThemeToggle';
import { PanelCurrencySelector } from './PanelCurrencySelector';
import { EmptyState } from './EmptyState';
import { InstallOption } from './PwaInstall';
import { usePopover } from './popover';

const initialsOf = (n: string) => n.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

interface Props { owner: string; onOpenMenu: () => void; onOpenSearch: () => void; menuOpen: boolean; menuBtnRef: React.RefObject<HTMLButtonElement | null> }

export function MobileHeader({ owner, onOpenMenu, onOpenSearch, menuOpen, menuBtnRef }: Props) {
  const st = useStore();
  const adminPath = useAdminPath();
  const [loc, nav] = useLocation();
  const { toast } = useToast();
  const bell = usePopover();
  const acct = usePopover();
  const title = useMemo(() => titleForLocation(loc), [loc]);
  const role = st.session.role === 'admin' ? 'Administrator' : 'Owner';
  const signOut = async () => {
    try { await logout(); nav(st.session.role === 'admin' ? adminPath : '/login'); }
    catch (e) { toast({ title: 'Sign out failed', description: errorMessage(e), variant: 'destructive' }); }
  };
  return (
    <header className="sl-mhead lg:hidden" data-testid="mobile-header">
      <img src={`${import.meta.env.BASE_URL}brand/bhru-icon.png`} alt="" width={28} height={28} className="shrink-0 rounded-md object-contain" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[15px] font-extrabold tracking-tight">BHRU</div>
        {title && <div className="truncate text-[11px] text-[hsl(var(--text-secondary))]" data-testid="text-mobile-title">{title}</div>}
      </div>
      <div className="relative" ref={bell.ref}>
        <button className="sl-icon-btn sl-touch" aria-label="Notifications" aria-expanded={bell.open} onClick={() => { acct.setOpen(false); bell.setOpen((o) => !o); }} data-testid="button-notifications-mobile"><Bell size={18} /></button>
        {bell.open && (
          <div className="sl-pop sl-mpop">
            <EmptyState compact icon={<Bell size={18} />} title="No notifications" description="Alerts will appear here once business modules are enabled." />
          </div>
        )}
      </div>
      <div className="relative" ref={acct.ref}>
        <button type="button" className="sl-touch sl-avatar-btn" aria-label="Account menu" aria-expanded={acct.open} onClick={() => { bell.setOpen(false); acct.setOpen((o) => !o); }} data-testid="button-account-menu">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[hsl(var(--brand))] text-[12px] font-bold text-white" data-testid="img-avatar-mobile">{initialsOf(owner)}</span>
        </button>
        {acct.open && (
          <div className="sl-pop sl-mpop p-2" role="menu">
            <div className="px-3 pb-2 pt-1">
              <div className="truncate text-[14px] font-semibold" data-testid="text-owner-name-mobile">{owner}</div>
              <div className="text-[12px] text-[hsl(var(--text-secondary))]">{role}</div>
            </div>
            <div className="my-1 border-t border-[hsl(var(--border))]" />
            <button type="button" className="sl-mrow" onClick={() => { acct.setOpen(false); onOpenSearch(); }} data-testid="button-search-mobile"><Search size={18} />Search pages</button>
            <div className="sl-mrow justify-between"><PanelCurrencySelector className="w-full justify-between text-[14px]" /></div>
            <div className="sl-mrow justify-between"><span>Theme</span><ThemeToggle /></div>
            <InstallOption />
            <div className="my-1 border-t border-[hsl(var(--border))]" />
            <button type="button" className="sl-mrow" onClick={signOut} data-testid="button-signout-mobile"><LogOut size={18} />Sign out</button>
          </div>
        )}
      </div>
      <button ref={menuBtnRef} className="sl-icon-btn sl-touch" onClick={onOpenMenu} aria-label="Open menu" aria-expanded={menuOpen} data-testid="button-menu-mobile"><Menu size={20} /></button>
    </header>
  );
}
