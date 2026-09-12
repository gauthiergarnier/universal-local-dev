// No persisted PID is ever a kill target. The guardian owns a live child group,
// and tears it down if its IPC parent disappears (including supervisor SIGKILL).
import { spawn } from 'node:child_process';
import { validateResolvedEnv } from './environment.mjs';
let child; let stopping = false;
function stop() {
  if (stopping) return; stopping = true;
  if (!child?.pid) return process.exit(0);
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} process.exit(0); }, 3000);
}
process.on('disconnect', stop);
process.on('SIGTERM', stop); process.on('SIGINT', stop);
process.on('message', message => {
  if (message.stop) return stop();
  if (child || stopping) return;
  try { if (message.argv[0] !== 'op') validateResolvedEnv(message.env); }
  catch { process.send?.({ error: 'Invalid resolved local environment' }); return stop(); }
  child = spawn(message.argv[0], message.argv.slice(1), { cwd: message.cwd, env: message.env, detached: true, stdio: ['ignore','inherit','inherit'] });
  child.on('error', () => { process.send?.({ error: 'Service executable could not start' }); stop(); });
  child.on('exit', (code, signal) => { process.send?.({ exited: true, code, signal }); stop(); });
});
