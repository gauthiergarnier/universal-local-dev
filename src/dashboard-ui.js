const token=document.querySelector('meta[name=local-token]').content;
const message=document.querySelector('#message');
let selected, currentState;
async function api(path,data) {
  const response=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{authorization:'Bearer '+token,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
  const out=await response.json();if(!response.ok)throw Error(out.error);return out;
}
function el(tag,className,text) {const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
async function action(button,fn) {button.disabled=true;message.textContent='';try{await fn();await refresh();}catch(e){message.textContent=e.message;}finally{button.disabled=false;}}
function button(text,fn,disabled=false,primary=false) {const b=el('button','button'+(primary?' primary':''),text);b.disabled=disabled;b.addEventListener('click',()=>action(b,fn));return b;}
async function qr() {
  const out=await api('qr',{id:selected.project.id,service:selected.service.name,page:document.querySelector('#qr-page').value});
  document.querySelector('#qr-image').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(out.svg);document.querySelector('#qr-url').textContent=out.url;
}
function serviceRows(project,managed=false) {
  const rows=el('div','services');
  for(const service of project.services) {
    const row=el('div','service');const name=el('div','service-name',service.name);name.append(el('span','adapter',service.adapter+' · :'+service.port));
    const identity=el('div','identity');const link=el('a','',service.origin);
    link.href=service.origin+(service.adapter==='simulator'?'/simulator/':service.adapter==='app'&&project.profile!=='integration'?'/pins.html':'/');link.target='_blank';link.rel='noreferrer';
    const branch=managed?service.branch:service.identity.branch;const commit=managed?service.commit:service.identity.commit;
    identity.append(link,el('div','branch',branch+' · '+(commit||'awaiting first update').slice(0,commit?9:30)+(!managed&&service.identity.dirty?' · modified':'')));
    row.append(name,identity,button('QR ↗',async()=>{selected={project,service};document.querySelector('#qr-page').value=new URL(link.href).pathname;await qr();document.querySelector('#qr-dialog').showModal();}));rows.append(row);
  }
  return rows;
}
function cardHead(name,subtitle,status) {const head=el('div','card-head');const title=el('div');title.append(el('h3','',name),el('div','project',subtitle));head.append(title,el('span','badge '+(status==='running'?'running':''),status));return head;}
function renderEnvironments(state) {
  const cards=document.querySelector('#environments');cards.replaceChildren();
  if(!state.environments.length)cards.append(el('div','card empty','Create local-test to review committed changes from several repositories at one stable address. Agent previews remain independent.'));
  for(const env of state.environments) {
    const card=el('article','card integration-card');
    const status=env.busy?env.status==='stopped'?'preparing':env.status:env.status==='running'?env.runtime:env.status;
    card.append(cardHead(env.name,'USER TESTING · '+env.profile+' runtime',status),serviceRows(env,true));
    const summary=el('div','environment-summary');
    summary.append(el('span','',env.autoUpdate?'Auto-update on · watches local branch commits':'Auto-update paused'));
    summary.append(el('span','',env.appliedAt?'Last applied '+new Date(env.appliedAt).toLocaleString():'No complete version applied yet'));
    card.append(summary);
    if(env.error)card.append(el('p','environment-error',env.error));
    const controls=el('div','controls');
    controls.append(button(env.desired?'Stop environment':'Start environment',()=>api(env.desired?'env-stop':'env-start',{name:env.name}),env.busy,!env.desired));
    controls.append(button('Update now',()=>api('env-update',{name:env.name}),env.busy));
    controls.append(button(env.autoUpdate?'Pause updates':'Resume updates',()=>api(env.autoUpdate?'env-pause':'env-resume',{name:env.name}),env.busy));
    card.append(controls);cards.append(card);
  }
}
function renderPreviews(state) {
  const cards=document.querySelector('#cards');cards.replaceChildren();
  if(!state.projects.length)cards.append(el('div','card empty','Register an agent worktree with local-dev setup, then refresh.'));
  for(const project of state.projects) {
    const card=el('article','card');card.append(cardHead(project.name,project.project||project.file,project.status),serviceRows(project));
    if(project.id) {
      const controls=el('div','controls');const profile=el('select');profile.setAttribute('aria-label','Profile for '+project.name);
      for(const [value,label] of [['visual','Visual'],['integration','Local data & auth'],['simulator-source','Simulator source']]) {const option=el('option','',label);option.value=value;profile.append(option);}profile.value=project.profile;
      controls.append(profile,button(project.status==='running'?'Stop stack':project.status==='stopped'?'Start stack':'Check status',()=>api(project.status==='running'?'stop':'start',{id:project.id,profile:profile.value}),!['running','stopped'].includes(project.status),project.status==='stopped'),el('span','path',project.file));card.append(controls);
    }
    cards.append(card);
  }
}
async function refresh() {
  try {
    const state=await api('status');currentState=state;
    document.querySelector('#running').textContent=state.projects.filter(p=>p.status==='running').length+state.environments.filter(e=>e.runtime==='running').length;
    document.querySelector('#projects').textContent=state.environments.length;document.querySelector('#namespace').textContent=state.namespace;
    renderEnvironments(state);renderPreviews(state);
  }catch(e){message.textContent=e.message;}
}
function populateServices() {
  const project=currentState.projects.find(p=>p.id===document.querySelector('#env-source').value);
  const rows=document.querySelector('#env-repositories');rows.replaceChildren();
  for(const service of project?.catalog||[]) {
    const row=el('label','repository-choice');const check=el('input');check.type='checkbox';check.checked=true;check.dataset.service=service.name;check.setAttribute('aria-label','Include '+service.name);
    const branch=el('input');branch.value='local-test';branch.required=true;branch.dataset.branch=service.name;branch.setAttribute('aria-label','Branch for '+service.name);
    row.append(check,el('span','',service.name),branch);rows.append(row);
  }
  document.querySelector('#env-profile').value=project?.catalog.some(s=>s.adapter==='simulator')?'simulator-source':'visual';
}
document.querySelector('#new-environment').addEventListener('click',()=>{
  const source=document.querySelector('#env-source');source.replaceChildren();
  for(const project of currentState?.projects||[])if(project.id){const option=el('option','',project.name+' · '+project.project);option.value=project.id;source.append(option);}
  if(!source.options.length){message.textContent='Register a source worktree first with local-dev setup.';return;}
  populateServices();document.querySelector('#env-error').textContent='';document.querySelector('#environment-dialog').showModal();
});
document.querySelector('#env-source').addEventListener('change',populateServices);
document.querySelector('#environment-form').addEventListener('submit',async event=>{
  event.preventDefault();const submit=document.querySelector('#env-submit');submit.disabled=true;
  const services=[...document.querySelectorAll('[data-service]:checked')].map(n=>n.dataset.service);
  const branches=Object.fromEntries([...document.querySelectorAll('[data-branch]')].map(n=>[n.dataset.branch,n.value.trim()]));
  try {
    await api('env-create',{name:document.querySelector('#env-name').value.trim(),sourceId:document.querySelector('#env-source').value,profile:document.querySelector('#env-profile').value,services,branches});
    document.querySelector('#environment-dialog').close();await refresh();
  }catch(e){document.querySelector('#env-error').textContent=e.message;}finally{submit.disabled=false;}
});
document.querySelector('#env-cancel').addEventListener('click',()=>document.querySelector('#environment-dialog').close());
document.querySelector('#refresh').addEventListener('click',refresh);
document.querySelector('#qr-close').addEventListener('click',()=>document.querySelector('#qr-dialog').close());
document.querySelector('#qr-form').addEventListener('submit',e=>{e.preventDefault();qr().catch(e=>message.textContent=e.message);});
refresh();setInterval(()=>{if(![...document.querySelectorAll('dialog')].some(d=>d.open)&&!['SELECT','INPUT'].includes(document.activeElement?.tagName))refresh();},3000);
