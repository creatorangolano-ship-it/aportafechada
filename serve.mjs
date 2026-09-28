// Servidor estático local, só para desenvolvimento. Replica os headers do netlify.toml para
// que o comportamento em localhost seja igual ao de produção. Executar: node serve.mjs [porta]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const root = process.cwd();
const port = Number(process.argv[2]) || 8888;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
};

const HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
  // O código nunca é cacheado durante o desenvolvimento: cada reload tem de apanhar as edições.
  'Cache-Control': 'no-store',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    // Impede ../ fora da raiz.
    const file = join(root, normalize(path).replace(/^([/\\])+/, ''));
    if (!file.startsWith(root)) { res.writeHead(403).end('403'); return; }

    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) { res.writeHead(404, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — não encontrado'); return; }

    const body = await readFile(file);
    res.writeHead(200, {
      ...HEADERS,
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
    }).end(body);
  } catch (e) {
    res.writeHead(500, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('500 — ' + e.message);
  }
}).listen(port, () => console.log(`A Porta Fechada em http://localhost:${port}`));
