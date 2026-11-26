import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync,existsSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {defaults,validate} from '../lib/state.mjs';
const [source,dir]=process.argv.slice(2);
if(!dir||!source)throw Error('Usage: node tools/restore.mjs BACKUP.json NEW_EMPTY_DATA_DIR');
const state={...defaults(),...JSON.parse(readFileSync(source,'utf8'))};validate(state);
if(existsSync(dir))throw Error('Destination already exists. Restore to a new directory; existing personal data is never overwritten.');
process.umask(0o077);mkdirSync(dir,{recursive:true,mode:0o700});
const path=join(dir,'mytube.sqlite'),db=new DatabaseSync(path);chmodSync(path,0o600);
try {db.exec('CREATE TABLE state(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,body TEXT NOT NULL)');db.prepare('INSERT INTO state VALUES(1,0,?)').run(JSON.stringify(state));console.log('Restored into new directory. Configure the server key separately.');}finally{db.close()}
