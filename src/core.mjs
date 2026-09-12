import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';

export const VERSION = '1.1.0';
export const stateRoot = () => resolve(process.env.LOCAL_DEV_STATE || `${homedir()}/.local/state/local-dev`);
export const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 10);
export const label = value => typeof value === 'string' && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value);
export function assert(ok, message) { if (!ok) throw new Error(message); }
export async function json(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
export async function atomic(file, data) {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, data, { mode: 0o600 });
  await rename(temp, file);
}
export async function lock(root, fn) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const path = resolve(root, 'registry.lock');
  const until = Date.now() + 15000;
  for (;;) {
    try { await mkdir(path, { mode: 0o700 }); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      assert(Date.now() < until, `Registry lock busy: ${path}. See doctor/lock recovery; no stale PID is killed.`);
      await new Promise(r => setTimeout(r, 25));
    }
  }
  try { await writeFile(resolve(path, 'owner.json'), JSON.stringify({ pid: process.pid, created: new Date().toISOString() })); return await fn(); }
  finally { await rm(path, { recursive: true, force: true }); }
}
export function gitIdentity(path) {
  const git = (...args) => { try { return execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
  return { path, branch: git('branch', '--show-current') || '(detached/non-git)', commit: git('rev-parse', 'HEAD'), dirty: !!git('status', '--porcelain') };
}
export async function available(port) {
  await new Promise((ok, fail) => {
    const s = createServer();
    s.once('error', () => fail(new Error(`Loopback port ${port} unavailable; no existing process was stopped.`)));
    s.listen(port, '127.0.0.1', () => s.close(ok));
  });
}
export const envKey = key => /^[A-Z][A-Z0-9_]*$/.test(key);
export function secretRefs(refs = {}, vault = 'example-local') {
  for (const [key, value] of Object.entries(refs)) {
    assert(envKey(key) && !key.startsWith('NEXT_PUBLIC_') && !key.startsWith('VITE_'), 'Invalid/private secret key required');
    assert(typeof value === 'string' && value.startsWith(`op://${vault}/`) && value.split('/').length >= 5 && !/[\r\n]/.test(value), `Invalid ${key} reference or vault`);
  }
  return refs;
}
export async function manifest(file, host, profile = 'visual') {
  const m = await json(file);
  assert(m.version === 1 && label(m.project) && label(m.name), 'Manifest requires version 1 and DNS-safe project/name');
  assert(['visual', 'integration', 'simulator-source'].includes(profile), 'Unknown profile');
  assert(Array.isArray(m.services) && m.services.length > 0, 'Manifest requires services');
  assert(label(host.namespace) && host.domain.endsWith('.test') && host.domain.split('.').every(label), 'Invalid host namespace/domain');
  assert(!m.cookiePrefix || label(m.cookiePrefix), 'Invalid cookie prefix');
  const originPath = await realpath(dirname(file));
  const id = `${m.name.slice(0, 25)}-${hash(`${m.project}:${originPath}`)}`;
  const domain = `${id}.${host.domain}`;
  const names = new Set(); const hosts = new Set(); const ports = new Set();
  const services = [];
  for (const s of m.services) {
    assert(label(s.name) && !names.has(s.name), 'Invalid/duplicate service name'); names.add(s.name);
    assert(['marketing', 'app', 'simulator', 'static', 'command'].includes(s.adapter), `Unknown adapter: ${s.name}`);
    assert(!s.publicDir || (typeof s.publicDir === 'string' && !s.publicDir.startsWith('/') && !s.publicDir.split(/[\\/]/).includes('..')), 'publicDir must remain inside the selected worktree');
    assert(typeof s.path === 'string' && s.path.length > 0, `Explicit worktree path required: ${s.name}`);
    const path = await realpath(resolve(originPath, s.path));
    assert(s.host === '' || label(s.host), `Invalid service hostname: ${s.name}`);
    assert(Number.isInteger(s.port) && s.port >= 1024 && s.port <= 65530 && !ports.has(s.port), `Invalid/duplicate port: ${s.name}`); ports.add(s.port);
    assert(!s.profiles || s.profiles.every(p => ['visual','integration','simulator-source'].includes(p)), 'Invalid profiles');
    assert(!s.readiness || (typeof s.readiness === 'string' && /^\/(?!\/)/.test(s.readiness) && !/[\r\n]/.test(s.readiness)), 'Readiness must be a local path');
    secretRefs(s.secrets, m.secretVault || 'example-local');
    assert(!Object.keys(s.secrets || {}).some(k => ['DATABASE_URL','REDIS_URL','AUTH_SECRET','AUTH_COOKIE_NAME','COOKIE_DOMAIN','AUTH_URL','HOST','PORT','ADMIN_HOST','ADMIN_PORT'].includes(k)), 'Stack-derived values cannot be secret references');
    const env = s.env || {};
    for (const [key, value] of Object.entries(env)) {
      assert(envKey(key) && typeof value === 'string' && !/(SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL|REDIS_URL)/.test(key), `Use secret references/derived addresses, not config: ${key}`);
    }
    for (const [target,source] of Object.entries(s.envAliases || {})) {
      assert(envKey(target) && envKey(source) && !['DATABASE_URL','REDIS_URL','HOST','PORT','AUTH_SECRET','AUTH_COOKIE_NAME','COOKIE_DOMAIN'].includes(target), 'Invalid environment alias');
      assert(!/^(NEXT_PUBLIC_|VITE_)/.test(target) || /^(NEXT_PUBLIC_|VITE_|LOCAL_DEV_ORIGIN$)/.test(source), 'Private value cannot be aliased to a public build input');
    }
    if (s.adapter === 'command') assert(Array.isArray(s.command) && s.command.length > 0 && s.command.every(x => typeof x === 'string' && !x.includes('\0')), 'command must be an argv array');
    if (s.profiles && !s.profiles.includes(profile)) continue;
    const hostname = s.host ? `${s.host}.${domain}` : domain;
    if (s.adapter !== 'simulator') { assert(!hosts.has(hostname), 'Duplicate public hostname'); hosts.add(hostname); }
    services.push({ ...s, readiness:profile==='integration' && s.adapter==='app' ? '/healthz' : s.readiness, path, hostname, origin: `https://${hostname}:${host.httpsPort || 8443}`, env });
  }
  const ordered = []; const pending = [...services];
  while (pending.length) {
    const index = pending.findIndex(s => (s.dependsOn || []).every(d => ordered.some(o => o.name === d)));
    assert(index >= 0, 'Dependency cycle or dependency excluded from profile'); ordered.push(...pending.splice(index, 1));
  }
  const extraPorts = [m.databasePort, m.redisPort, ...services.filter(s => s.adapter === 'app' && profile === 'integration').map(s => s.port + 1)].filter(x => x !== undefined);
  for (const p of extraPorts) { assert(Number.isInteger(p) && p >= 1024 && p <= 65535 && !ports.has(p), 'Invalid/conflicting auxiliary port'); ports.add(p); }
  if (profile === 'integration') assert(m.databasePort && m.redisPort, 'Integration requires explicit databasePort and redisPort');
  assert(!m.secretVault || /(?:^local-development$|-local$)/.test(m.secretVault), 'Integration vault must be explicitly local');
  assert(!m.route || (/^\/(?!\/)/.test(m.route) && !/[\r\n]/.test(m.route)), 'route must be a local path');
  return { ...m, id, domain, profile, file: resolve(file), services: ordered, ports: [...ports], originPath };
}
