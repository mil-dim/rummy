import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFeedbackStore} from '../lib/feedback-store.js';

test('feedback store appends private monthly JSONL records without identity or IP fields',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tabletop-feedback-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const store=createFeedbackStore({directory,now:()=>Date.UTC(2026,10,9,14,30)});
 await store({type:'rules',name:'Milen',signedIn:false,location:{scope:'lobby'},message:'Please clarify the rule.'});
 await store({type:'opinion',name:'Guest',signedIn:true,location:{scope:'room',id:'ABC'},message:'This works well.'});
 assert.deepEqual(await readdir(directory),['feedback-2026-11.jsonl']);
 const lines=(await readFile(join(directory,'feedback-2026-11.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.equal(lines.length,2);assert.equal(lines[0].v,1);assert.equal(lines[0].at,'2026-11-09T14:30:00.000Z');
 assert.equal(lines[0].message,'Please clarify the rule.');
 assert.doesNotMatch(JSON.stringify(lines),/ip|playerId|token/i);
});

test('feedback store has a hard size cap and disabled mode',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tabletop-feedback-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 assert.equal(createFeedbackStore(),null);
 const store=createFeedbackStore({directory,maxBytes:80,now:()=>Date.UTC(2026,10,9)});
 await assert.rejects(()=>store({message:'This record cannot fit inside eighty bytes.'}),/storage limit reached/);
 assert.deepEqual(await readdir(directory),[]);
});
