import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, open, realpath, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, atomic, available, hash, json, label, lock, manifest } from './core.mjs';
import { cleanEnv } from './environment.mjs';
import { control } from './supervisor.mjs';
const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const pause = ms => new Promise(r => setTimeout(r, ms));
const location = (root, name) => { assert(label(name) && name.length <= 25, 'Use an environment name of 1–25 lowercase letters, digits or hyphens'); return resolve(root, 'environments', name); };
async function git(path, ...args) {
  try { return (await exec('git', ['-C', path, ...args], { encoding:'utf8', maxBuffer:1024*1024, timeout:30000 })).stdout.trim(); }
  catch { throw new Error(`Git ${args[0]} failed in ${path}. Check the selected branch and local repository.`); }
}
async function branchTip(source, branch) {
  assert(typeof branch === 'string' && branch.length < 200 && !branch.startsWith('-'), 'Invalid branch');
  await git(source, 'check-ref-format', '--branch', branch);
  return git(source, 'rev-parse', '--verify', `refs/heads/${branch}^{commit}`);
}
// Next switches only this generated import between build and dev. Any other edit blocks.
async function cleanCheckout(repository) {
  const status=await git(repository.path,'status','--porcelain');
  if(!status) return false;
  if(repository.adapter==='marketing' && status==='M next-env.d.ts') {
    const original=(await exec('git',['-C',repository.path,'show','HEAD:next-env.d.ts'],{encoding:'utf8'})).stdout;
    const expected=original.replace('./.next/types/routes.d.ts','./.next/dev/types/routes.d.ts');
    if(expected!==original && await readFile(resolve(repository.path,'next-env.d.ts'),'utf8')===expected) return true;
  }
  throw new Error(`Checkout ${repository.name} has local changes; preserve them before retrying`);
}
export async function environments(root) {
  const parent = resolve(root, 'environments');
  const names = await readdir(parent, {withFileTypes:true}).catch(e => { if(e.code==='ENOENT') return []; throw e; });
  const entries = [];
  for (const entry of names.filter(e=>e.isDirectory())) {
    const row = await json(resolve(parent,entry.name,'environment.json'),null);
    if(row) entries.push(row);
  }
  return entries.sort((a,b)=>a.name.localeCompare(b.name));
}
async function save(root, row) { await atomic(resolve(location(root,row.name),'environment.json'),JSON.stringify(row,null,2)+'\n'); }

// Read-only source repositories; only committed local refs enter dedicated runtime clones.
export async function createEnvironment(root, host, input) {
  const directory = location(root,input.name);
  const sourceFile = resolve(input.file);
  const template = await json(sourceFile);
  const profile = input.profile || (template.services.some(s=>s.adapter==='simulator') ? 'simulator-source' : 'visual');
  await manifest(sourceFile,host,profile);
  const selected = template.services.filter(s=>!input.services || input.services.includes(s.name));
  assert(selected.length > 0 && selected.length <= 20,'Select 1–20 services');
  if(input.services) assert(input.services.length===selected.length,'Unknown or duplicate selected service');
  const repositories = [];
  for (const s of selected) {
    const source = await realpath(resolve(dirname(sourceFile),s.path));
    assert(await git(source,'rev-parse','--show-toplevel') === source,'Service path must be the repository root');
    const branch = input.branches?.[s.name] || input.branch || 'local-test';
    await branchTip(source,branch);
    const sourceGit=await git(source,'rev-parse','--path-format=absolute','--git-common-dir');
    repositories.push({name:s.name,adapter:s.adapter,source,sourceGit,branch,path:resolve(directory,'repos',s.name),commit:null,prepared:null});
  }
  return lock(root, async()=>{
    assert(!existsSync(resolve(directory,'environment.json')),'Environment name already exists');
    const taken = new Set();
    const projects = await json(resolve(root,'projects.json'),{manifests:[]});
    const registry = await json(resolve(root,'registry.json'),{stacks:{}});
    const existing = await environments(root);
    const files = new Set([...projects.manifests,...existing.map(e=>e.file),...Object.values(registry.stacks).map(s=>s.file)]);
    for (const file of files) {
      const m = await json(file,null); if(!m) continue;
      for (const s of m.services || []) {taken.add(s.port);taken.add(s.port+1);}
      taken.add(m.databasePort);taken.add(m.redisPort);
    }
    let base;
    for(let p=20000;p<59000;p+=100) {
      if(Array.from({length:100},(_,i)=>p+i).some(p=>taken.has(p))) continue;
      try {for(let i=0;i<selected.length;i++){await available(p+i*3);await available(p+i*3+1);}await available(p+90);await available(p+91);base=p;break;} catch {}
    }
    assert(base,'No free environment port block');
    for(const r of repositories) await mkdir(r.path,{recursive:true,mode:0o700});
    const m = {...template,name:input.name,services:selected.map((s,i)=>({...s,path:repositories[i].path,port:base+i*3})),databasePort:base+90,redisPort:base+91};
    if(m.parity) m.parity=m.parity.filter(p=>selected.some(s=>s.name===p.service));
    if(m.parity?.length<2) delete m.parity;
    const file = resolve(directory,'.local-dev.json');
    await atomic(file,JSON.stringify(m,null,2)+'\n');
    const parsed = await manifest(file,host,profile);
    assert(parsed.services.length,'Selected services do not support this runtime profile');
    const row = {version:1,name:input.name,id:parsed.id,file,profile,autoUpdate:input.autoUpdate!==false,desired:false,phase:'stopped',repositories,createdAt:new Date().toISOString(),appliedAt:null,error:null};
    await save(root,row);
    return row;
  });
}

async function installDependencies(repository, logfile) {
  const cwd=repository.path;
  if(!existsSync(resolve(cwd,'package.json'))) return;
  const pkg=await json(resolve(cwd,'package.json'));
  // Dependency-free static examples need no package manager.
  if(!Object.keys({...pkg.dependencies,...pkg.devDependencies,...pkg.optionalDependencies}).length) return;
  let argv;
  if(existsSync(resolve(cwd,'pnpm-lock.yaml'))) argv=['pnpm','install','--frozen-lockfile'];
  else if(existsSync(resolve(cwd,'package-lock.json'))) argv=['npm','ci','--no-audit','--no-fund'];
  else throw new Error(`Commit a pnpm-lock.yaml or package-lock.json for ${repository.name} before integration testing`);
  const output=await open(logfile,'a',0o600);
  try {
    const env={...await cleanEnv(cwd),CI:'true'};
    await new Promise((ok,fail)=>{
      const child=spawn(argv[0],argv.slice(1),{cwd,env,detached:true,stdio:['ignore',output.fd,output.fd]});
      const deadline=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},600000);
      child.once('error',e=>{clearTimeout(deadline);fail(e);});
      child.once('exit',(code,signal)=>{clearTimeout(deadline);code===0?ok():fail(new Error(`Dependency installation failed for ${repository.name} (${signal || 'exit '+code}); see ${logfile}`));});
    });
  } finally {await output.close();}
}
async function dependencyKey(path, commit) {
  const inputs=[];
  for(const file of ['package.json','package-lock.json','pnpm-lock.yaml','.npmrc','pnpm-workspace.yaml']) {
    try {inputs.push(await git(path,'rev-parse',`${commit}:${file}`));} catch {inputs.push('absent');}
  }
  return hash(inputs.join(':'));
}
export function environmentRuntime(root,host) {
  const active=async id=>(await json(resolve(root,'registry.json'),{stacks:{}})).stacks[id];
  return {
    async status(row) {const s=await active(row.id);if(!s)return 'stopped';const state=await control(s);return state.ready&&!state.stopping?'running':'starting';},
    async stop(row) {
      const s=await active(row.id);if(!s)return;
      await control(s,'down');
      const end=Date.now()+20000;
      while(await active(row.id)){assert(Date.now()<end,'Stack did not stop cleanly; use doctor/recover before retrying');await pause(100);}
    },
    async start(row) {
      assert(!await active(row.id),'Environment already has a supervisor; inspect status before retrying');
      const log=await open(resolve(location(root,row.name),'runtime.log'),'a',0o600);
      const child=spawn(process.execPath,[resolve(here,'cli.mjs'),'up','--manifest',row.file,'--profile',row.profile],{cwd:dirname(row.file),env:{...await cleanEnv(dirname(row.file)),LOCAL_DEV_STATE:root},detached:true,stdio:['ignore',log.fd,log.fd]});
      let failed=false;child.once('error',()=>{failed=true;});child.once('exit',()=>{failed=true;});child.unref();await log.close();
      const end=Date.now()+360000;
      while(Date.now()<end) {
        assert(!failed,`Environment startup failed; see ${resolve(location(root,row.name),'runtime.log')}`);
        const s=await active(row.id);
        if(s){try{const state=await control(s);if(state.ready&&!state.stopping)return;}catch{}}
        await pause(250);
      }
      await this.stop(row);
      throw new Error('Environment readiness timed out');
    }
  };
}
export class EnvironmentManager {
  constructor(root,host,options={}) {this.root=root;this.host=host;this.runtime=options.runtime||environmentRuntime(root,host);this.prepare=options.prepare||installDependencies;this.busy=new Set();}
  async operate(name,action,options={}) {
    if(action==='poll' && this.busy.has(name)) return;
    const queuedUntil=Date.now()+15000;
    while(this.busy.has(name)) {assert(Date.now()<queuedUntil,'Environment operation still in progress; retry when preparation finishes');await pause(25);}
    this.busy.add(name);
    try {return await lock(location(this.root,name),async()=>{
      const row=await json(resolve(location(this.root,name),'environment.json'));
      try {
        if(action==='pause') {row.autoUpdate=false;await save(this.root,row);return row;}
        if(action==='resume') {row.autoUpdate=true;await save(this.root,row);return row;}
        if(action==='stop') {row.desired=false;row.phase='stopping';await save(this.root,row);await this.runtime.stop(row);row.phase='stopped';row.error=null;await save(this.root,row);return row;}
        assert(['start','update','poll'].includes(action),'Unknown environment action');
        if(action==='poll' && (!row.desired || !row.autoUpdate || row.error)) return row;
        if(action==='start') row.desired=true;
        const configuration=await json(row.file);
        for(const r of row.repositories) r.adapter ||= configuration.services.find(s=>s.name===r.name)?.adapter;
        const targets=[];
        for(const r of row.repositories) {
          const commit=await branchTip(r.sourceGit || r.source,r.branch);
          if(r.commit && r.commit!==commit) {
            try {await git(r.sourceGit || r.source,'merge-base','--is-ancestor',r.commit,commit);}
            catch {throw new Error(`Branch ${r.branch} for ${r.name} no longer advances the tested commit. Preserve history or create a new environment; no forced update was performed`);}
          }
          const initialized=existsSync(resolve(r.path,'.git'));
          if(initialized) {
            await cleanCheckout(r);
            if(r.commit) assert(await git(r.path,'rev-parse','HEAD')===r.commit,`Checkout ${r.name} changed outside the environment manager`);
          }
          targets.push({...r,target:commit,initialized});
        }
        const changed=targets.some(r=>r.target!==r.commit || !r.prepared);
        const status=await this.runtime.status(row);
        if(!changed && action==='poll') {
          if(status!=='running'){row.phase=status;row.error='Environment stopped unexpectedly; inspect logs, then Start to retry';await save(this.root,row);}
          return row;
        }
        if(!changed && status==='running') {row.phase='running';row.error=null;await save(this.root,row);return row;}
        row.phase='updating';row.error=null;row.pending=targets.map(r=>({name:r.name,commit:r.target}));await save(this.root,row);
        // All refs are captured before taking down the group. Never publish a partial generation.
        await this.runtime.stop(row);
        for(const target of targets) {
          const r=row.repositories.find(r=>r.name===target.name);
          if(target.initialized && await cleanCheckout(r)) await git(r.path,'restore','--source=HEAD','--worktree','--','next-env.d.ts');
          if(!target.initialized) await git(r.path,'init','--quiet');
          await git(r.path,'fetch','--depth=1','--no-tags','--',r.sourceGit || r.source,target.target);
          await git(r.path,'checkout','--detach',target.target);
          // Persist actual checked-out identity for safe retry after partial preparation failure.
          r.commit=target.target;await save(this.root,row);
          const key=await dependencyKey(r.path,r.commit);
          if(r.prepared!==key) {await this.prepare(r,resolve(location(this.root,name),'prepare.log'));r.prepared=key;await save(this.root,row);}
          assert(!await git(r.path,'status','--porcelain'),`Preparation modified tracked files in ${r.name}; inspect the checkout before retrying`);
        }
        await manifest(row.file,this.host,row.profile);
        if(row.desired) await this.runtime.start(row);
        row.phase=row.desired?'running':'stopped';row.appliedAt=new Date().toISOString();row.applied=row.repositories.map(r=>({name:r.name,branch:r.branch,commit:r.commit}));delete row.pending;row.error=null;
        await save(this.root,row);return row;
      } catch(e) {row.phase='error';row.error=e.message;await save(this.root,row);throw e;}
    });} finally {this.busy.delete(name);}
  }
  watch(interval=3000) {
    let checking=false;
    const tick=async()=>{if(checking)return;checking=true;try {for(const row of await environments(this.root)) {if(!this.busy.has(row.name)) void this.operate(row.name,'poll').catch(()=>{});}}finally{checking=false;}};
    const timer=setInterval(()=>void tick(),interval);void tick();return ()=>clearInterval(timer);
  }
}
