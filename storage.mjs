import runtime from './runtime.mjs';
import {defaults,diff,apply} from './lib/state.mjs';
export async function openStorage() {
  const server=runtime.mode==='server';
  let token='',base,revision=0,keyConfigured=false,db;
  async function request(path,data,retried=false) {
    let r;try{r=await fetch(path,data===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json','X-MyTube-Token':token},body:JSON.stringify(data)});}catch{throw Error('Cannot reach MyTube. Your pending changes remain in this tab; export a backup before closing.');}
    let d;try{d=await r.json()}catch{throw Error('MyTube is temporarily unavailable. Try again after it restarts; export pending changes before closing this tab.')}if(r.status===403&&data!==undefined&&!retried&&d.error?.startsWith('Invalid request origin or CSRF token')){const fresh=await request('./api/state');token=fresh.token;return request(path,data,true)}if(!r.ok)throw Error(d.error||'Request failed');return d;
  }
  async function remote() {const d=await request('./api/state');token=d.token;revision=d.revision;keyConfigured=d.keyConfigured;return d.state;}
  if(server)base=await remote();
  else {
    db=await new Promise((ok,fail)=>{const r=indexedDB.open('mytube',1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error)});
    base=await new Promise((ok,fail)=>{const r=db.transaction('data').objectStore('data').get('state');r.onsuccess=()=>ok(r.result||defaults());r.onerror=()=>fail(r.error)});
  }
  base={...defaults(),...base};
  let state=structuredClone(base), chain=Promise.resolve(), pending=0;
  const store={server,state,key:server?'':localStorage.getItem('mytube-key')||'',get keyConfigured(){return server?keyConfigured:!!store.key},onchange:null,
    async save() {
      pending++;
      const run=chain.catch(()=>{}).then(async()=>{
        const snapshot=structuredClone(store.state);
        if(server){const ops=diff(base,snapshot);if(!ops.length)return;const d=await request('./api/mutate',{ops});const later=diff(snapshot,store.state);base=d.state;revision=d.revision;store.state=apply(base,later);}
        else {await new Promise((ok,fail)=>{const t=db.transaction('data','readwrite');t.objectStore('data').put(snapshot,'state');t.oncomplete=ok;t.onerror=()=>fail(t.error);t.onabort=()=>fail(t.error)});base=snapshot;}
        store.onchange?.();
      });chain=run;try{await run}finally{pending--}
    },
    async sync(){if(!server||pending||diff(base,store.state).length)return false;const old=revision,next=await remote();if(old!==revision){base=next;store.state=structuredClone(next);store.onchange?.();return true}return false;},
    async setKey(value,replace=false){if(server){const d=await request('./api/key',{key:value,replace});keyConfigured=d.keyConfigured;}else{localStorage.setItem('mytube-key',value);store.key=value;}},
    async api(resource,params){if(server)return request('./api/youtube',{resource,params});if(!store.key)throw Error('Add your YouTube API key in Settings first.');const q=new URLSearchParams({...params,key:store.key});const r=await fetch('https://www.googleapis.com/youtube/v3/'+resource+'?'+q),d=await r.json();if(!r.ok)throw Error(d.error?.message||'YouTube request failed');return d;}
  };return store;
}
