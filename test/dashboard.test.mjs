import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { dashboard, rememberProject } from '../src/dashboard.mjs';
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('dashboard authenticates API, rejects foreign origins/hosts, lists only safe project fields',async t=>{
 const root=await mkdtemp(resolve(tmpdir(),'uld-ui-'));t.after(()=>rm(root,{recursive:true,force:true}));const port=await freePort();
 const file=resolve(root,'.local-dev.json');await writeFile(file,JSON.stringify({version:1,project:'example',name:'preview',services:[{name:'website',adapter:'static',path:'.',host:'',port:16001,secrets:{TOKEN:'op://example-local/item/token'}}]}));
 await rememberProject(root,file);await rememberProject(root,file);
 const server=await dashboard(root,{namespace:'test',domain:'test.dev.test'},port);t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const origin=`http://127.0.0.1:${port}`;const html=await(await fetch(origin)).text();const token=html.match(/name="local-token" content="([^"]+)"/)[1];
 assert.equal((await fetch(origin+'/api/status')).status,403);
 assert.equal(await new Promise((ok,fail)=>{const req=request(origin,{headers:{host:'foreign.example'}},res=>{res.resume();ok(res.statusCode);});req.on('error',fail);req.end();}),403);
 const headers={authorization:`Bearer ${token}`};const response=await(await fetch(origin+'/api/status',{headers})).json();assert.equal(response.projects.length,1);assert.ok(!JSON.stringify(response).includes('op://'));
 assert.equal((await fetch(origin+'/api/stop',{method:'POST',headers:{...headers,'content-type':'application/json',origin:'https://foreign.example'},body:JSON.stringify({id:response.projects[0].id})})).status,403);
 const qr=await(await fetch(origin+'/api/qr',{method:'POST',headers:{...headers,'content-type':'application/json',origin},body:JSON.stringify({id:response.projects[0].id,service:'website',page:'/hello'})})).json();assert.match(qr.svg,/<svg/);assert.match(qr.url,/\/hello$/);
});
