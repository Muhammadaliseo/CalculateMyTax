// Dev-only brand asset studio. Serves the project folder and accepts the images drawn by
// build/asset-studio.html, writing them into assets/img/brand/. Nothing here ships with the site.
// Usage: node build/asset-studio.mjs   then open http://localhost:4178/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4178;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');

  if (request.method === 'POST' && url.pathname === '/save') {
    const target = url.searchParams.get('path') || '';
    if (!/^assets\/img\/(brand|guides)\/[a-z0-9-]+\.(png|webp|jpg)$/.test(target)) {
      response.writeHead(400).end('Only PNG, WebP or JPEG files in assets/img/brand/ or assets/img/guides/ can be saved.');
      return;
    }
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const file = path.join(ROOT, target);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.concat(chunks));
      response.writeHead(200).end('Saved');
    });
    return;
  }

  const pathname = url.pathname === '/' ? '/build/asset-studio.html' : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
}).listen(PORT, () => {
  console.log(`Asset studio running at http://localhost:${PORT}/`);
});
