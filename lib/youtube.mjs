const specs={channels:{part:'snippet,contentDetails',keys:['id','forHandle']},playlists:{part:'snippet,status',keys:['id']},playlistItems:{part:'contentDetails,snippet',keys:['playlistId','maxResults','pageToken']},videos:{part:'snippet,contentDetails,status',keys:['id']}};
export function youtubeURL(resource,params,key) {
  const spec=specs[resource];
  if(!spec||!params||typeof params!=='object'||Object.keys(params).some(k=>!['part',...spec.keys].includes(k))||params.part!==spec.part)throw Error('Unsupported YouTube operation');
  for(const [k,v] of Object.entries(params))if(typeof v!=='string'&&typeof v!=='number'||String(v).length>2000)throw Error('Invalid YouTube parameter');
  if(resource==='channels'&&(!params.id===!params.forHandle))throw Error('Choose a channel or handle');
  if(params.forHandle&&!/^@[\p{L}\p{N}_.\-·]{1,100}$/u.test(params.forHandle))throw Error('Invalid handle');
  if(params.id){const ids=params.id.split(',');if(ids.length>50||ids.some(id=>!(resource==='channels'?/^UC[\w-]{22}$/:resource==='videos'?/^[\w-]{11}$/:/^[\w-]{10,100}$/).test(id)))throw Error('Invalid ID');}
  if(resource!=='channels'&&resource!=='playlistItems'&&!params.id)throw Error('ID required');
  if(resource==='playlistItems'&&(!/^[\w-]{10,100}$/.test(params.playlistId)||params.maxResults!==50))throw Error('Invalid playlist request');
  if(params.pageToken&&!/^[\w=+\-/]{1,1000}$/.test(params.pageToken))throw Error('Invalid page token');
  const url=new URL('https://www.googleapis.com/youtube/v3/'+resource);url.search=new URLSearchParams({...params,key});return url;
}
