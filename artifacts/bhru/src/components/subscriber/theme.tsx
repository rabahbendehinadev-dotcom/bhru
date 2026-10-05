import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type SubTheme = 'light' | 'dark';
const keyFor = (id: string) => `bhru:subscriber-theme:${id}`;

function read(id: string): SubTheme {
  try { return window.localStorage.getItem(keyFor(id)) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
function write(id: string, t: SubTheme) {
  try { window.localStorage.setItem(keyFor(id), t); } catch { /* storage unavailable: theme still applies for this session */ }
}

interface Ctx { theme: SubTheme; setTheme: (t: SubTheme) => void; toggle: () => void }
const ThemeCtx = createContext<Ctx>({ theme: 'light', setTheme: () => {}, toggle: () => {} });

export function SubscriberThemeProvider({ subscriberId, children }: { subscriberId: string; children: (theme: SubTheme) => ReactNode }) {
  // Lazy init reads storage synchronously, so first paint already uses the saved theme. Default is light (OS preference ignored).
  const [st, setSt] = useState(() => ({ id: subscriberId, theme: read(subscriberId) }));
  const theme = st.id === subscriberId ? st.theme : read(subscriberId);
  const setTheme = useCallback((t: SubTheme) => { write(subscriberId, t); setSt({ id: subscriberId, theme: t }); }, [subscriberId]);
  const toggle = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);
  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle]);
  return <ThemeCtx.Provider value={value}>{children(theme)}</ThemeCtx.Provider>;
}

export const useSubscriberTheme = () => useContext(ThemeCtx);
