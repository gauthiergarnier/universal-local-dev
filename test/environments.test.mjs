import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createEnvironment, environments, EnvironmentManager, environmentRuntime } from '../src/environments.mjs';
import { json, manifest } from '../src/core.mjs';
import { up } from '../src/supervisor.mjs';
const host={namespace:'test',domain:'test.dev.test'};
function git(path,...args){return execFileSync('git',['-C',path,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}
async function fixture(t) {
  const root=await mkdtemp('/tmp/uld-env-');t.after(()=>rm(root,{recursive:true,force:true}));
  const services=[];
  for(const [i,name] of ['website','api'].entries()) {
    const path=resolve(root,name);await mkdir(resolve(path,'public'),{recursive:true});
    git(path,'init','-b','local-test');git(path,'config','user.name','Example');git(path,'config','user.email','example@example.test');
    await writeFile(resolve(path,'public/index.html'),name+' one');git(path,'add','.');git(path,'commit','-m','Initial');
    services.push({name,adapter:'static',path,host:i?'api':'',port:17000+i,profiles:['visual']});
  }
  const file=resolve(root,'source.json');await writeFile(file,JSON.stringify({version:1,project:'example',name:'agent-preview',services}));
  return {root,file,services};
}
async function change(service,text){await writeFile(resolve(service.path,'public/index.html'),text);git(service.path,'add','.');git(service.path,'commit','-m',text);return git(service.path,'rev-parse','HEAD');}
function fakeRuntime() {return {running:false,starts:0,stops:0,async status(){return this.running?'running':'stopped';},async start(){this.running=true;this.starts++;},async stop(){if(this.running)this.stops++;this.running=false;}};}
test('named environments isolate checkouts/ports, validate refs, and retain stable URLs',async t=>{
  const {root,file,services}=await fixture(t);
  await assert.rejects(createEnvironment(root,host,{file,name:'../bad'}));
  await assert.rejects(createEnvironment(root,host,{file,name:'missing',branch:'does-not-exist'}),/Git rev-parse/);
  git(services[1].path,'branch','review/api');
  const one=await createEnvironment(root,host,{file,name:'local-test',branches:{api:'review/api'}});
  const two=await createEnvironment(root,host,{file,name:'acceptance'});
  const a=await manifest(one.file,host), b=await manifest(two.file,host);
  assert.notEqual(a.domain,b.domain);assert.ok(a.ports.every(p=>!b.ports.includes(p)));
  assert.equal(one.repositories[1].branch,'review/api');
  assert.ok(one.repositories.every(r=>r.path!==r.source));
  await assert.rejects(createEnvironment(root,host,{file,name:'local-test'}),/already exists/);
  assert.equal((await environments(root)).length,2);
});
test('committed branch updates restart a real group, preserve previews, pause and stop independently',async t=>{
  const {root,file,services}=await fixture(t);const row=await createEnvironment(root,host,{file,name:'local-test'});
  const runtime=environmentRuntime(root,host);let completion;let starts=0;
  runtime.start=async row=>{starts++;await new Promise(async(ok,fail)=>{completion=up(root,host,await manifest(row.file,host,row.profile),{apply:async()=>{},onReady:ok,readinessTimeout:5000});completion.catch(fail);});};
  const originalStop=runtime.stop.bind(runtime);runtime.stop=async row=>{await originalStop(row);await completion;};
  t.after(async()=>{await runtime.stop(row);});
  const manager=new EnvironmentManager(root,host,{runtime,prepare:async()=>{}});
  const ready=await manager.operate(row.name,'start');const m=await manifest(row.file,host);
  assert.equal(ready.phase,'running');assert.equal(starts,1);
  const content=async()=>Promise.all(m.services.map(async s=>(await fetch(`http://127.0.0.1:${s.port}`)).text()));
  assert.deepEqual(await content(),['website one','api one']);
  await manager.operate(row.name,'pause');
  const commits=await Promise.all(services.map(s=>change(s,s.name+' two')));
  await manager.operate(row.name,'poll');assert.equal(starts,1);
  await manager.operate(row.name,'resume');const updated=await manager.operate(row.name,'poll');
  assert.deepEqual(updated.applied.map(r=>r.commit),commits);assert.equal(starts,2);assert.deepEqual(await content(),['website two','api two']);
  assert.equal((await manifest(row.file,host)).domain,m.domain);
  git(services[0].path,'switch','-c','agent/experiment');await writeFile(resolve(services[0].path,'public/index.html'),'uncommitted agent experiment');
  const before=git(services[0].path,'status','--porcelain');await manager.operate(row.name,'poll');
  assert.equal(starts,2);assert.equal(git(services[0].path,'status','--porcelain'),before);assert.deepEqual(await content(),['website two','api two']);
  await manager.operate(row.name,'stop');await manager.operate(row.name,'poll');assert.equal(await runtime.status(row),'stopped');
});
test('dirty owned checkouts and rewritten branches fail closed without stopping the running version',async t=>{
  const {root,file,services}=await fixture(t);const row=await createEnvironment(root,host,{file,name:'review'});
  const runtime=fakeRuntime();const manager=new EnvironmentManager(root,host,{runtime,prepare:async()=>{}});
  const first=await manager.operate(row.name,'start');
  await writeFile(resolve(first.repositories[0].path,'public/index.html'),'preserve this edit');
  await change(services[0],'forward');
  await assert.rejects(manager.operate(row.name,'update'),/local changes/);assert.equal(runtime.stops,0);
  assert.equal(await readFile(resolve(first.repositories[0].path,'public/index.html'),'utf8'),'preserve this edit');
  git(first.repositories[0].path,'restore','public/index.html');await manager.operate(row.name,'update');
  git(services[0].path,'update-ref','refs/heads/local-test',first.repositories[0].commit);
  await assert.rejects(manager.operate(row.name,'update'),/no longer advances/);assert.equal(runtime.starts,2);assert.equal(runtime.stops,1);
});
test('failed multi-repository preparation never starts a partial group and can be retried',async t=>{
  const {root,file}=await fixture(t);const row=await createEnvironment(root,host,{file,name:'review'});
  const runtime=fakeRuntime();let fail=true;
  const manager=new EnvironmentManager(root,host,{runtime,prepare:async r=>{if(r.name==='api'&&fail)throw Error('Example install failure');}});
  await assert.rejects(manager.operate(row.name,'start'),/Example install failure/);
  assert.equal(runtime.starts,0);const failed=await json(resolve(root,'environments/review/environment.json'));
  assert.equal(failed.phase,'error');assert.equal(failed.appliedAt,null);
  await manager.operate(row.name,'poll');assert.equal(runtime.starts,0);
  fail=false;const ready=await manager.operate(row.name,'start');assert.equal(runtime.starts,1);assert.equal(ready.applied.length,2);assert.equal(ready.error,null);
});

test('background watcher applies new commits without a dashboard request',async t=>{
  const {root,file,services}=await fixture(t);const row=await createEnvironment(root,host,{file,name:'watch-review'});
  const runtime=fakeRuntime();const manager=new EnvironmentManager(root,host,{runtime,prepare:async()=>{}});
  await manager.operate(row.name,'start');
  const stop=manager.watch(100);t.after(async()=>{stop();while(manager.busy.size)await new Promise(r=>setTimeout(r,25));});
  const commit=await change(services[1],'automatic update');
  const until=Date.now()+10000;let current;
  do {await new Promise(r=>setTimeout(r,100));current=(await environments(root))[0];}while(current.applied?.[1]?.commit!==commit&&Date.now()<until);
  assert.equal(current.applied[1].commit,commit);assert.equal(runtime.starts,2);
  stop();while(manager.busy.size)await new Promise(r=>setTimeout(r,25));
});


test('Next generated route imports permit updates but manual edits remain protected',async t=>{
  const {root,file,services}=await fixture(t);
  const source=services[0];
  const original='/// <reference types="next" />\nimport "./.next/types/routes.d.ts";\n';
  await writeFile(resolve(source.path,'next-env.d.ts'),original);git(source.path,'add','.');git(source.path,'commit','-m','Generated declaration');
  const template=await json(file);template.services[0].adapter='marketing';await writeFile(file,JSON.stringify(template));
  const row=await createEnvironment(root,host,{file,name:'next-review'});
  const runtime=fakeRuntime();const manager=new EnvironmentManager(root,host,{runtime,prepare:async()=>{}});
  const first=await manager.operate(row.name,'start');const generated=resolve(first.repositories[0].path,'next-env.d.ts');
  await writeFile(generated,original.replace('./.next/types/','./.next/dev/types/'));
  await change(source,'forward');await manager.operate(row.name,'update');assert.equal(runtime.starts,2);
  await writeFile(generated,original.replace('./.next/types/','./.next/dev/types/')+'// preserve my change\n');
  await assert.rejects(manager.operate(row.name,'update'),/local changes/);assert.equal(runtime.stops,1);
});


test('human controls wait for a background read instead of being rejected as busy',async t=>{
  const {root,file}=await fixture(t);const row=await createEnvironment(root,host,{file,name:'controls'});
  const runtime=fakeRuntime();const manager=new EnvironmentManager(root,host,{runtime,prepare:async()=>{}});
  await manager.operate(row.name,'start');
  let entered;const reading=new Promise(r=>entered=r);let release;
  const held=new Promise(r=>release=r);const status=runtime.status.bind(runtime);
  runtime.status=async()=>{entered();await held;return status();};
  const poll=manager.operate(row.name,'poll');await reading;
  const pause=manager.operate(row.name,'pause');release();await poll;
  assert.equal((await pause).autoUpdate,false);
});
