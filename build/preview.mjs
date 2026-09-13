// Dev-only preview server for the built site in docs/. Mirrors GitHub Pages: folder addresses serve
// index.html, addresses without a trailing slash redirect to one, and anything missing gets 404.html.
// Usage: npm run preview   then open http://localhost:8080/

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

http.createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let file = path.normalize(path.join(OUT, urlPath));
  if (!file.startsWith(OUT)) {
    response.writeHead(403).end();
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!urlPath.endsWith('/')) {
      response.writeHead(301, { Location: `${urlPath}/` }).end();
      return;
    }
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file)) {
    response.writeHead(404, { 'Content-Type': TYPES['.html'] });
    response.end(fs.readFileSync(path.join(OUT, '404.html')));
    return;
  }
  response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
}).listen(PORT, () => {
  console.log(`Previewing docs/ at http://localhost:${PORT}/`);
});
