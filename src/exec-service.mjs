// Runs inside op run: resolved values never enter the registry or argv.
import { spawn } from 'node:child_process';
import { validateResolvedEnv } from './environment.mjs';
try { validateResolvedEnv(process.env); }
catch { console.error('Local secret validation failed (values redacted)'); process.exit(1); }
const child = spawn(process.argv[2], process.argv.slice(3), { env: process.env, stdio: 'inherit' });
child.on('error', () => process.exit(1));
child.on('exit', code => process.exit(code ?? 1));
