import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,statSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {defaults,diff,apply} from '../lib/state.mjs';
import {youtubeURL} from '../lib/youtube.mjs';
const channel={id:'UC'+'a'.repeat(22),uploads:'UU'+'a'.repeat(22),title:'Example',collection:'Japanese AI',format:'all',since:0,paused:false};
test('independent stale-client mutations merge; conflicting edits reject atomically',()=>{
  const base=defaults();base.channels.push(channel);
  const a=structuredClone(base),b=structuredClone(base);a.channels[0].paused=true;b.saved.push('abcdefghijk');
  const merged=apply(apply(base,diff(base,a)),diff(base,b));assert.equal(merged.channels[0].paused,true);assert.deepEqual(merged.saved,b.saved);
  b.channels[0].title='Renamed';assert.throws(()=>apply(merged,diff(base,b)),{status:409});assert.equal(merged.channels[0].title,'Example');
  assert.throws(()=>apply(base,[{field:'preferences',id:'__proto__',value:{}}]));
});
test('API allowlist rejects proxy URLs and arbitrary parameters',()=>{
  for(const [r,p] of [['https://example.org',{}],['search',{}],['videos',{part:'snippet,contentDetails,status',id:'abcdefghijk',url:'https://example.org'}]])assert.throws(()=>youtubeURL(r,p,'secret'));
  assert.equal(youtubeURL('channels',{part:'snippet,contentDetails',forHandle:'@Google'},'secret').hostname,'www.googleapis.com');
});
test('HTTP authentication, CSRF, secret isolation, mutation, backup and restart persistence',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'mytube-test-')),origin='https://private.example';let calls=0;
  const options={dataDir:dir,login:'test@login',origin,upstream:async url=>{calls++;assert.equal(url.hostname,'www.googleapis.com');assert.equal(url.searchParams.get('key'),'test-key-abcdefghijklmnopqrstuvwxyz');return new Response(JSON.stringify({items:[]}));}};
  let server;
  async function start(){server=createApp(options);server.listen(0,'127.0.0.1');await once(server,'listening');return 'http://127.0.0.1:'+server.address().port;}
  async function close(){await new Promise(ok=>server.close(ok));}
  let url=await start();t.after(async()=>{if(server.listening)await close();rmSync(dir,{recursive:true,force:true});});
  const get=path=>fetch(url+path,{headers:{'Tailscale-User-Login':'test@login'}});
  assert.equal((await fetch(url+'/api/state')).status,403);
  assert.equal((await fetch(url+'/')).status,403);
  const initial=await (await get('/api/state')).json();assert.equal(initial.keyConfigured,false);
  const post=(path,data,extra={})=>fetch(url+path,{method:'POST',headers:{'Tailscale-User-Login':'test@login',Origin:origin,'Content-Type':'application/json','X-MyTube-Token':initial.token,...extra},body:JSON.stringify(data)});
  assert.equal((await post('/api/key',{key:'test-key-abcdefghijklmnopqrstuvwxyz'},{Origin:'https://attacker.example'})).status,403);
  assert.equal((await post('/api/key',{key:'test-key-abcdefghijklmnopqrstuvwxyz'},{'X-MyTube-Token':''})).status,403);
  assert.equal((await post('/api/key',{key:'test-key-abcdefghijklmnopqrstuvwxyz'})).status,200);
  assert.equal(statSync(join(dir,'youtube.key')).mode&0o777,0o600);
  assert.equal((await post('/api/key',{key:'test-key-abcdefghijklmnopqrstuvwxyz'})).status,409);
  const a=defaults(),b=defaults();a.channels.push(channel);b.saved.push('abcdefghijk');
  assert.equal((await post('/api/mutate',{ops:diff(defaults(),a)})).status,200);
  assert.equal((await post('/api/mutate',{ops:diff(defaults(),b)})).status,200);
  const c=defaults(),d=defaults();c.watched.push('lmnopqrstuv');d.saved.push('01234567890');
  const concurrent=await Promise.all([post('/api/mutate',{ops:diff(defaults(),c)}),post('/api/mutate',{ops:diff(defaults(),d)})]);assert(concurrent.every(r=>r.status===200));
  const simultaneous=await(await get('/api/state')).json();assert(simultaneous.state.watched.includes('lmnopqrstuv'));assert(simultaneous.state.saved.includes('01234567890'));
  const backup=await (await get('/api/backup')).text();assert(!backup.includes('test-key-'));assert.equal(JSON.parse(backup).channels.length,1);assert.deepEqual(JSON.parse(backup).saved,['abcdefghijk','01234567890']);
  for(const path of ['/youtube.key','/mytube.sqlite','/server.mjs','/.git/config','/../youtube.key'])assert.equal((await get(path)).status,404);
  assert.equal((await post('/api/youtube',{resource:'http://example.org',params:{}})).status,400);assert.equal(calls,0);
  assert.equal((await post('/api/youtube',{resource:'videos',params:{part:'snippet,contentDetails,status',id:'abcdefghijk'}})).status,200);assert.equal(calls,1);
  const response=await (await get('/api/state')).text();assert(!response.includes('test-key-'));assert.equal(JSON.parse(response).keyConfigured,true);
  assert(!readFileSync(join(dir,'mytube.sqlite')).includes(Buffer.from('test-key-')));
  await close();url=await start();const restored=await (await get('/api/state')).json();assert.equal(restored.state.channels.length,1);assert.deepEqual(restored.state.saved,['abcdefghijk','01234567890']);assert.equal(restored.keyConfigured,true);
});
test('import merges without replacing personal entries and reports rejected data',async()=>{
  const {mergeBackup}=await import('../lib/import.mjs');const base=defaults();base.channels.push(channel);base.watched.push('abcdefghijk');
  const imported={channels:[{...channel,title:'Do not replace existing'}, {id:'bad'}],collections:['Japanese AI'],watched:['lmnopqrstuv','invalid'],saved:['abcdefghijk']};
  const result=mergeBackup(base,imported);assert.equal(result.state.channels[0].title,'Example');assert.deepEqual(result.state.watched,['abcdefghijk','lmnopqrstuv']);assert.deepEqual(result.state.saved,['abcdefghijk']);assert.equal(result.rejected,2);assert.equal(base.saved.length,0);
});
