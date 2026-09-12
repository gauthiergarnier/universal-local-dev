import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { assert } from './core.mjs';
export const src = dirname(fileURLToPath(import.meta.url));
export function binary(path, pkg, file) {
  const require = createRequire(resolve(path, 'package.json'));
  try { return resolve(dirname(require.resolve(`${pkg}/package.json`)), file); }
  catch { throw new Error(`Install ${pkg} dependencies once in ${path}`); }
}
export function command(stack, s) {
  if (s.adapter === 'marketing') return [process.execPath, binary(s.path, 'next', 'dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(s.port)];
  if (s.adapter === 'app' && stack.profile === 'integration') return [process.execPath, '--watch', 'server.js'];
  if (s.adapter === 'app' || s.adapter === 'static') return [process.execPath, resolve(src, 'static.mjs'), resolve(s.path, s.publicDir || 'public'), String(s.port), s.adapter === 'app' ? 'pins' : 'all'];
  if (s.adapter === 'simulator') return [process.execPath, binary(s.path, 'vite', 'bin/vite.js'), '--host', '127.0.0.1', '--port', String(s.port), '--strictPort', '--base', '/simulator/'];
  return s.command.map(x => x.replaceAll('{port}', String(s.port)).replaceAll('{host}', '127.0.0.1').replaceAll('{origin}', s.origin));
}
export async function parity(stack) {
  if (!stack.parity?.length) return 'No asset parity checks configured';
  assert(Array.isArray(stack.parity) && stack.parity.length >= 2, 'Parity requires two or more project asset references');
  const paths = stack.parity.map(item => {
    const service=stack.services.find(s=>s.name===item.service);
    assert(service && typeof item.path==='string', 'Unknown parity service/path');
    const path=resolve(service.path,item.path);
    assert(path.startsWith(service.path+'/'), 'Parity asset must remain inside its worktree');
    return path;
  });
  const values=await Promise.all(paths.map(p=>readFile(p,'utf8')));
  assert(values.every(value=>JSON.stringify(JSON.parse(value))===JSON.stringify(JSON.parse(values[0]))), 'Project asset manifests differ');
  return 'Project asset parity passed';
}
