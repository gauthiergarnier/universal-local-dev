import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, open } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { json, atomic, lock, manifest, assert, gitIdentity } from './core.mjs';
import { control } from './supervisor.mjs';
import { cleanEnv } from './environment.mjs';
const here=dirname(fileURLToPath(import.meta.url));
export async function rememberProject(root,file) {
  return lock(root,async()=>{
    const projects=await json(resolve(root,'projects.json'),{version:1,manifests:[]});
    if (!projects.manifests.includes(resolve(file))) projects.manifests.push(resolve(file));
    await atomic(resolve(root,'projects.json'),JSON.stringify(projects,null,2));
  });
}
export async function dashboard(root,host,port=19440) {
  assert(Number.isInteger(port) && port>=1024 && port<=65535,'Invalid dashboard port');
  const token=randomBytes(32).toString('hex');
  const origin=`http://127.0.0.1:${port}`;
  const publicOrigin=`https://dashboard.localhost:${host.httpsPort||8443}`;
  const html=await readFile(resolve(here,'dashboard.html'),'utf8');
  const script=await readFile(resolve(here,'dashboard-ui.js'),'utf8');
  const pending=new Set();
  async function models() {
    const registry=await json(resolve(root,'registry.json'),{stacks:{}});
    const projects=await json(resolve(root,'projects.json'),{manifests:[]});
    const entries=[];
    for(const file of [...new Set([...projects.manifests,...Object.values(registry.stacks).map(s=>s.file)])]) {
      try {
        const m=await manifest(file,host);const active=registry.stacks[m.id];
        let status=active ? 'unreachable' : pending.has(m.id) ? 'starting' : 'stopped';
        if(active) {try {const state=await control(active);status=state.stopping?'stopping':state.ready===false?'starting':'running';pending.delete(m.id);}catch{}}
        entries.push({id:m.id,name:m.name,project:m.project,file,domain:m.domain,status,profile:active?.profile||'visual',services:(active?.services||m.services).map(s=>({name:s.name,adapter:s.adapter,origin:s.origin,port:s.port,identity:gitIdentity(s.path)}))});
      }catch{entries.push({file,status:'invalid',name:'Invalid project configuration',services:[]});}
    }
    return {namespace:host.domain,httpsPort:host.httpsPort||8443,tailnetConfigured:!!host.tailnetIP,projects:entries};
  }
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    const send=(code,data)=>{res.writeHead(code,{'content-type':'application/json'});res.end(JSON.stringify(data));};
    try {
      const allowedHosts=[`127.0.0.1:${port}`,new URL(publicOrigin).host];
      if(!allowedHosts.includes(req.headers.host)) return send(403,{error:'Use the printed dashboard URL'});
      const requestOrigin=req.headers.host===new URL(publicOrigin).host ? publicOrigin : origin;
      const url=new URL(req.url,origin);
      if(req.method==='GET' && url.pathname==='/') {res.setHeader('content-type','text/html; charset=utf-8');return res.end(html.replace('{{TOKEN}}',token));}
      if(req.method==='GET' && url.pathname==='/dashboard-ui.js') {res.setHeader('content-type','text/javascript');return res.end(script);}
      if(req.headers.authorization!==`Bearer ${token}`) return send(403,{error:'Dashboard authentication required'});
      if(req.method==='GET' && url.pathname==='/api/status') return send(200,await models());
      if(req.method!=='POST' || req.headers.origin!==requestOrigin || req.headers['content-type']!=='application/json') return send(403,{error:'Same-origin JSON request required'});
      let body='';for await(const part of req){body+=part;assert(body.length<4096,'Request too large');}
      const input=JSON.parse(body);const project=(await models()).projects.find(p=>p.id===input.id);
      assert(project,'Unknown registered project');
      if(url.pathname==='/api/stop') {
        const active=(await json(resolve(root,'registry.json'),{stacks:{}})).stacks[input.id];if(active)await control(active,'down');return send(200,{ok:true});
      }
      if(url.pathname==='/api/start') {
        assert(project.status==='stopped' && !pending.has(project.id),'Project already running or needs recovery');
        assert(['visual','integration','simulator-source'].includes(input.profile),'Invalid profile');
        await manifest(project.file,host,input.profile);
        await mkdir(resolve(root,'logs'),{recursive:true,mode:0o700});
        const log=await open(resolve(root,'logs',`${project.id}.log`),'a',0o600);
        pending.add(project.id);
        const child=spawn(process.execPath,[resolve(here,'cli.mjs'),'up','--manifest',project.file,'--profile',input.profile],{cwd:dirname(project.file),env:{...await cleanEnv(dirname(project.file)),LOCAL_DEV_STATE:root},detached:true,stdio:['ignore',log.fd,log.fd]});
        child.on('error',()=>pending.delete(project.id));child.on('exit',()=>pending.delete(project.id));child.unref();await log.close();return send(202,{ok:true});
      }
      if(url.pathname==='/api/qr') {
        const service=project.services.find(s=>s.name===input.service);assert(service,'Unknown service');
        assert(typeof input.page==='string' && /^\/(?!\/)/.test(input.page),'Use a local page path');
        const target=new URL(input.page,service.origin);assert(target.origin===service.origin,'QR must remain on the selected origin');
        const {default:QR}=await import('qrcode');return send(200,{url:target.href,svg:await QR.toString(target.href,{type:'svg',margin:2})});
      }
      return send(404,{error:'Unknown action'});
    }catch(e){send(400,{error:e.message.startsWith('Unexpected')?'Invalid request':e.message});}
  });
  await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});
  console.log(`Universal Local Dev dashboard: ${publicOrigin}\nDirect diagnostic URL: ${origin}\nLoopback only. Close the dashboard without stopping independently supervised stacks.`);
  const stop=()=>{server.closeAllConnections();server.close();};process.once('SIGINT',stop);process.once('SIGTERM',stop);
  return server;
}
