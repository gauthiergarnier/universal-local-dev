import { fork } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdir, rm, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomic, available, assert, json, gitIdentity } from './core.mjs';
import { mutate, register, unregister } from './registry.mjs';
import { applyRoutes } from './host.mjs';
import { command, src } from './adapters.mjs';
import { serviceEnv, newSecret, cleanEnv } from './environment.mjs';

export function control(stack, action = 'status') {
  return new Promise((ok, fail) => {
    const req = request({ socketPath: stack.socket, path: `/${action}`, method: action === 'down' ? 'POST' : 'GET', agent:false, headers: { authorization: `Bearer ${stack.token}` }, timeout: 3000 }, res => {
      let body = ''; res.on('data', c => body += c); res.on('end', () => {
        try { assert(res.statusCode === 200, 'Supervisor ownership check failed'); const data = JSON.parse(body); assert(data.id === stack.id && data.token === stack.token, 'Supervisor identity mismatch'); ok(data); }
        catch (e) { fail(e); }
      });
    }); req.on('error', fail); req.on('timeout', () => req.destroy(new Error('Supervisor timeout'))); req.end();
  });
}
export async function probe(service, timeout = 120000, alive = () => true) {
  const end = Date.now() + timeout;
  const path = service.readiness || (service.adapter === 'simulator' ? '/simulator/' : '/');
  while (Date.now() < end) {
    assert(alive(), `Service ${service.name} exited before readiness`);
    try { const r = await fetch(`http://127.0.0.1:${service.port}${path}`, { signal: AbortSignal.timeout(Math.min(timeout,15000)), redirect: 'manual' }); await r.body?.cancel(); if (r.status >= 200 && r.status < 400) return; } catch {}
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Readiness timed out: ${service.name}`);
}
export async function up(root, host, manifest, options = {}) {
  const start = Date.now();
  const stack = { ...manifest, phase: 'starting', token: randomUUID(), socket: resolve(root, `${manifest.id}.sock`), runtimeDir: resolve(root, 'stacks', manifest.id), startedAt: new Date().toISOString() };
  assert(stack.socket.length < 104, 'State path too long for supervisor socket');
  const services = [];
  const apply = options.apply || ((n, p) => applyRoutes(host, n, p));
  let reserved = false; let stopped = false; let fatal; let server;
  let finish;
  const completion = new Promise(r => finish = r);
  let cleanup;
  const stop = () => cleanup ||= (async () => {
    stopped = true;
    await Promise.all(services.map(({ child }) => new Promise(ok => {
      if (child.exitCode !== null || child.signalCode) return ok();
      child.once('exit', ok); if (child.connected) child.send({ stop: true }); else child.kill('SIGTERM');
    })));
    if (reserved) {
      try { await mutate(root, rows => unregister(rows, stack.id, stack.token), apply); }
      catch { console.error('Route cleanup failed; registry retained for explicit recover after host-up. No unknown PID was killed.'); }
    }
    server?.closeAllConnections();
    if (server?.listening) await new Promise(r => server.close(r));
    await rm(stack.socket, { force: true });
    finish();
  })();
  const signalStop = () => { void stop(); };
  process.once('SIGINT', signalStop); process.once('SIGTERM', signalStop);
  try {
    await mkdir(stack.runtimeDir, { recursive: true, mode: 0o700 });
    stack.services = stack.services.map(s => ({ ...s, identity: gitIdentity(s.path) }));
    await mutate(root, rows => register(rows, stack), async () => {}); reserved = true;
    for (const port of stack.ports.filter(p => ![stack.databasePort, stack.redisPort].includes(p))) await available(port);
    server = createServer((req, res) => {
      if (req.headers.authorization !== `Bearer ${stack.token}`) { res.writeHead(403); return res.end(); }
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({ id: stack.id, token: stack.token, stopping: stopped, ready: stack.phase === 'ready', services: services.map(s => s.name) }));
      if (req.url === '/down' && req.method === 'POST') setImmediate(signalStop);
    });
    await new Promise((ok, fail) => { server.once('error', fail); server.listen(stack.socket, ok); });
    await chmod(stack.socket, 0o600);
    const auth = newSecret();
    for (const s of stack.services) {
      assert(!stopped, 'Startup cancelled');
      let argv = command(stack, s);
      const env = await serviceEnv(stack, s, auth);
      if (stack.profile === 'integration' && Object.keys(s.secrets || {}).length) {
        argv = ['op', 'run', '--', process.execPath, resolve(src, 'exec-service.mjs'), ...argv];
      }
      const child = fork(resolve(src,'guardian.mjs'), [], { env: await cleanEnv(s.path), stdio: ['ignore','inherit','inherit','ipc'] });
      let alive = true;
      services.push({ name: s.name, child });
      child.on('message', m => { if (m.error || m.exited) { alive = false; if (!stopped) { fatal = new Error(`Service ${s.name} stopped; tearing down its stack`); void stop(); } } });
      child.on('error', () => { alive = false; fatal = new Error(`Guardian failed: ${s.name}`); void stop(); });
      child.send({ argv, cwd: s.path, env });
      await probe(s, options.readinessTimeout || 120000, () => alive && !stopped);
    }
    assert(!stopped, 'Startup cancelled');
    await mutate(root, rows => { assert(rows[stack.id]?.token === stack.token, 'Supervisor lost registration'); rows[stack.id].phase = 'ready'; }, apply);
    stack.phase = 'ready';
    await atomic(resolve(stack.runtimeDir,'timings.json'), JSON.stringify({ startupMs: Date.now() - start }));
    console.log(`READY ${stack.id} (${Date.now() - start} ms). Ctrl+C or local:down stops only this stack.`);
    options.onReady?.(stack);
    await completion;
    if (fatal) throw fatal;
  } finally {
    await stop(); process.removeListener('SIGINT', signalStop); process.removeListener('SIGTERM', signalStop);
  }
}
export async function recover(root, host, id) {
  const registry = await json(resolve(root, 'registry.json'), { stacks: {} }); const s = registry.stacks[id];
  if (!s) return;
  try { await control(s); throw new Error('Live supervisor: use down'); }
  catch (e) { assert(['ENOENT','ECONNREFUSED'].includes(e.code), e.message); }
  // The guardian needs up to 3 s after parent death. Occupied ports fail closed.
  for (const p of s.ports.filter(p => ![s.databasePort,s.redisPort].includes(p))) await available(p);
  await mutate(root, rows => unregister(rows, id, s.token), (n,p) => applyRoutes(host,n,p));
  await rm(s.socket, { force: true });
}
