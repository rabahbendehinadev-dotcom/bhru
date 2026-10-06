export const escapeHTML = (value: string) => value.replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

/** Current homepage links are local sections, never panel/customer auth routes. */
export function safePublicHref(href: string): string {
  return /^#[a-z][a-z0-9-]*$/.exec(href)?.[0] === href ? href : '#home';
}

export function safePublicImage(image: string | null): string | null {
  if (!image) return null;
  if (/^\/(?:assets|brand)\/[a-zA-Z0-9/_\-.]+$/.exec(image)?.[0] === image && !image.includes('..')) return image;
  try {
    const url = new URL(image);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function safePublicColor(color: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.exec(color)?.[0] === color ? color : fallback;
}
