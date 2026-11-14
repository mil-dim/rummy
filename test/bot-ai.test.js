import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiChooser, decisionInput} from '../bot/ai.js';

function room() {
 const points=Array.from({length:24},()=>({owner:null,count:0}));points[10]={owner:0,count:2};
 return {id:'secret-room',name:'Private name',role:'player',players:[{name:'Secret human'}],game:{kind:'backgammon',variant:'normal',players:['bot','human'],turn:0,phase:'play',points,bar:[0,0],borneOff:[0,0],dice:[1,2],used:[],legalMoves:[{from:10,dieIndex:0},{from:10,dieIndex:1}],hands:{human:['secret-card']}}};
}
const env={BOT_ENGINE:'hybrid',OPENAI_API_KEY:'secret-key',BOT_AI_MODEL:'gpt-6-luna'};
const completed=(id=1)=>({ok:true,json:async()=>({status:'completed',usage:{input_tokens:20,output_tokens:5},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({candidateId:id})}]}]})});
test('AI gets only explicit public board and selects a server legal candidate',async()=>{
 let body;const logs=[];
 const choose=createAiChooser({env,log:x=>logs.push(x),fetchImpl:async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');body=JSON.parse(options.body);return completed();}});
 const action=await choose(room(),'bot');assert.deepEqual(action,{type:'move',from:10,dieIndex:1});
 assert.equal(body.store,false);assert.equal(body.reasoning.effort,'none');assert.equal(body.text.format.strict,true);
 for(const secret of ['Private name','Secret human','secret-room','secret-card','secret-key'])assert.ok(!JSON.stringify(body).includes(secret));
 assert.ok(logs.some(x=>x.event==='bot_ai_usage'&&x.inputTokens===20));
});
test('bad AI choice falls back, suppresses raw errors and starts cooldown',async()=>{
 let calls=0;const logs=[];
 const choose=createAiChooser({env,log:x=>logs.push(x),fetchImpl:async()=>{calls++;return completed(999);}});
 for(let i=0;i<2;i++){const action=await choose(room(),'bot');assert.equal(action.type,'move');assert.ok([0,1].includes(action.dieIndex));}
 assert.equal(calls,1);assert.ok(logs.some(x=>x.reason==='invalid_choice'));
 const failing=createAiChooser({env,log:x=>logs.push(x),fetchImpl:async()=>{throw Error('secret-key');}});
 await failing(room(),'bot');assert.ok(!JSON.stringify(logs).includes('secret-key'));
});
test('cap is shared across bots; one candidate, non-board games and missing keys cost nothing',async()=>{
 let calls=0;
 const choose=createAiChooser({env:{...env,BOT_AI_MAX_REQUESTS_PER_DAY:'1'},log:()=>{},fetchImpl:async()=>{calls++;return completed();}});
 await choose(room(),'bot');await choose(room(),'bot');assert.equal(calls,1);
 const forced=room();forced.game.legalMoves.pop();await choose(forced,'bot');assert.equal(calls,1);
 assert.equal(decisionInput({...room(),role:'watcher'},'bot'),null);
 assert.equal(decisionInput({...room(),game:{kind:'rummy',players:['bot']}},'bot'),null);
 const disabled=createAiChooser({env:{BOT_ENGINE:'hybrid'},log:()=>{},fetchImpl:()=>{throw Error('must not run');}});
 assert.equal((await disabled(room(),'bot')).type,'move');
});
test('Ollama returns the same constrained choice without an OpenAI key',async()=>{
 const choose=createAiChooser({env:{BOT_ENGINE:'hybrid',BOT_AI_PROVIDER:'ollama',BOT_AI_MODEL:'qwen3:8b',OLLAMA_URL:'http://private:11434'},log:()=>{},fetchImpl:async(url,options)=>{
  assert.equal(url,'http://private:11434/api/chat');assert.equal(options.headers.Authorization,undefined);
  return {ok:true,json:async()=>({message:{content:'{"candidateId":0}'}})};
 }});
 assert.deepEqual(await choose(room(),'bot'),{type:'move',from:10,dieIndex:0});
});
