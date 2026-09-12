import { execFileSync } from 'node:child_process';
import { assert, envKey, secretRefs } from './core.mjs';

// Provider contract: resolve(reference) -> exact string. No plaintext persistence,
// no implicit migration, and no SDK coupling in the Coolify adapter.
export class OnePasswordProvider {
  async resolve(reference) {
    try { return execFileSync('op', ['read','--no-newline',reference], { encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
    catch { throw new Error('1Password resolution failed (provider output redacted)'); }
  }
}
export function validateSync(plan, selection) {
  assert(plan.version === 1 && ['local','staging','production'].includes(plan.environment), 'Invalid sync environment');
  assert(plan.environment === selection.environment && plan.applicationUUID === selection.applicationUUID, 'Select the exact environment and resource UUID');
  assert(/^[a-zA-Z0-9-]{8,64}$/.test(plan.projectUUID) && /^[a-zA-Z0-9-]{8,64}$/.test(plan.applicationUUID) && /^[a-zA-Z0-9-]{8,64}$/.test(plan.environmentUUID), 'Exact resource and environment UUIDs required');
  const u = new URL(plan.apiOrigin);
  assert(u.protocol === 'https:' && u.origin === plan.apiOrigin && !u.username && !u.password, 'Coolify requires a bare HTTPS origin');
  assert(Array.isArray(plan.keys) && plan.keys.length > 0, 'Declare sync keys');
  const names = new Set();
  for (const k of plan.keys) {
    assert(envKey(k.key) && !names.has(k.key), 'Invalid/duplicate sync key'); names.add(k.key);
    const vault=plan.secretVault || `example-${plan.environment}`;
    assert(vault.endsWith(`-${plan.environment}`), 'Sync vault must match the selected environment');
    secretRefs({ [k.key]: k.reference }, vault);
    for (const flag of ['is_buildtime','is_runtime','is_literal','is_multiline']) assert(typeof k[flag] === 'boolean', `Explicit ${flag} required`);
    assert(k.is_literal, 'Secret values must be literal');
  }
}
export async function sync(plan, selection, { provider = new OnePasswordProvider(), fetcher = fetch, token, apply = false } = {}) {
  validateSync(plan, selection);
  const summary = { environment:plan.environment, applicationUUID:plan.applicationUUID, keys:plan.keys.map(k => k.key), applied:false };
  // Default dry run is offline and names only: no token or provider request.
  if (!apply) return summary;
  assert(plan.environment !== 'production' || selection.productionApproval === plan.applicationUUID, 'Production requires a separate explicit resource confirmation');
  assert(token, 'A separately supplied Coolify token is required');
  async function call(path, options = {}) {
    let response;
    try { response = await fetcher(`${plan.apiOrigin}/api/v1${path}`, { ...options, redirect:'error', signal:AbortSignal.timeout(15000), headers:{ authorization:`Bearer ${token}`, 'content-type':'application/json' } }); }
    catch { throw new Error('Coolify request failed (details redacted)'); }
    assert(response.ok, `Coolify request failed: HTTP ${response.status}`);
    return response;
  }
  // The application endpoint exposes environment_id, not an embedded environment.
  // Resolve through the documented project/environment endpoint and require exact
  // membership before reading any provider value or sending a PATCH.
  const environment = await (await call(`/projects/${plan.projectUUID}/${plan.environmentUUID}`)).json();
  assert(environment.uuid === plan.environmentUUID && environment.name === plan.environment &&
    Array.isArray(environment.applications) && environment.applications.some(app => app.uuid === plan.applicationUUID),
    'Remote resource/environment identity mismatch');
  const data = [];
  for (const k of plan.keys) {
    let value;
    try { value = await provider.resolve(k.reference); } catch { throw new Error(`Secret resolution failed: ${k.key} (redacted)`); }
    assert(typeof value === 'string', `Provider must return a string: ${k.key}`);
    assert(k.is_multiline || !/[\r\n]/.test(value), `Multiline flag required: ${k.key}`);
    data.push({ key:k.key, value, is_buildtime:k.is_buildtime, is_runtime:k.is_runtime, is_literal:k.is_literal, is_multiline:k.is_multiline, is_preview:false });
  }
  // Bulk PATCH upserts only declared keys. No DELETE, deploy, or restart endpoint.
  await call(`/applications/${plan.applicationUUID}/envs/bulk`, { method:'PATCH', body:JSON.stringify({ data }) });
  return { ...summary, applied:true };
}
