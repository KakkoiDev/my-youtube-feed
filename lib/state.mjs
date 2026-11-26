// Shared wire format. Each entity or set member is updated independently.
export const defaults = () => ({channels:[],collections:['Japanese AI','English AI'],videos:[],watched:[],saved:[],preferences:{}});
const sets = ['collections','watched','saved'];
const entities = ['channels','videos'];
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function diff(before, after) {
  const ops=[];
  for (const field of sets) {
    for (const id of new Set([...(before[field]||[]),...(after[field]||[])])) {
      const old=(before[field]||[]).includes(id), value=(after[field]||[]).includes(id);
      if(old!==value) ops.push({field,id,before:old,value});
    }
  }
  for (const field of entities) {
    const a=new Map(before[field].map(x=>[x.id,x])), b=new Map(after[field].map(x=>[x.id,x]));
    for(const id of new Set([...a.keys(),...b.keys()])) {
      if(!equal(a.get(id),b.get(id))) ops.push({field,id,before:a.get(id)??null,value:b.get(id)??null});
    }
  }
  for(const id of new Set([...Object.keys(before.preferences||{}),...Object.keys(after.preferences||{})])) {
    const a=before.preferences?.[id]??null,b=after.preferences?.[id]??null;
    if(!equal(a,b)) ops.push({field:'preferences',id,before:a,value:b});
  }
  return ops;
}
export function apply(state, ops) {
  const next=structuredClone(state);
  if(!Array.isArray(ops)||ops.length>50000) throw Error('Invalid mutations');
  for(const op of ops) {
    if(!op||!['collections','watched','saved','channels','videos','preferences'].includes(op.field)||typeof op.id!=='string'||op.id.length>200||['__proto__','constructor','prototype'].includes(op.id)) throw Error('Invalid mutation');
    const {field,id,before,value}=op;
    if(sets.includes(field)) {
      if(typeof value!=='boolean'||typeof before!=='boolean') throw Error('Invalid membership');
      next[field]=next[field].filter(x=>x!==id);if(value)next[field].push(id);
    } else {
      const current=field==='preferences'?(next.preferences[id]??null):(next[field].find(x=>x.id===id)??null);
      if(!equal(current,before)&&!equal(current,value)) {const e=Error('This item changed on another device. Your pending changes are retained; export them before reloading.');e.status=409;throw e;}
      if(field==='preferences') {if(value===null)delete next.preferences[id];else next.preferences[id]=value;}
      else {if(value!==null&&(typeof value!=='object'||value.id!==id))throw Error('Invalid entity');next[field]=next[field].filter(x=>x.id!==id);if(value!==null)next[field].push(value);}
    }
  }
  validate(next);
  return next;
}
export function validate(s) {
  if(!s||Object.keys(s).some(k=>!Object.keys(defaults()).includes(k)))throw Error('Invalid state fields');
  for(const field of [...sets,...entities])if(!Array.isArray(s[field]))throw Error('Invalid state');
  if(!s.preferences||typeof s.preferences!=='object'||Array.isArray(s.preferences))throw Error('Invalid preferences');
  const vid=x=>typeof x==='string'&&/^[\w-]{11}$/.test(x);
  for(const field of ['watched','saved'])if(s[field].some(x=>!vid(x)))throw Error('Invalid video ID');
  if(s.collections.some(x=>typeof x!=='string'||!x||x.length>200))throw Error('Invalid collection');
  for(const c of s.channels)if(!c||typeof c.title!=='string'||!Number.isFinite(c.since)||!s.collections.includes(c.collection)||!['all','long','short-candidate'].includes(c.format)||!(c.kind==='playlist'?/^[\w-]{10,100}$/.test(c.id)&&c.uploads===c.id:/^UC[\w-]{22}$/.test(c.id)&&/^UU[\w-]{22}$/.test(c.uploads)))throw Error('Invalid subscription');
  for(const v of s.videos)if(!v||!vid(v.id)||typeof v.title!=='string'||!Number.isFinite(Date.parse(v.published))||!/^UC[\w-]{22}$/.test(v.channelId))throw Error('Invalid video');
  if(Object.keys(s.preferences).some(x=>!['filter','collection','unread','includeRestricted'].includes(x)))throw Error('Invalid preference');
  if(s.preferences.filter!==undefined&&!['all','long','short-candidate'].includes(s.preferences.filter))throw Error('Invalid filter');
  if(s.preferences.collection!==undefined&&typeof s.preferences.collection!=='string')throw Error('Invalid collection preference');
  for(const k of ['unread','includeRestricted'])if(s.preferences[k]!==undefined&&typeof s.preferences[k]!=='boolean')throw Error('Invalid preference');
  // No unknown object fields: in particular credentials must never enter state/backups.
  const channelFields=['id','kind','title','avatar','uploads','collection','format','since','paused'];
  const videoFields=['id','title','channelId','channelTitle','published','format','embeddable','playlists','playlistDates'];
  for(const [items,fields] of [[s.channels,channelFields],[s.videos,videoFields]])for(const item of items)if(Object.keys(item).some(k=>!fields.includes(k)))throw Error('Unexpected entity field');
  for(const field of [...sets,...entities])if(new Set(s[field].map(x=>typeof x==='object'?x.id:x)).size!==s[field].length)throw Error('Duplicate state entries');
}
