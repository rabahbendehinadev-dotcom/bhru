import type { Plugin } from 'vite';

// Development-only bridge through the managed shared proxy. The backend owns
// all slug validation, reserved/private-route decisions, eligibility and HTML.
// Production serves the same document directly from Express.
export function publicSitePreview(): Plugin {
  return {
    name: 'bhru-public-site-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!['GET', 'HEAD'].includes(req.method || '')) { next(); return; }
        const path = (req.url || '/').split('?')[0]!;
        const root = path.slice(1).split('/')[0]!.toLowerCase();
        const privateRoot = process.env.PLATFORM_ADMIN_PATH?.toLowerCase();
        // Vite internals/assets must never wait for a database or API request.
        if (path === '/' || (privateRoot && root === privateRoot) ||
            /^\/(?:api|src|assets|brand|pwa|node_modules|login|register|dashboard|settings|m|healthz|admin|\.well-known)(?:\/|$)/i.test(path) ||
            path.startsWith('/@') || /^\/(?:index\.html|robots\.txt|manifest\.webmanifest|sw\.js|favicon\.ico|sitemap\.xml)$/i.test(path)) {
          next(); return;
        }
        try {
          const url = new URL('http://localhost:80/api/public/site-document');
          url.searchParams.set('path', path);
          // No visitor cookies, authorization, session headers or tenant IDs.
          const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000) });
          if (response.status === 204) { next(); return; }
          if (![200, 404, 503].includes(response.status) ||
              !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) {
            throw new Error('Public resolver unavailable');
          }
          const html = await response.text();
          for (const header of ['content-type', 'cache-control', 'content-security-policy', 'x-robots-tag',
            'x-content-type-options', 'referrer-policy', 'retry-after']) {
            const value = response.headers.get(header);
            if (value) res.setHeader(header, value);
          }
          res.statusCode = response.status;
          res.end(req.method === 'HEAD' ? undefined : html);
        } catch {
          res.statusCode = 503;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('X-Robots-Tag', 'noindex, nofollow');
          res.setHeader('Retry-After', '60');
          res.end(req.method === 'HEAD' ? undefined
            : '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Website temporarily unavailable</title></head><body><h1>Website temporarily unavailable</h1><p>Please try again later.</p></body></html>');
        }
      });
    },
  };
}
