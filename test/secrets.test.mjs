import test from 'node:test';
import assert from 'node:assert/strict';
import { sync } from '../src/secrets-sync.mjs';
const plan={version:1,projectUUID:'project-123',environment:'staging',environmentUUID:'environment-123',applicationUUID:'application-123',apiOrigin:'https://coolify.example.test',keys:[{key:'AUTH_SECRET',reference:'op://example-staging/marketing/AUTH_SECRET',is_buildtime:false,is_runtime:true,is_literal:true,is_multiline:true}]};
const selection={environment:'staging',applicationUUID:'application-123'};
test('default dry run is offline, names-only, no provider or credentials',async()=>{
  const out=await sync(plan,selection,{provider:{resolve(){throw Error('must not resolve');}},fetcher(){throw Error('must not fetch');}});
  assert.deepEqual(out,{environment:'staging',applicationUUID:'application-123',keys:['AUTH_SECRET'],applied:false});
});
test('explicit sync checks remote identity and preserves exact multiline/literal values and flags',async()=>{
  const calls=[];const secret='first\nsecond $VALUE "literal"\n';
  const out=await sync(plan,selection,{apply:true,token:'fake-token',provider:{async resolve(){return secret;}},fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({uuid:plan.environmentUUID,name:'staging',applications:[{uuid:plan.applicationUUID}]})};}});
  assert.equal(out.applied,true);assert.equal(calls.length,2);assert.match(calls[0].url,/\/projects\/project-123\/environment-123$/);assert.match(calls[1].url,/\/envs\/bulk$/);assert.equal(calls[1].options.method,'PATCH');
  const data=JSON.parse(calls[1].options.body).data;assert.equal(data.length,1);assert.equal(data[0].value,secret);assert.equal(data[0].is_literal,true);assert.equal(data[0].is_buildtime,false);assert.equal(data[0].is_runtime,true);assert.equal(data[0].is_preview,false);assert.ok(!JSON.stringify(out).includes(secret));
});
test('wrong selected or remote environment refuses writes and redacts provider failures',async()=>{
  await assert.rejects(sync(plan,{...selection,environment:'production'}),/exact/);
  await assert.rejects(sync(plan,selection,{apply:true,token:'x',fetcher:async()=>({ok:true,json:async()=>({uuid:'other'})})}),/identity/);
  await assert.rejects(sync(plan,selection,{apply:true,token:'x',fetcher:async()=>({ok:true,json:async()=>({uuid:plan.environmentUUID,name:'staging',applications:[{uuid:plan.applicationUUID}]})}),provider:{resolve(){throw Error('SECRET-VALUE');}}}),e=>!e.message.includes('SECRET-VALUE') && e.message.includes('redacted'));
});
