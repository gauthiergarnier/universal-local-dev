import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { assert } from './core.mjs';

export async function cleanEnv(path, inherited = process.env) {
  const env = {};
  for (const k of ['PATH','HOME','USER','SHELL','TMPDIR','TEMP','LANG','LC_ALL','TERM','SystemRoot']) if (inherited[k]) env[k] = inherited[k];
  for (const file of ['.env','.env.local','.env.development','.env.development.local','.env.production','.env.production.local']) {
    try { for (const [, key] of (await readFile(resolve(path, file), 'utf8')).matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)) env[key] = ''; }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return env;
}
export function localDatabase(stack) { return `postgres://local:local@127.0.0.1:${stack.databasePort}/local_${stack.id.replaceAll('-', '_')}`; }
export async function serviceEnv(stack, service, authSecret) {
  const site = stack.services.find(s => s.adapter === 'marketing')?.origin || stack.services[0].origin;
  const app = stack.services.find(s => s.adapter === 'app')?.origin || `https://app.${stack.domain}${new URL(site).port ? ':'+new URL(site).port : ''}`;
  const integration = stack.profile === 'integration';
  const env = { ...await cleanEnv(service.path), ...service.env,
    NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', INCIDENTS_CANARY: 'false',
    HOST: '127.0.0.1', ADMIN_HOST: '127.0.0.1', PORT: String(service.port), ADMIN_PORT: String(service.port + 1),
    NEXT_PUBLIC_SITE_URL: site, AUTH_URL: site, MARKETING_ORIGIN: site,
    NEXT_PUBLIC_DRIVING_APP_URL: app, SELF_ORIGIN: app, DEMO_FRAME_ANCESTORS: site,
    LOCAL_DEV_HTTPS: '1', AUTH_COOKIE_NAME: `__Secure-${stack.cookiePrefix || 'local'}-${stack.id}.session`, COOKIE_DOMAIN: `.${stack.domain}`,
    AUTH_SECRET: authSecret, GUEST_COOKIE_SECRET: authSecret,
    LOCAL_DEV_HOST: new URL(stack.services.some(s => s.adapter === 'marketing') ? site : service.origin).hostname,
    LOCAL_DEV_ORIGIN: stack.services.some(s => s.adapter === 'marketing') ? site : service.origin,
    VITE_APP_URL: app,
    DATABASE_URL: integration ? localDatabase(stack) : 'postgres://visual:visual@127.0.0.1:1/visual?connect_timeout=1',
    REDIS_URL: integration ? `redis://127.0.0.1:${stack.redisPort}` : '',
    RESEND_API_KEY: '', STRIPE_SECRET_KEY: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
    BILLING_MONTHLY_ENABLED: 'false',
    LOCAL_EMAIL_CAPTURE_DIR: integration ? resolve(stack.runtimeDir, 'mail') : '',
  };
  for (const [target,source] of Object.entries(service.envAliases || {})) {
    assert(Object.hasOwn(env,source), `Unknown environment alias source: ${source}`);
    env[target] = env[source];
  }
  if (integration) Object.assign(env, service.secrets || {});
  return env;
}
export function validateResolvedEnv(env) {
  for (const key of ['STRIPE_SECRET_KEY']) assert(!env[key] || env[key].startsWith('sk_test_') || env[key].startsWith('rk_test_'), `${key} must be a Stripe test credential`);
  assert(!Object.values(env).some(v => typeof v === 'string' && v.startsWith('op://')), 'Unresolved secret reference');
  if (env.DATABASE_URL) {
    const u = new URL(env.DATABASE_URL);
    assert(u.hostname === '127.0.0.1', 'Local services require a loopback database');
  }
}
export const newSecret = () => randomBytes(32).toString('hex');
