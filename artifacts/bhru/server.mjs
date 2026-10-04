// Production static server only. No business API, auth, database, or Replit runtime.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'dist/public');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

// Fail at startup rather than reporting a healthy container with no build.
await stat(resolve(root, 'index.html'));

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

function reply(req, res, code, message, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(message),
    'Cache-Control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : message);
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    reply(req, res, 405, 'Method not allowed');
    return;
  }

  try {
    // Fixed parsing origin: forwarded Host/protocol are not trusted or needed.
    const pathname = decodeURIComponent(new URL(req.url, 'http://app.invalid').pathname);
    if (pathname.includes('\0') || pathname.includes('\\') ||
        pathname.split('/').some((part) => part.startsWith('.'))) {
      reply(req, res, 400, 'Invalid path');
      return;
    }
    if (pathname === '/healthz') {
      reply(req, res, 200, '{"status":"ok"}', 'application/json; charset=utf-8');
      return;
    }

    let file = resolve(root, `.${pathname}`);
    if (file !== root && !file.startsWith(root + sep)) {
      reply(req, res, 403, 'Forbidden');
      return;
    }
    let details;
    try {
      details = await stat(file);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }

    if (!details?.isFile()) {
      // Browser history routes must survive refresh. Missing assets/API calls
      // must return 404, never HTML disguised as JavaScript or an API response.
      const wantsHtml = !req.headers.accept ||
        req.headers.accept.includes('text/html') || req.headers.accept.includes('*/*');
      if (pathname.startsWith('/assets/') || pathname === '/api' ||
          pathname.startsWith('/api/') || extname(pathname) || !wantsHtml) {
        reply(req, res, 404, 'Not found');
        return;
      }
      file = resolve(root, 'index.html');
      details = await stat(file);
    }

    const hashedAsset = file.startsWith(resolve(root, 'assets') + sep);
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(file)] || 'application/octet-stream',
      'Content-Length': details.size,
      'Cache-Control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    if (error instanceof URIError || error.code === 'ERR_INVALID_URL') {
      reply(req, res, 400, 'Invalid URL');
    } else {
      process.stderr.write('Static file request failed.\n');
      if (!res.headersSent) reply(req, res, 500, 'Internal server error');
      else res.destroy();
    }
  }
});

server.requestTimeout = 30_000;
server.headersTimeout = 35_000;
server.on('error', (error) => {
  process.stderr.write(`Production server failed: ${error.code || 'unknown error'}\n`);
  process.exit(1);
});
server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`BHRU static server listening on 0.0.0.0:${port}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}