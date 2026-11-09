import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const run=promisify(execFile);

test('feedback operator script exports records and clears only confirmed feedback files',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'tabletop-feedback-script-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const record={v:1,at:'2026-11-09T14:30:00.000Z',type:'rules',typeLabel:'Rules recommendation',name:'Milen',location:{scope:'lobby'},message:'Review this rule.'};
 await writeFile(join(directory,'feedback-2026-11.jsonl'),JSON.stringify(record)+'\n');
 await writeFile(join(directory,'keep.txt'),'must remain');
 const options={cwd:new URL('..',import.meta.url),env:{...process.env,FEEDBACK_DIR:directory}};

 const exported=await run(process.execPath,['scripts/feedback.mjs','export'],options);
 assert.deepEqual(JSON.parse(exported.stdout),[record]);
 await assert.rejects(()=>run(process.execPath,['scripts/feedback.mjs','clear'],options),error=>error.code===2&&/--confirm/.test(error.stderr));
 assert.ok((await readdir(directory)).includes('feedback-2026-11.jsonl'));

 const cleared=await run(process.execPath,['scripts/feedback.mjs','clear','--confirm'],options);
 assert.match(cleared.stdout,/Deleted 1 feedback file/);
 assert.deepEqual(await readdir(directory),['keep.txt']);
 assert.equal(await readFile(join(directory,'keep.txt'),'utf8'),'must remain');
});
