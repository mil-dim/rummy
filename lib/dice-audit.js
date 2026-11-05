import {appendFileSync,mkdirSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export function createDiceAudit(directory,environment){
 const boot=randomUUID();let written=0,failures=0,lastError=null;
 if(directory)mkdirSync(directory,{recursive:true,mode:0o700});
 return {
  record(room,entry){
   if(!directory)return;
   const row={v:1,boot,environment,room:room.id,game:room.game.gameNumber,variant:room.game.variant,side:room.game.players.indexOf(entry.playerId),id:entry.id,kind:entry.kind,dice:entry.dice,at:entry.at};
   try{appendFileSync(join(directory,new Date(entry.at).toISOString().slice(0,10)+'.jsonl'),JSON.stringify(row)+'\n',{mode:0o600});written++;lastError=null}
   catch(error){failures++;lastError=error.code||'WRITE_FAILED';console.error('Dice audit write failed:',lastError)}
  },
  status(){return {enabled:Boolean(directory),directory:directory||null,writtenThisBoot:written,failures,lastError,
   bytes:directory?readdirSync(directory).filter(f=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).reduce((sum,f)=>sum+statSync(join(directory,f)).size,0):0}}
 };
}
