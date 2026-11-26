import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,renameSync,mkdirSync,chmodSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {defaults,apply} from './lib/state.mjs';
import {youtubeURL} from './lib/youtube.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export function createApp({dataDir,login,origin,upstream=fetch}) {
  if(!dataDir||!login||!origin)throw Error('Data directory, allowed Tailscale login and HTTPS origin are required');
  if(resolve(dataDir).startsWith(root+'/'))throw Error('Store private data outside the source directory');
  mkdirSync(dataDir,{recursive:true,mode:0o700});chmodSync(dataDir,0o700);
  const keyPath=join(dataDir,'youtube.key'),dbPath=join(dataDir,'mytube.sqlite');
  const db=new DatabaseSync(dbPath);chmodSync(dbPath,0o600);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO state VALUES(1,0,?)').run(JSON.stringify(defaults()));
  const token=randomBytes(32).toString('hex');
  const current=()=>{const r=db.prepare('SELECT * FROM state WHERE id=1').get();return {revision:r.revision,state:JSON.parse(r.body)}};
  const configured=()=>existsSync(keyPath)&&readFileSync(keyPath,'utf8').trim().length>0;
  let inflight=0, requests=[];
  const send=(res,code,data,type='application/json')=>{res.writeHead(code,{'Content-Type':type});res.end(type==='application/json'?JSON.stringify(data):data)};
  const body=async req=>{if(!String(req.headers['content-type']).startsWith('application/json'))throw Error('JSON required');let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>16*1024*1024){const e=Error('Request too large');e.status=413;throw e;}}return JSON.parse(text)};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' https://i.ytimg.com https://yt3.ggpht.com https://yt3.googleusercontent.com; connect-src 'self'; frame-src https://www.youtube-nocookie.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if(req.headers['tailscale-user-login']!==login)return send(res,403,{error:'Connect through your authorized Tailscale account.'});
    const path=new URL(req.url,'http://localhost').pathname;
    try {
      if(req.method!=='GET') {
        if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
        const supplied=String(req.headers['x-mytube-token']||'');
        if(req.headers.origin!==origin||supplied.length!==token.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token)))return send(res,403,{error:'Invalid request origin or CSRF token. Reload the app.'});
      }
      if(req.method==='GET'&&path==='/health')return send(res,200,{status:'ok',storage:'sqlite'});
      if(req.method==='GET'&&path==='/api/state')return send(res,200,{...current(),keyConfigured:configured(),token});
      if(req.method==='GET'&&path==='/api/backup') {res.setHeader('Content-Disposition','attachment; filename="mytube-backup.json"');return send(res,200,current().state);}
      if(req.method==='POST'&&path==='/api/mutate') {
        const {ops}=await body(req);const old=current(),next=apply(old.state,ops);
        db.prepare('UPDATE state SET revision=?,body=? WHERE id=1').run(old.revision+1,JSON.stringify(next));
        return send(res,200,{revision:old.revision+1,state:next,keyConfigured:configured()});
      }
      if(req.method==='POST'&&path==='/api/key') {
        const {key,replace}=await body(req);
        if(typeof key!=='string'||!/^[A-Za-z0-9_-]{20,200}$/.test(key))throw Error('Invalid API key format');
        if(configured()&&replace!==true){const e=Error('A key is already configured. Confirm replacement first.');e.status=409;throw e;}
        writeFileSync(keyPath+'.new',key,{mode:0o600});chmodSync(keyPath+'.new',0o600);renameSync(keyPath+'.new',keyPath);
        return send(res,200,{keyConfigured:true});
      }
      if(req.method==='POST'&&path==='/api/youtube') {
        const {resource,params}=await body(req);
        if(!configured()){const e=Error('Configure your YouTube API key in Settings first.');e.status=428;throw e;}
        const url=youtubeURL(resource,params,readFileSync(keyPath,'utf8').trim());
        requests=requests.filter(t=>Date.now()-t<60000);
        if(requests.length>=120||inflight>=4){const e=Error('Too many requests. Please wait before refreshing again.');e.status=429;throw e;}
        requests.push(Date.now());inflight++;
        try {
          const response=await upstream(url,{signal:AbortSignal.timeout(20000)}),data=await response.json();
          if(!response.ok){const reason=data.error?.errors?.[0]?.reason;return send(res,response.status,{error:reason==='quotaExceeded'?'YouTube quota exhausted. Try again after the daily reset.':response.status===400||response.status===403?'YouTube rejected the request. Check the API key, API enablement and server IP restrictions.':'YouTube request failed. Try again later.'});}
          return send(res,200,data);
        } catch {return send(res,502,{error:'YouTube is unreachable or timed out. Try again later.'});} finally {inflight--;}
      }
      if(req.method==='GET'&&path==='/runtime.mjs')return send(res,200,'export default {mode:"server"};','text/javascript');
      const files={'/':'index.html','/index.html':'index.html','/app.mjs':'app.mjs','/storage.mjs':'storage.mjs','/lib/state.mjs':'lib/state.mjs','/lib/import.mjs':'lib/import.mjs'};
      if(req.method==='GET'&&files[path])return send(res,200,readFileSync(join(root,files[path])),path.endsWith('.mjs')?'text/javascript':'text/html');
      return send(res,404,{error:'Not found'});
    } catch(e) {return send(res,e.status||400,{error:e.status===409?e.message:'Invalid request. '+(e.message.startsWith('Invalid')||e.message.startsWith('Unsupported')||e.message.startsWith('Unexpected')?e.message:'Check the submitted data.')});}
  });
  server.requestTimeout=30000;server.headersTimeout=10000;
  server.on('close',()=>db.close());return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const configPath=process.argv[2]||process.env.MYTUBE_CONFIG;
  const config=configPath?JSON.parse(readFileSync(configPath,'utf8')):{};
  const server=createApp({dataDir:config.dataDir||process.env.MYTUBE_DATA_DIR,login:config.login||process.env.TAILSCALE_LOGIN,origin:config.origin||process.env.MYTUBE_ORIGIN});
  const port=Number(config.port||process.env.PORT||8768);
  server.listen(port,'127.0.0.1',()=>console.log('MyTube listening on loopback port '+port));
  for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),4000).unref()});
}
