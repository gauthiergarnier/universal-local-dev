// Uncached, allowlisted visual reference assets,
// realpath containment. Branches without pins.html get a useful asset index.
import { createServer } from 'node:http';
import { realpath, stat, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, relative, extname, sep } from 'node:path';
const [path, port, mode] = process.argv.slice(2);
const root = await realpath(path);
const mime = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json', '.png':'image/png', '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2', '.glb':'model/gltf-binary' };
const escape = s => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (pathname === '/') pathname = mode === 'pins' ? '/pins.html' : '/index.html';
  if (mode === 'pins' && !['/pins.html','/pin.html','/favicon.svg'].includes(pathname) && !pathname.startsWith('/styles/') && !pathname.startsWith('/icons/')) { res.writeHead(404); return res.end(); }
  try {
    const file = await realpath(resolve(root, `.${pathname}`)); const rel = relative(root, file);
    if (rel === '..' || rel.startsWith(`..${sep}`) || !mime[extname(file)] || !(await stat(file)).isFile()) throw Error();
    res.setHeader('Content-Type', mime[extname(file)]);
    if (req.method === 'HEAD') res.end(); else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch {
    if (mode === 'pins' && pathname === '/pins.html') {
      const entries = await readdir(resolve(root, 'icons')).catch(() => []);
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.end(`<!doctype html><html><title>Local asset reference</title><h1>Local asset reference</h1><p>This branch has no pins.html. Public icon assets:</p>${entries.filter(n => /\.(svg|png)$/.test(n)).map(n => `<figure><img width="64" src="/icons/${encodeURIComponent(n)}"><figcaption>${escape(n)}</figcaption></figure>`).join('')}</html>`);
    }
    res.writeHead(404); res.end('Not found');
  }
}).listen(Number(port), '127.0.0.1');
