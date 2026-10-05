import { Moon, Sun } from 'lucide-react';
import { useSubscriberTheme } from './theme';

export function ThemeToggle() {
  const { theme, toggle } = useSubscriberTheme();
  const dark = theme === 'dark';
  return (
    <button type="button" role="switch" aria-checked={dark} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle} data-testid="button-theme-toggle"
      className="relative flex h-11 w-[58px] shrink-0 items-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--surface-secondary))] px-1.5 text-[hsl(var(--text-secondary))] focus-visible:outline-2 focus-visible:outline-[hsl(var(--brand))] lg:h-8">
      <Sun size={14} className="relative z-10" style={{ color: dark ? undefined : '#fff' }} />
      <Moon size={14} className="relative z-10 ml-auto" style={{ color: dark ? '#fff' : undefined }} />
      <span aria-hidden className="absolute left-0.5 top-[9px] h-6 w-6 rounded-full bg-[hsl(var(--brand))] transition-transform duration-150 lg:top-0.5" style={{ transform: `translateX(${dark ? 26 : 0}px)` }} />
    </button>
  );
}
