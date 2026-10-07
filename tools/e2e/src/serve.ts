/**
 * Minimal static server for the production build, with the app's SPA fallback. `base` serves
 * the app under a sub-path (as on GitHub Pages); everything outside it is a 404.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml',
};

export function serve(root: string, base = '/'): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    const requested = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (!requested.startsWith(base)) {
      res.writeHead(404).end();
      return;
    }
    const path = normalize('/' + requested.slice(base.length)).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as { port: number };
    resolve({ url: `http://127.0.0.1:${port}${base}`, server });
  }));
}
