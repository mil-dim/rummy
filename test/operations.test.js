import {spawnSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestName,uniqueName,roomNames} from '../public/room-names.js';
import {diceStatistics} from '../lib/dice-statistics.js';
import {createDiceAudit} from '../lib/dice-audit.js';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('funny names are unique across case, spacing, normalization and exhausted pools',()=>{
 assert.equal(uniqueName(' Lucky   Table ',['lucky table']),'Lucky   Table 2');
 const used=[...roomNames.en];const next=suggestName(used,'en',()=>0);assert.equal(next,'One More Game 2');
 const long='a'.repeat(30);assert.equal(uniqueName(long,[long]).length,30);
 const names=[];for(let i=0;i<100;i++)names.push(suggestName(names,'bg',()=>0));assert.equal(new Set(names).size,100);
});
test('diagnostics distinguish balanced faces from repeating sequences',()=>{
 const stats=diceStatistics();for(let i=0;i<6000;i++)stats.add([i%6+1]);
 const r=stats.result();assert.deepEqual(r.faces,Array(6).fill(1000));assert.equal(r.faceTest.p,1);assert.ok(r.reviewFlags.some(f=>f.includes('lag 6')));
 const biased=diceStatistics();for(let i=0;i<1000;i++)biased.add([6,6]);assert.ok(biased.result().reviewFlags.includes('faces distribution'));
 biased.add([7]);assert.equal(biased.result().invalidRecords,1);
 const pairs=diceStatistics();for(let x=1;x<=6;x++)for(let y=1;y<=6;y++)pairs.add([x,y]);assert.equal(pairs.result().doubles,6);assert.equal(pairs.result().pairTest.p,1);
});
test('audit persists physical rolls without user identity and survives reopening',t=>{
 const dir=mkdtempSync(join(tmpdir(),'dice-audit-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const room={id:'ROOM',game:{gameNumber:2,variant:'gulbara',players:['secret-player','other']}};
 const audit=createDiceAudit(dir,'qa');audit.record(room,{id:1,kind:'turn',dice:[3,3],at:Date.now(),playerId:'secret-player'});
 const text=readFileSync(join(dir,readdirSync(dir)[0]),'utf8'),row=JSON.parse(text);
 assert.deepEqual(row.dice,[3,3]);assert.equal(row.side,0);assert.ok(!text.includes('secret-player'));assert.equal(audit.status().writtenThisBoot,1);
 assert.ok(createDiceAudit(dir,'qa').status().bytes>0);
 const checked=spawnSync(process.execPath,['scripts/dice-check.mjs','--audit-dir',dir],{encoding:'utf8'});assert.equal(checked.status,0);const report=JSON.parse(checked.stdout);assert.equal(report.twoDiceRolls,1);assert.equal(report.doubles,1);
});
