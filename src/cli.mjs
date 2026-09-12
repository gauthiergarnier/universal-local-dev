#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { VERSION, stateRoot, json, manifest, hash, gitIdentity, assert, atomic } from './core.mjs';
import { setupHost, runHost, hostDiagnosis, adminRequest } from './host.mjs';
import { up, control, recover, probe } from './supervisor.mjs';
import { command, parity, binary, src } from './adapters.mjs';
import { serviceEnv, newSecret } from './environment.mjs';
import { dataCommand } from './integration.mjs';
import { sync } from './secrets-sync.mjs';
import { prepareSystem } from './system-setup.mjs';
import { dashboard, rememberProject } from './dashboard.mjs';

const { values:o, positionals } = parseArgs({ allowPositionals:true, options:Object.fromEntries([
  ...['manifest','profile','name','project','app','marketing','simulator','port','namespace','domain','tailnet-ip','https-port','confirm','environment','uuid','plan','page','service'].map(k => [k,{ type:'string' }]),
  ...['apply','qr','migrate','help'].map(k => [k,{type:'boolean'}]),
]) });
const aliases = { init:'setup', start:'up', dev:'up', smoke:'check' };
const action = aliases[positionals[0]] || positionals[0] || 'help';
const root = stateRoot();
const file = resolve(o.manifest || '.local-dev.json');

async function setup() {
  const host = await setupHost(root, { namespace:o.namespace, tailnetIP:o['tailnet-ip'], httpsPort:o['https-port'], domain:o.domain });
  if (existsSync(file)) { await rememberProject(root,file); console.log(`Already configured: ${file}`); return; }
  const cwd = process.cwd();
  const oldFile = resolve(cwd,'.local-stack.json');
  const old = o.migrate ? await json(oldFile) : null;
  const projectConfig = await json(resolve(cwd,'local-dev.project.json'), { adapter:'static', project:'local-project' });
  const base = Number(o.port || old?.basePort || 10000 + parseInt(hash(cwd).slice(0,4),16) % 3000 * 10);
  const services = [];
  const add = (name, adapter, path, host, port, profiles, dependsOn = []) => {
    const descriptor=resolve(path,'local-dev.project.json');
    const project=existsSync(descriptor) ? JSON.parse(readFileSync(descriptor,'utf8')) : {};
    services.push({ name, adapter, path, host, port, profiles, dependsOn, envAliases:project.envAliases || {}, readiness:adapter === 'app' ? '/pins.html' : adapter === 'simulator' ? '/simulator/' : '/' });
  };
  const marketing = o.marketing || (projectConfig.adapter === 'marketing' ? '.' : undefined);
  const app = o.app || old?.appPath || (projectConfig.adapter === 'app' ? '.' : undefined);
  const simulator = o.simulator || (projectConfig.adapter === 'simulator' ? '.' : undefined);
  if (marketing) add('website','marketing',resolve(cwd,marketing),'',base,['visual','integration','simulator-source']);
  if (app) add('app','app',resolve(cwd,app),'app',base+1,['visual','integration','simulator-source']);
  if (simulator) add('simulator','simulator',resolve(cwd,simulator),marketing ? '' : 'simulator',base+3,marketing ? ['simulator-source'] : ['visual','integration','simulator-source']);
  if (!services.length) add('website','static',cwd,'',base,['visual']);
  const m = { version:1, cookiePrefix:projectConfig.cookiePrefix, secretVault:projectConfig.secretVault, project:o.project || projectConfig.project, name:o.name || old?.name || 'dev', route:old?.route || '/', databasePort:base+4, redisPort:base+5, services };
  await mkdir(dirname(file), { recursive:true });
  await writeFile(file, JSON.stringify(m,null,2)+'\n', { flag:'wx', mode:0o600 });
  try { await manifest(file,host); } catch (e) { console.error(`Edit ${file}: ${e.message}`); process.exitCode=1; }
  await rememberProject(root,file);
  console.log(`Created ${file}. Host config: ${root}. Run host-up in one terminal, then doctor and up. See the setup guide for DNS/trust.`);
}
async function urls(stack) {
  console.log(`Profile: ${stack.profile}; stack: ${stack.id}; cookie domain: .${stack.domain}`);
  for (const s of stack.services) {
    const i = gitIdentity(s.path);
    const site = stack.services.find(x => x.adapter === 'marketing');
    const url = s.adapter === 'simulator' ? `${site?.origin || s.origin}/simulator/` : `${s.origin}${s.adapter === 'marketing' ? stack.route || '/' : s.adapter === 'app' && stack.profile !== 'integration' ? '/pins.html' : '/'}`;
    console.log(`${s.name}: ${url}\n  ${i.path}\n  ${i.branch} @ ${i.commit}${i.dirty ? ' (modified)' : ''}`);
    if ((o.qr || action === 'qr') && (!o.service || o.service === s.name)) {
      const target = new URL(o.page || url, s.origin); assert(target.origin === s.origin || (s.adapter === 'simulator' && target.origin === site?.origin), 'QR page must stay on selected service origin');
      const { default:QR } = await import('qrcode');
      console.log(await QR.toString(target.href,{type:'terminal', small:true}));
    }
  }
}
async function main() {
  if (action === 'version') return console.log(VERSION);
  if (action === 'self-test') return execFileSync(process.execPath,['--test',...(await readdir(resolve(src,'../test'))).filter(n=>n.endsWith('.test.mjs')).map(n=>resolve(src,'../test',n))],{stdio:'inherit'});
  if (action === 'help' || o.help) return console.log(`Universal Local Dev ${VERSION}\nsetup [--app PATH --simulator PATH --name NAME --tailnet-ip IP] [--migrate]\ndoctor | host-up | host-setup | dashboard | register | up | down | status | check | urls | qr [--service NAME --page /path]\n--profile visual|integration|simulator-source --manifest PATH\ndata-up | data-down | data-reset --confirm STACK | migrate | fixtures\nrecover | email-preview | build\nsecrets-sync --plan PATH --environment ENV --uuid UUID [--apply]\nSetup and trust instructions: docs/setup.md`);
  if (action === 'setup') return setup();
  if (action === 'secrets-sync') return console.log(JSON.stringify(await sync(await json(resolve(o.plan)), { environment:o.environment, applicationUUID:o.uuid, productionApproval:o.confirm }, { apply:!!o.apply, token:process.env.COOLIFY_API_TOKEN }),null,2));
  const host = await json(resolve(root,'host.json'));
  if (action === 'host-setup') return console.log(JSON.stringify(await prepareSystem(host),null,2));
  if (action === 'host-up') return runHost(host);
  if (action === 'dashboard') return dashboard(root,host,Number(o.port || 19440));
  if (action === 'register') { await manifest(file,host,o.profile || 'visual'); await rememberProject(root,file); console.log('Registered worktree for the dashboard'); return; }
  const stack = await manifest(file,host,o.profile || 'visual');
  if (action === 'urls' || action === 'qr') return urls(stack);
  if (action === 'doctor') {
    await urls(stack);
    const diagnostic = hostDiagnosis(host); console.log(JSON.stringify(diagnostic,null,2));
    let failed = false;
    for (const bin of ['caddy', ...(stack.profile === 'integration' ? ['docker'] : []), ...(stack.services.some(s => Object.keys(s.secrets || {}).length) && stack.profile === 'integration' ? ['op'] : [])]) {
      try { execFileSync('which',[bin],{stdio:'pipe'}); console.log(`PASS executable ${bin}`); } catch { console.log(`MISSING ${bin}`); failed=true; }
    }
    for (const s of stack.services) { try { command(stack,s); console.log(`PASS adapter ${s.name}`); } catch (e) { console.log(e.message); failed=true; } }
    try { await adminRequest(host,'/config/'); console.log('PASS owned proxy reachable'); } catch { console.log('MISSING host proxy: run host-up'); failed=true; }
    try { execFileSync('curl',['--fail','--silent','--show-error','--max-time','5',stack.services[0].origin],{stdio:'pipe'}); console.log('PASS system DNS + trusted HTTPS + page'); } catch { console.log('DNS/trust/page not ready (expected before first up); run check after startup'); }
    console.log('Phone trust and tailnet DNS must be verified on a real phone. No desktop test establishes this.');
    if (existsSync(resolve(root,'registry.lock'))) console.log('Registry lock exists; do not delete until all launchers/mutations have stopped. Owner metadata is diagnostic only.');
    process.exitCode = failed ? 1 : 0; return;
  }
  if (action === 'up') { await urls(stack); return up(root,host,stack); }
  if (action === 'recover') return recover(root,host,stack.id);
  const registry = await json(resolve(root,'registry.json'), {stacks:{}});
  if (action === 'status') {
    for (const s of Object.values(registry.stacks)) {
      let state='stale/unreachable'; try { state=(await control(s)).stopping ? 'stopping' : 'running'; } catch {}
      console.log(JSON.stringify({id:s.id,profile:s.profile,state,startedAt:s.startedAt,services:s.services.map(x => ({ name:x.name,origin:x.origin,port:x.port,identity:x.identity }))},null,2));
    } return;
  }
  if (action === 'down') { if (registry.stacks[stack.id]) await control(registry.stacks[stack.id],'down'); else console.log('Stack already down'); return; }
  if (action.startsWith('data-')) return dataCommand(root,stack,action,o.confirm);
  const marketing = stack.services.find(s => s.adapter === 'marketing');
  if (['migrate','fixtures','email-preview'].includes(action)) {
    assert(marketing, 'Select a marketing worktree');
    assert(action === 'email-preview' || stack.profile === 'integration','Data mutation requires --profile integration');
    const env = await serviceEnv({...stack,runtimeDir:resolve(root,'stacks',stack.id)},marketing,newSecret());
    const script = action === 'email-preview' ? 'scripts/local-email-preview.mjs' : 'scripts/local-fixtures.mjs';
    execFileSync(process.execPath,[script,action],{ cwd:marketing.path, env, stdio:'inherit' }); return;
  }
  if (action === 'build') {
    assert(marketing,'Build alias requires marketing');
    const env = await serviceEnv({...stack,profile:'visual'},marketing,newSecret());
    execFileSync(process.execPath,[binary(marketing.path,'next','dist/bin/next'),'build'],{cwd:marketing.path,env:{...env,NODE_ENV:'production'},stdio:'inherit'}); return;
  }
  if (action === 'check') {
    const start=Date.now(); console.log(await parity(stack));
    for (const s of stack.services) {
      await probe(s,15000);
      console.log(`PASS backend ${s.name}`);
      const site=stack.services.find(x=>x.adapter==='marketing');
      const url=s.adapter==='simulator' ? `${site?.origin || s.origin}/simulator/` : `${s.origin}${s.adapter==='marketing' ? stack.route || '/' : s.adapter==='app' && stack.profile!=='integration' ? '/pins.html' : '/'}`;
      try { execFileSync('curl',['--fail','--silent','--show-error','--max-time','30',url],{stdio:'pipe'}); } catch { throw new Error(`Trusted HTTPS/DNS check failed: ${url}`); }
      console.log(`PASS DNS + trusted HTTPS ${url}`);
    }
    console.log(`Check ${Date.now()-start} ms. Browser interactions/phone checks are separate.`); return;
  }
  throw new Error(`Unknown command: ${action}`);
}
main().catch(e => { console.error(e.code === 'ENOENT' ? 'Required file/executable missing; run setup and doctor. See docs/setup.md.' : e.message); if (process.env.LOCAL_DEV_DEBUG === '1') console.error(e.stack); process.exitCode=1; });
