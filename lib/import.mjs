import {defaults,validate} from './state.mjs';
export function mergeBackup(current,data) {
  if(!data||!Array.isArray(data.channels)||!Array.isArray(data.collections))throw Error('Invalid backup: channels and collections are required.');
  const state=structuredClone(current);let rejected=0,added=0;
  for(const c of data.collections)if(typeof c==='string'&&c&&c!=='All'&&c.length<=200){if(!state.collections.includes(c))state.collections.push(c)}else rejected++;
  for(const [field,items] of [['channels',data.channels],['videos',data.videos||[]]]) {
    if(!Array.isArray(items))throw Error('Invalid backup '+field);
    for(const item of items) {
      if(!item||typeof item!=='object'){rejected++;continue}
      if(state[field].some(x=>x.id===item.id))continue;
      const trial=structuredClone(state);trial[field].push(item);
      try{validate(trial);state[field].push(item);added++}catch{rejected++}
    }
  }
  for(const field of ['saved','watched']) {
    if(data[field]!==undefined&&!Array.isArray(data[field]))throw Error('Invalid backup '+field);
    for(const id of data[field]||[])if(typeof id==='string'&&/^[\w-]{11}$/.test(id)){if(!state[field].includes(id))state[field].push(id)}else rejected++;
  }
  if(data.preferences&&!Object.keys(state.preferences||{}).length){const trial={...state,preferences:data.preferences};try{validate(trial);state.preferences=structuredClone(data.preferences)}catch{rejected++}}
  validate({...defaults(),...state});return {state,rejected,added};
}
