export const escapeHTML = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

/** Current homepage links are local sections, never panel/customer auth routes. */
export function safePublicHref(href: string): string {
  return /^#[a-z][a-z0-9-]*$/.exec(href)?.[0] === href ? href : '#home';
}

export function safePublicImage(image: string | null): string | null {
  if (!image) return null;
  if (/^\/api\/public\/media\/[a-f0-9-]{36}\.(png|jpg)(?:\?preview=\d{10}\.[a-f0-9]{64})?$/.exec(image)?.[0] === image) return image;
  if (/^\/(?:assets|brand)\/[a-zA-Z0-9/_\-.]+$/.exec(image)?.[0] === image && !image.includes('..')) return image;
  try {
    const url = new URL(image);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function safePublicColor(color: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.exec(color)?.[0] === color ? color : fallback;
}

/** Presentation links: local anchors, https (no credentials), mailto/tel. Never JS/data/protocol-relative/owner paths. */
export function safePublicLink(href: string | undefined | null, fallback = '#home'): string {
  if (!href) return fallback;
  if (/^#[a-z][a-z0-9-]*$/.test(href)) return href;
  if (/^mailto:[^\s<>"'?#]+@[^\s<>"'?#]+$/i.test(href)) return href;
  if (/^tel:\+?[0-9()\-. ]{3,30}$/i.test(href)) return href;
  try {
    if (!/^https:\/\//i.test(href)) return fallback;
    const u = new URL(href);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : fallback;
  } catch { return fallback; }
}
export const isExternalLink = (href: string) => /^https:/i.test(href);
