import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const [dir,destination]=process.argv.slice(2);
if(!dir||!destination)throw Error('Usage: node tools/backup.mjs DATA_DIR NEW_BACKUP.json');
const db=new DatabaseSync(join(dir,'mytube.sqlite'),{readOnly:true});
try {const row=db.prepare('SELECT body FROM state WHERE id=1').get();if(!row)throw Error('State not found');writeFileSync(destination,row.body+'\n',{mode:0o600,flag:'wx'});console.log('Backup written (API key excluded).');}finally{db.close()}
