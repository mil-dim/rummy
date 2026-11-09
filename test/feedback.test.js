import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedbackService} from '../lib/feedback.js';

const submission=(overrides={})=>({playerId:'player-1',ip:'203.0.113.8',name:'Milen',account:null,
 type:'rules',message:'Please clarify this particular table rule.',website:'',...overrides});

test('feedback delivers a structured contextual record without retaining or including the IP',async()=>{
 const delivered=[];
 const service=createFeedbackService({environment:'web-qa',version:'1.0.26',deliver:record=>delivered.push(record)});
 assert.equal(service.configured,true);
 assert.deepEqual(await service.submit(submission({room:{id:'ROOM1234',name:'Evening game',gameType:'rummy',game:true}})),{ok:true});
 assert.equal(delivered.length,1);
 assert.deepEqual(delivered[0].location,{scope:'room',name:'Evening game',id:'ROOM1234',gameType:'rummy',state:'in progress'});
 assert.equal(delivered[0].typeLabel,'Rules recommendation');
 assert.equal(delivered[0].message,'Please clarify this particular table rule.');
 assert.equal(delivered[0].environment,'web-qa');
 assert.equal(delivered[0].version,'1.0.26');
 assert.doesNotMatch(JSON.stringify(delivered[0]),/203\.0\.113\.8|player-1/);
});

test('feedback validates type and message and silently drops honeypot submissions',async()=>{
 let calls=0;
 const service=createFeedbackService({deliver:()=>{calls++}});
 await assert.rejects(()=>service.submit(submission({type:'other'})),/Choose a feedback type/);
 await assert.rejects(()=>service.submit(submission({message:'too short'})),/at least 20/);
 assert.deepEqual(await service.submit(submission({website:'https://spam.invalid'})),{ok:true,ignored:true});
 assert.equal(calls,0);
});

test('feedback limits each player by interval and day',async()=>{
 let at=1_000_000,calls=0;
 const service=createFeedbackService({deliver:()=>{calls++},now:()=>at});
 await service.submit(submission());
 await assert.rejects(()=>service.submit(submission()),/Please wait/);
 at+=10*60*1000;await service.submit(submission());
 at+=10*60*1000;await service.submit(submission());
 at+=10*60*1000;await assert.rejects(()=>service.submit(submission()),/Daily feedback limit/);
 assert.equal(calls,3);
});

test('feedback limits a shared source network separately from player limits',async()=>{
 let at=1_000_000,calls=0;
 const service=createFeedbackService({deliver:()=>{calls++},now:()=>at,minIntervalMs:0,playerLimit:20,ipLimit:2});
 await service.submit(submission({playerId:'a'}));
 await service.submit(submission({playerId:'b'}));
 await assert.rejects(()=>service.submit(submission({playerId:'c'})),/Too many submissions from this network/);
 assert.equal(calls,2);
});

test('feedback remains disabled without a server-side store',async()=>{
 const service=createFeedbackService();
 assert.equal(service.configured,false);
 await assert.rejects(()=>service.submit(submission()),/temporarily unavailable/);
});
