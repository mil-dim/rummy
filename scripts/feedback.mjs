#!/usr/bin/env node
import {readFile,readdir,stat,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {FILE_PATTERN} from '../lib/feedback-store.js';

const command=process.argv[2]||'list';
const directory=process.env.FEEDBACK_DIR||'/data/feedback';

async function files(){
 try{return (await readdir(directory)).filter(name=>FILE_PATTERN.test(name)).sort()}
 catch(error){if(error.code==='ENOENT')return [];throw error}
}

async function entries(names){
 const all=[];
 for(const name of names){
  const text=await readFile(join(directory,name),'utf8');
  for(const line of text.split('\n').filter(Boolean)){
   try{all.push(JSON.parse(line))}catch{all.push({at:null,type:'invalid',name:'Unknown',message:`Unreadable record in ${name}`})}
  }
 }
 return all;
}

const names=await files();
if(command==='status'){
 const sizes=await Promise.all(names.map(async name=>(await stat(join(directory,name))).size));
 console.log(JSON.stringify({directory,files:names.length,entries:(await entries(names)).length,bytes:sizes.reduce((sum,size)=>sum+size,0)},null,2));
}else if(command==='export'){
 console.log(JSON.stringify(await entries(names),null,2));
}else if(command==='list'){
 const records=await entries(names);
 if(!records.length)console.log('No saved feedback.');
 for(const item of records){
  const location=item.location?.scope==='room'?`${item.location.name} (${item.location.id}, ${item.location.gameType}, ${item.location.state})`:'Lobby';
  console.log(`${item.at||'Unknown time'} | ${item.name||'Player'} | ${item.typeLabel||item.type||'feedback'} | ${location}`);
  console.log(item.message||'');
  console.log('');
 }
}else if(command==='clear'){
 if(!process.argv.includes('--confirm')){
  console.error('Refusing to delete feedback without --confirm. Export it first if it should be retained.');
  process.exitCode=2;
 }else{
  for(const name of names)await unlink(join(directory,name));
  console.log(`Deleted ${names.length} feedback file(s) from ${directory}.`);
 }
}else{
 console.error('Usage: node scripts/feedback.mjs [list|status|export|clear --confirm]');
 process.exitCode=2;
}
