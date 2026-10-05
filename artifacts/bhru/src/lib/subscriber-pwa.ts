type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
export type InstallMode = 'native' | 'ios' | 'ios-browser' | null;
export interface InstallState { mode: InstallMode; installed: boolean }
const listeners = new Set<() => void>();
let deferred: InstallPrompt | null = null;
let registered = false;
let installedThisSession = false;
let state: InstallState = { mode: null, installed: false };
const base = import.meta.env.BASE_URL;

export function isSubscriberLocation() {
  const prefix = base.replace(/\/$/, '');
  const path = window.location.pathname.slice(prefix.length) || '/';
  return ['/', '/dashboard', '/login', '/register', '/settings'].includes(path) || path.startsWith('/m/');
}
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function iosMode(): InstallMode {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios) return null;
  const safari = /Safari/.test(navigator.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV|Line\/|Replit/i.test(navigator.userAgent);
  return safari ? 'ios' : 'ios-browser';
}
function publish() {
  const installed = isStandalone() || installedThisSession;
  state = { installed, mode: installed ? null : deferred ? 'native' : iosMode() };
  listeners.forEach(fn => fn());
}
export const subscribeInstall = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getInstallState = () => state;
export async function promptInstall() {
  const prompt = deferred;
  if (!prompt) return null;
  deferred = null;
  publish();
  await prompt.prompt();
  const choice = await prompt.userChoice;
  if (choice.outcome === 'accepted') installedThisSession = true;
  publish();
  return choice.outcome;
}

const metaDefaults: Record<string, string> = {
  'theme-color': '#f5f7fc',
  'mobile-web-app-capable': 'yes',
  'apple-mobile-web-app-capable': 'yes',
  'apple-mobile-web-app-title': 'BHRU',
  'apple-mobile-web-app-status-bar-style': 'default',
};
function metadata() {
  const enabled = isSubscriberLocation();
  document.querySelectorAll('[data-subscriber-pwa]').forEach(node => {
    if (!enabled) node.remove();
  });
  if (!enabled) return;
  for (const [name, content] of Object.entries(metaDefaults)) {
    if (!document.querySelector(`meta[name="${name}"][data-subscriber-pwa]`)) {
      const node = document.createElement('meta');
      node.name = name; node.content = content; node.dataset.subscriberPwa = '';
      document.head.append(node);
    }
  }
  if (!document.querySelector('link[rel="manifest"][data-subscriber-pwa]')) {
    const link = document.createElement('link');
    link.rel = 'manifest'; link.href = `${base}manifest.webmanifest`; link.dataset.subscriberPwa = '';
    document.head.append(link);
  }
  if ('serviceWorker' in navigator && !registered) {
    registered = true;
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: 'none' }).catch(error => {
      registered = false;
      console.error('BHRU offline support could not start:', error);
    });
  }
}
export function updatePwaTheme(theme: 'light' | 'dark') {
  if (!isSubscriberLocation()) return;
  try { localStorage.setItem('bhru:pwa-theme', theme); } catch { /* Only the public offline page uses this visual preference. */ }
  const color = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-subscriber-pwa]');
  if (color) color.content = theme === 'dark' ? '#090e19' : '#f5f7fc';
  const status = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"][data-subscriber-pwa]');
  if (status) status.content = theme === 'dark' ? 'black-translucent' : 'default';
}
export function initializeSubscriberPwa() {
  window.addEventListener('beforeinstallprompt', event => {
    if (!isSubscriberLocation() || isStandalone() || iosMode() !== null) return;
    event.preventDefault();
    deferred = event as InstallPrompt;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    installedThisSession = true; deferred = null; publish();
  });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', publish);
  for (const event of ['popstate', 'pushState', 'replaceState']) window.addEventListener(event, metadata);
  metadata();
  publish();
}