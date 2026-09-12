import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { once } from 'node:events';
import { available, json } from '../src/core.mjs';
import { control } from '../src/supervisor.mjs';
const supervisor=new URL('../src/supervisor.mjs',import.meta.url).href;
async function port() {const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function start(t,fail=false) {
 const dir=await mkdtemp(resolve(tmpdir(),'cd-proc-'));t.after(()=>rm(dir,{recursive:true,force:true}));const p=await port();
 const service=resolve(dir,'service.mjs');await writeFile(service,`import{createServer}from'node:http';createServer((q,r)=>r.end('ready')).listen(${p},'127.0.0.1');`);
 const stack={id:'test-'+p,ports:[p],profile:'visual',domain:'test.dev.dev.test',services:[{name:'web',adapter:'command',path:dir,hostname:'test.dev.dev.test',origin:'https://test.dev.dev.test',port:p,command:[process.execPath,service]}]};
 if(fail)stack.services.push({...stack.services[0],name:'broken',port:await port(),command:[process.execPath,'-e','process.exit(9)']});
 const script=resolve(dir,'run.mjs');await writeFile(script,`import{up}from ${JSON.stringify(supervisor)};try{await up(${JSON.stringify(dir)}, {}, ${JSON.stringify(stack)}, {apply:async()=>{},readinessTimeout:3000,onReady:s=>process.send({ready:true,stack:s})});}catch{process.exitCode=1;}`);
 const child=fork(script,[],{stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);t.after(()=>{if(child.exitCode===null)child.kill('SIGTERM');});
 return {dir,p,child,output:()=>output};
}
test('readiness, authenticated down, own group shutdown leave unrelated process alive', {timeout:20000}, async t=>{
 const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)']);t.after(()=>unrelated.kill());
 const f=await start(t);const [message]=await once(f.child,'message');assert.ok(message.ready);
 await assert.rejects(control({...message.stack,token:'wrong'},'down'));
 const exit=once(f.child,'exit');await control(message.stack,'down');await exit;
 await available(f.p);assert.equal(unrelated.exitCode,null);assert.deepEqual((await json(resolve(f.dir,'registry.json'))).stacks,{});
});
test('startup failure tears down already started siblings and releases registry', {timeout:20000}, async t=>{
 const f=await start(t,true);const [code]=await once(f.child,'exit');assert.equal(code,1,f.output());await available(f.p);assert.deepEqual((await json(resolve(f.dir,'registry.json'))).stacks,{});
});
test('supervisor crash disconnects guardian, backend stops without trusting a stale PID', {timeout:20000}, async t=>{
 const f=await start(t);await once(f.child,'message');const exit=once(f.child,'exit');f.child.kill('SIGKILL');await exit;
 const until=Date.now()+6000;let stopped=false;
 while(Date.now()<until){try{await available(f.p);stopped=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}
 assert.ok(stopped,'guardian must stop orphaned service');
});
