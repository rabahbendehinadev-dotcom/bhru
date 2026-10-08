import type { Plugin } from 'vite';
import { request as httpRequest } from 'node:http';

/** Preserve original Host: Node fetch silently discards a Host override. */
function publicDocument(url: URL, headers: Record<string, string>) {
  return new Promise<{ status: number; headers: Headers; text: string }>((ok, fail) => {
    const request = httpRequest(url, { headers }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('error', fail);
      response.on('end', () => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) responseHeaders.append(key, item);
        }
        ok({ status: response.statusCode || 503, headers: responseHeaders, text: Buffer.concat(chunks).toString('utf8') });
      });
    });
    request.setTimeout(12000, () => request.destroy(new Error('Public resolver timed out')));
    request.on('error', fail);
    request.end();
  });
}

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
          // Forward ONLY tenant-scoped public customer cookies and original Host.
          // Never forward subscriber/admin cookies, authorization or tenant headers.
          const customerCookies = (req.headers.cookie || '').split(';').map(value => value.trim())
            .filter(value => /^bhru_customer_[a-z0-9-]+=[a-f0-9]{64}\.[a-f0-9]{64}$/.test(value)).join('; ');
          const headers: Record<string, string> = {};
          if (req.headers.host) headers.Host = req.headers.host;
          if (customerCookies) headers.Cookie = customerCookies;
          const response = await publicDocument(url, headers);
          if (response.status === 204) { next(); return; }
          if ([302, 303].includes(response.status)) {
            const location = response.headers.get('location');
            if (!location || !/^\/(?!\/)/.test(location)) throw new Error('Unsafe customer redirect');
            res.statusCode = response.status;
            res.setHeader('Location', location);
            res.setHeader('Cache-Control', 'no-store');
            res.end(); return;
          }
          if (![200, 404, 503].includes(response.status) ||
              !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')) {
            throw new Error('Public resolver unavailable');
          }
          const html = response.text;
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
