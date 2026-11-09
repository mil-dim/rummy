import test from 'node:test';
import assert from 'node:assert/strict';
import {createResendSender} from '../lib/resend.js';

test('Resend sender posts a plain email over HTTPS without putting the API key in the body',async()=>{
 let request;
 const sender=createResendSender({apiKey:'re_private_key',from:'Tabletop <feedback@example.com>',fetchImpl:async(url,options)=>{
  request={url,options};return {ok:true,json:async()=>({id:'email-1'})};
 }});
 const result=await sender({to:'operator@example.com',subject:'Player feedback',text:'A rules recommendation'});
 assert.deepEqual(result,{id:'email-1'});
 assert.equal(request.url,'https://api.resend.com/emails');
 assert.equal(request.options.method,'POST');
 assert.equal(request.options.headers.Authorization,'Bearer re_private_key');
 assert.deepEqual(JSON.parse(request.options.body),{from:'Tabletop <feedback@example.com>',to:['operator@example.com'],subject:'Player feedback',text:'A rules recommendation'});
 assert.doesNotMatch(request.options.body,/re_private_key/);
});

test('Resend sender is disabled without complete private configuration',()=>{
 assert.equal(createResendSender(),null);
 assert.equal(createResendSender({apiKey:'re_key'}),null);
 assert.equal(createResendSender({from:'feedback@example.com'}),null);
});

test('Resend errors expose a bounded provider reason but not credentials or message content',async()=>{
 const sender=createResendSender({apiKey:'re_secret',from:'feedback@example.com',fetchImpl:async()=>({ok:false,status:403,json:async()=>({message:'Domain is not verified'})})});
 await assert.rejects(()=>sender({to:'operator@example.com',subject:'Feedback',text:'private player message'}),error=>{
  assert.match(error.message,/Resend HTTP 403: Domain is not verified/);
  assert.doesNotMatch(error.message,/re_secret|private player message/);
  return true;
 });
});
