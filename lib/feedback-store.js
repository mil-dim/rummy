import {appendFile,chmod,mkdir,readdir,stat} from 'node:fs/promises';
import {join} from 'node:path';

const FILE_PATTERN=/^feedback-\d{4}-\d{2}\.jsonl$/;

async function existingBytes(directory){
 let names=[];
 try{names=await readdir(directory)}catch(error){if(error.code!=='ENOENT')throw error}
 const sizes=await Promise.all(names.filter(name=>FILE_PATTERN.test(name)).map(async name=>(await stat(join(directory,name))).size));
 return sizes.reduce((total,size)=>total+size,0);
}

export function createFeedbackStore({directory,now=()=>Date.now(),maxBytes=10*1024*1024}={}){
 if(!directory)return null;
 const ready=(async()=>{await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);return existingBytes(directory)})();
 let queue=Promise.resolve(),bytesPromise=ready;
 return record=>{
  const task=queue.catch(()=>{}).then(async()=>{
   let bytes=await bytesPromise;
   const date=new Date(now()),entry={v:1,at:date.toISOString(),...record};
   const line=JSON.stringify(entry)+'\n';
   const size=Buffer.byteLength(line);
   if(bytes+size>maxBytes)throw Error('Feedback storage limit reached. Export and clear old feedback.');
   const file=join(directory,`feedback-${date.toISOString().slice(0,7)}.jsonl`);
   await appendFile(file,line,{encoding:'utf8',mode:0o600,flag:'a'});
   bytes+=size;bytesPromise=Promise.resolve(bytes);
  });
  queue=task;
  return task;
 };
}

export {FILE_PATTERN};
