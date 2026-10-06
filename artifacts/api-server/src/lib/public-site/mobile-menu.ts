import { createHash } from 'node:crypto';

/** Presentation only: no requests, storage, sessions or subscriber data. */
export const PUBLIC_MENU_SCRIPT = String.raw`(() => {
  const menu = document.querySelector('details.menu');
  const backdrop = document.querySelector('.mobile-menu-backdrop');
  if (!menu || !backdrop) return;
  const summary = menu.querySelector('summary');
  const mobile = window.matchMedia('(max-width: 959px)');
  const root = document.documentElement;
  const body = document.body;
  let locked = false;
  let savedY = 0;
  let openingY = null;
  let savedStyle = null;
  let blocked = [];
  const restoreScroll = () => {
    const behavior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, savedY);
    root.style.scrollBehavior = behavior;
  };
  const release = (returnFocus) => {
    if (!locked) return;
    locked = false;
    backdrop.hidden = true;
    root.classList.remove('public-menu-open');
    if (savedStyle === null) body.removeAttribute('style');
    else body.setAttribute('style', savedStyle);
    blocked.forEach(([element, wasInert]) => { element.inert = wasInert; });
    blocked = [];
    menu.removeAttribute('role');
    menu.removeAttribute('aria-modal');
    summary.setAttribute('aria-expanded', 'false');
    summary.setAttribute('aria-label', 'Open mobile menu');
    restoreScroll();
    if (returnFocus && mobile.matches) summary.focus({ preventScroll: true });
  };
  const close = (returnFocus = true) => {
    menu.open = false;
    release(returnFocus);
    openingY = null;
  };
  // Native details focus/reflow can run before its asynchronous toggle event.
  // Capture the viewport before the browser performs the activation.
  summary.addEventListener('pointerdown', () => {
    if (mobile.matches && !menu.open) openingY = window.scrollY;
  });
  summary.addEventListener('keydown', event => {
    if (mobile.matches && !menu.open && (event.key === 'Enter' || event.key === ' ')) openingY = window.scrollY;
  });
  const sync = () => {
    if (!mobile.matches || !menu.open) { release(true); return; }
    if (locked) return;
    savedY = openingY === null ? window.scrollY : openingY;
    openingY = null;
    savedStyle = body.getAttribute('style');
    locked = true;
    body.style.position = 'fixed';
    body.style.top = '-' + savedY + 'px';
    body.style.left = '0';
    body.style.right = '0';
    root.classList.add('public-menu-open');
    backdrop.hidden = false;
    blocked = Array.from(document.querySelectorAll('body > main, body > footer, .site-header .brand, .nav-desktop, .site-header .login'))
      .map(element => [element, element.inert]);
    blocked.forEach(([element]) => { element.inert = true; });
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    summary.setAttribute('aria-expanded', 'true');
    summary.setAttribute('aria-label', 'Close mobile menu');
    menu.querySelector('.menu-panel a').focus({ preventScroll: true });
  };
  menu.addEventListener('toggle', sync);
  backdrop.addEventListener('click', () => close());
  menu.querySelector('.menu-panel').addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    const id = link.getAttribute('href').slice(1);
    close(false);
    const target = document.getElementById(id);
    if (target) {
      const previous = target.getAttribute('tabindex');
      target.setAttribute('tabindex', '-1');
      target.addEventListener('blur', () => {
        if (previous === null) target.removeAttribute('tabindex');
        else target.setAttribute('tabindex', previous);
      }, { once: true });
      requestAnimationFrame(() => target.focus({ preventScroll: true }));
    }
  });
  document.addEventListener('keydown', event => {
    if (!locked) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const controls = [summary, ...menu.querySelectorAll('.menu-panel a[href]')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !menu.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !menu.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
  document.addEventListener('focusin', event => {
    if (locked && !menu.contains(event.target)) summary.focus({ preventScroll: true });
  });
  document.addEventListener('touchmove', event => {
    if (locked && !menu.querySelector('.menu-panel').contains(event.target)) event.preventDefault();
  }, { passive: false });
  mobile.addEventListener('change', () => { if (!mobile.matches) close(false); });
  summary.setAttribute('aria-expanded', 'false');
  sync();
})();`;

// Exact byte hash: no unsafe-inline/eval, no arbitrary or subscriber-supplied JS.
export const PUBLIC_MENU_SCRIPT_HASH = createHash('sha256').update(PUBLIC_MENU_SCRIPT).digest('base64');
