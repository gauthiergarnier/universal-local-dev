import { resolve } from 'node:path';
import { networkInterfaces, hostname } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { request } from 'node:http';
import { isIPv4 } from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import { atomic, json, assert, hash, label, lock } from './core.mjs';

export async function setupHost(root, options = {}) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  return lock(root, async () => {
    const prior = await json(resolve(root, 'host.json'), null);
    if (prior) return prior;
    const namespace = options.namespace || `${hostname().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 24)}-${hash(hostname())}`;
    assert(label(namespace), 'Invalid namespace');
    const ip = options.tailnetIP || null;
    assert(!ip || (isIPv4(ip) && /^100\.(?:[6-9]\d|1[01]\d|12[0-7])\.(?:\d{1,3})\.(?:\d{1,3})$/.test(ip)), 'Expected Tailscale IPv4 in 100.64.0.0/10');
    const httpsPort=Number(options.httpsPort || 8443);
    assert(Number.isInteger(httpsPort) && httpsPort>=1024 && httpsPort<=65535,'Use an unprivileged HTTPS port (default 8443)');
    const baseDomain=options.domain || 'dev.test';
    assert(baseDomain.endsWith('.test') && baseDomain.split('.').every(label),'Development base domain must end in .test');
    const h = { version: 1, namespace, domain: `${namespace}.${baseDomain}`, tailnetIP: ip, httpsPort, bind: ['127.0.0.1', ...(ip ? [ip] : [])], root, admin: resolve(root, 'caddy.sock') };
    assert(h.admin.length < 100, 'State path too long for Unix sockets; choose a shorter LOCAL_DEV_STATE');
    await atomic(resolve(root, 'host.json'), JSON.stringify(h, null, 2));
    await atomic(resolve(root, 'Caddyfile'), caddyfile(h, { stacks: {} }));
    // Deliberately no upstream resolver: this answers ONLY the private namespace.
    const dns = ['port=53','bind-interfaces',`listen-address=${h.bind.join(',')}`,'no-resolv','no-hosts','domain-needed','bogus-priv',`local=/${h.domain}/`,`address=/${h.domain}/${ip || '127.0.0.1'}`,''].join('\n');
    await atomic(resolve(root, 'dnsmasq.conf'), dns);
    await atomic(resolve(root, 'resolver'), 'nameserver 127.0.0.1\n');
    return h;
  });
}
export function caddyfile(host, registry) {
  const blocks = [`{\n admin unix/${host.admin}\n auto_https disable_redirects\n skip_install_trust\n storage file_system {\n  root ${JSON.stringify(resolve(host.root, 'ca'))}\n }\n servers {\n  protocols h1 h2\n }\n}`];
  for (const stack of Object.values(registry.stacks)) {
    if (stack.phase === 'starting') continue;
    const sim = stack.services.find(s => s.adapter === 'simulator');
    for (const s of stack.services.filter(s => s.adapter !== 'simulator' || !stack.services.some(x => x.adapter === 'marketing'))) {
      const lines = [`https://${s.hostname}:${host.httpsPort || 8443} {`, ` bind ${host.bind.join(' ')}`, ' tls internal'];
      if (s.adapter === 'marketing' && sim) lines.push(` redir /simulator /simulator/ 308`, ` handle /simulator/* {\n  header X-Frame-Options SAMEORIGIN\n  header Content-Security-Policy "frame-ancestors 'self'"\n  reverse_proxy 127.0.0.1:${sim.port} {\n   stream_close_delay 5m\n  }\n }`);
      lines.push(` handle {\n  reverse_proxy 127.0.0.1:${s.port} {\n   stream_close_delay 5m\n  }\n }`, '}'); blocks.push(lines.join('\n'));
    }
  }
  // Browser-reserved .localhost resolves to loopback without host DNS setup.
  // Exact source restriction also keeps the control UI off private remote clients.
  blocks.push(`https://dashboard.localhost:${host.httpsPort || 8443} {
 bind ${host.bind.join(' ')}
 tls internal
 @desktop remote_ip 127.0.0.1 ::1 ${host.tailnetIP || ''}
 handle @desktop {
  reverse_proxy 127.0.0.1:19440
 }
 handle {
  respond "Dashboard is local to this computer" 403
 }
}`);
  return blocks.join('\n\n') + '\n';
}
export function adminRequest(host, path, method = 'GET', body) {
  return new Promise((ok, fail) => {
    const req = request({ socketPath: host.admin, path, method, agent:false, headers: { 'content-type': 'application/json' }, timeout: 5000 }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => res.statusCode < 300 ? ok(data) : fail(new Error(`Owned Caddy API HTTP ${res.statusCode}`)));
    });
    req.on('timeout', () => req.destroy(new Error('Caddy API timeout'))); req.on('error', fail); req.end(body);
  });
}
export async function applyRoutes(host, next, previous) {
  // Verify this socket serves OUR storage root before changing any config.
  const current = JSON.parse(await adminRequest(host, '/config/'));
  assert(current.storage?.root === resolve(host.root, 'ca'), 'Caddy owner mismatch; refusing unrelated configuration');
  const candidate = resolve(host.root, 'Caddyfile.candidate');
  await atomic(candidate, caddyfile(host, next));
  try { execFileSync('caddy', ['validate','--config',candidate,'--adapter','caddyfile'], { stdio: 'pipe' }); }
  catch { throw new Error('Caddy validation failed; registry and active routes unchanged'); }
  try {
    execFileSync('caddy', ['reload','--address',`unix/${host.admin}`,'--config',candidate,'--adapter','caddyfile'], { stdio: 'pipe' });
    await atomic(resolve(host.root, 'Caddyfile'), caddyfile(host, next));
  } catch {
    await adminRequest(host, '/load', 'POST', JSON.stringify(current));
    await atomic(resolve(host.root, 'Caddyfile'), caddyfile(host, previous));
    throw new Error('Caddy reload failed; previous configuration restored');
  }
}
export async function runHost(host) {
  return lock(resolve(host.root,'host-owner'), () => runHostOwned(host));
}
async function runHostOwned(host) {
  try { await adminRequest(host, '/config/'); throw new Error('Host proxy already running'); }
  catch (e) { if (!['ENOENT','ECONNREFUSED'].includes(e.code)) throw e; }
  const registry = await json(resolve(host.root, 'registry.json'), { stacks: {} });
  await atomic(resolve(host.root, 'Caddyfile'), caddyfile(host, registry));
  const child = spawn('caddy', ['run','--config',resolve(host.root,'Caddyfile'),'--adapter','caddyfile'], { stdio: 'inherit', env: { ...process.env, XDG_CONFIG_HOME:resolve(host.root,'config') } });
  process.once('SIGINT', () => child.kill('SIGTERM')); process.once('SIGTERM', () => child.kill('SIGTERM'));
  await new Promise((ok, fail) => { child.on('error', fail); child.on('exit', code => code ? fail(new Error('Host proxy exited')) : ok()); });
}
export function hostDiagnosis(host) {
  const ips = Object.values(networkInterfaces()).flat().map(i => i.address);
  return { namespace: host.domain, binds: host.bind, tailnetIPPresent: !host.tailnetIP || ips.includes(host.tailnetIP), caPublicCertificate: resolve(host.root, 'ca/pki/authorities/local/root.crt'), dnsConfig: resolve(host.root,'dnsmasq.conf'), resolverTarget: `/etc/resolver/${host.domain}` };
}
