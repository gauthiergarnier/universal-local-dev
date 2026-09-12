import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { manifest, atomic, secretRefs } from '../src/core.mjs';
import { mutate, register, unregister } from '../src/registry.mjs';
import { cleanEnv, serviceEnv } from '../src/environment.mjs';
import { caddyfile } from '../src/host.mjs';
import { compose } from '../src/integration.mjs';

const host={namespace:'dev-123',domain:'dev-123.dev.test',root:'/tmp/cd',admin:'/tmp/cd/caddy.sock',bind:['127.0.0.1','100.64.0.10']};
async function fixture(t) {
  const dir=await mkdtemp(resolve(tmpdir(),'cd-test-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=resolve(dir,'.local-dev.json');
  const data={version:1,project:'sample',name:'branch',databasePort:16004,redisPort:16005,services:[{name:'web',adapter:'command',path:'.',host:'',port:16000,command:['node','server.mjs'],env:{},secrets:{}}]};
  await writeFile(file,JSON.stringify(data)); return {dir,file,data};
}
test('manifest validates paths, hostnames, ports, dependencies and identity', async t=>{
  const f=await fixture(t); const m=await manifest(f.file,host);
  assert.match(m.domain,/^branch-[a-f0-9]{10}\.dev-123\.dev\.test$/);
  const link=resolve(f.dir,'alias'); await symlink(f.dir,link); assert.equal((await manifest(resolve(link,'.local-dev.json'),host)).id,m.id);
  for (const change of [d=>d.services[0].path='missing',d=>d.services[0].host='bad\n}',d=>d.services[0].port=53,d=>d.services[0].dependsOn=['missing'],d=>d.services[0].env.DATABASE_URL='remote',d=>d.services[0].secrets.AUTH_SECRET='op://example-local/foo/bar']) {
    const bad=structuredClone(f.data); change(bad); await writeFile(f.file,JSON.stringify(bad)); await assert.rejects(manifest(f.file,host));
  }
});
test('concurrent registry writes preserve all stacks and failed apply rolls back',async t=>{
  const f=await fixture(t);
  await Promise.all(Array.from({length:20},(_,i)=>mutate(f.dir, rows=>{ rows[`s${i}`]={id:`s${i}`}; })));
  const before=await readFile(resolve(f.dir,'registry.json'),'utf8'); assert.equal(Object.keys(JSON.parse(before).stacks).length,20);
  await assert.rejects(mutate(f.dir, rows=>{ rows.bad={}; },async()=>{throw Error('reload failed');}));
  assert.equal(await readFile(resolve(f.dir,'registry.json'),'utf8'),before);
});
test('registry refuses collisions and wrong owner deletion',()=>{
  const a={id:'one',token:'secret',ports:[16000],services:[{hostname:'one.test',path:'/a',adapter:'marketing'}]};const rows={};register(rows,a);
  assert.throws(()=>register(rows,{...a,id:'two'}),/collision/);
  assert.throws(()=>unregister(rows,'one','wrong'),/token/);
  unregister(rows,'one','secret');assert.deepEqual(rows,{});
});
test('visual clears inherited and dotenv credentials; integration injects only references',async t=>{
  const f=await fixture(t);await writeFile(resolve(f.dir,'.env.local'),'RESEND_API_KEY=never-log-this\nCUSTOM_CREDENTIAL=private\n');
  const cleaned=await cleanEnv(f.dir,{PATH:'/bin',SECRET:'secret'});assert.equal(cleaned.SECRET,undefined);assert.equal(cleaned.CUSTOM_CREDENTIAL,'');
  const m=await manifest(f.file,host);m.runtimeDir=f.dir;m.services[0].secrets={STRIPE_SECRET_KEY:'op://example-local/marketing/STRIPE_SECRET_KEY'};
  const visual=await serviceEnv(m,m.services[0],'local-random');assert.equal(visual.STRIPE_SECRET_KEY,'');assert.equal(visual.RESEND_API_KEY,'');assert.match(visual.DATABASE_URL,/@127.0.0.1:1\//);
  const integration=await serviceEnv({...m,profile:'integration'},m.services[0],'local-random');assert.match(integration.STRIPE_SECRET_KEY,/^op:\/\//);assert.match(integration.DATABASE_URL,/@127.0.0.1:16004\//);
  assert.throws(()=>secretRefs({NEXT_PUBLIC_SECRET:'op://example-local/foo/bar'}));assert.throws(()=>secretRefs({TOKEN:'op://example-production/foo/bar'}));
});
test('Caddy preserves simulator path and WebSocket host without global frame relaxation',()=>{
  const conf=caddyfile(host,{stacks:{a:{services:[{adapter:'marketing',hostname:'a.test',port:15000},{adapter:'simulator',hostname:'a.test',port:15003}]}}});
  assert.match(conf,/tls internal/);assert.match(conf,/bind 127.0.0.1 100.64.0.10/);assert.match(conf,/handle \/simulator\/\*/);assert.doesNotMatch(conf,/handle_path|header_up|0\.0\.0\.0|Funnel/);
});
test('integration data is loopback and volume/project scoped',()=>{
  const c=compose({id:'branch-abc',databasePort:15004,redisPort:15005});assert.equal(c.name,'cd-branch-abc');assert.deepEqual(c.services.postgres.ports,['127.0.0.1:15004:5432']);assert.equal(c.services.postgres.environment.POSTGRES_DB,'local_branch_abc');
});

test('unready registrations never acquire routes during another stack reload',()=>{assert.ok(!caddyfile(host,{stacks:{pending:{phase:'starting',services:[{adapter:'static',hostname:'pending.test',port:15000}]}}}).includes('pending.test'));});

test('consumer aliases preserve local cookie contracts without exposing private build inputs',async t=>{
  const f=await fixture(t);f.data.cookiePrefix='sample';f.data.services[0].envAliases={PROJECT_HTTPS:'LOCAL_DEV_HTTPS',VITE_PREVIEW_URL:'VITE_APP_URL'};
  await writeFile(f.file,JSON.stringify(f.data));const m=await manifest(f.file,host);const env=await serviceEnv(m,m.services[0],'private-test-value');
  assert.equal(env.PROJECT_HTTPS,'1');assert.equal(env.VITE_PREVIEW_URL,env.VITE_APP_URL);assert.equal(env.AUTH_COOKIE_NAME,`__Secure-sample-${m.id}.session`);
  f.data.services[0].envAliases={NEXT_PUBLIC_CREDENTIAL:'AUTH_SECRET'};await writeFile(f.file,JSON.stringify(f.data));await assert.rejects(manifest(f.file,host),/Private value/);
});
