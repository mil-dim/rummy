import test from 'node:test';
import assert from 'node:assert/strict';
import {createFeedbackService} from '../lib/feedback.js';

const submission=(overrides={})=>({playerId:'player-1',ip:'203.0.113.8',name:'Milen',account:null,
 type:'rules',message:'Please clarify this particular table rule.',website:'',...overrides});

test('feedback sends a plain contextual email without retaining or including the IP',async()=>{
 const sent=[];
 const service=createFeedbackService({recipient:'private@example.test',environment:'web-qa',version:'1.0.23',sendMail:message=>sent.push(message)});
 assert.equal(service.configured,true);
 assert.deepEqual(await service.submit(submission({room:{id:'ROOM1234',name:'Evening game',gameType:'rummy',game:true}})),{ok:true});
 assert.equal(sent.length,1);
 assert.equal(sent[0].to,'private@example.test');
 assert.match(sent[0].subject,/Tabletop web-qa/);
 assert.match(sent[0].text,/Rules recommendation/);
 assert.match(sent[0].text,/Evening game \(ROOM1234, rummy, in progress\)/);
 assert.match(sent[0].text,/Please clarify/);
 assert.doesNotMatch(sent[0].text,/203\.0\.113\.8/);
});

test('feedback validates type and message and silently drops honeypot submissions',async()=>{
 let calls=0;
 const service=createFeedbackService({recipient:'private@example.test',sendMail:()=>{calls++}});
 await assert.rejects(()=>service.submit(submission({type:'other'})),/Choose a feedback type/);
 await assert.rejects(()=>service.submit(submission({message:'too short'})),/at least 20/);
 assert.deepEqual(await service.submit(submission({website:'https://spam.invalid'})),{ok:true,ignored:true});
 assert.equal(calls,0);
});

test('feedback limits each player by interval and day',async()=>{
 let at=1_000_000,calls=0;
 const service=createFeedbackService({recipient:'private@example.test',sendMail:()=>{calls++},now:()=>at});
 await service.submit(submission());
 await assert.rejects(()=>service.submit(submission()),/Please wait/);
 at+=10*60*1000;await service.submit(submission());
 at+=10*60*1000;await service.submit(submission());
 at+=10*60*1000;await assert.rejects(()=>service.submit(submission()),/Daily feedback limit/);
 assert.equal(calls,3);
});

test('feedback limits a shared source network separately from player limits',async()=>{
 let at=1_000_000,calls=0;
 const service=createFeedbackService({recipient:'private@example.test',sendMail:()=>{calls++},now:()=>at,minIntervalMs:0,playerLimit:20,ipLimit:2});
 await service.submit(submission({playerId:'a'}));
 await service.submit(submission({playerId:'b'}));
 await assert.rejects(()=>service.submit(submission({playerId:'c'})),/Too many submissions from this network/);
 assert.equal(calls,2);
});

test('feedback remains disabled without complete server-side mail configuration',async()=>{
 const service=createFeedbackService();
 assert.equal(service.configured,false);
 await assert.rejects(()=>service.submit(submission()),/temporarily unavailable/);
});
