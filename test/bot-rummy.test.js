import test from 'node:test';
import assert from 'node:assert/strict';
import {newRummy,publicRummy,rummyAction,validateMeld} from '../lib/rummy.js';
import {meldCandidates,rummyOptions,rummyDecision} from '../bot/rummy.js';
import {createAiChooser} from '../bot/ai.js';
const card=(id,rank,suit='♠')=>({id,rank,suit});
function fixture(hand,opened=false){
 const g=newRummy([{id:'bot'},{id:'human'}]);g.hands.bot=hand;g.turn=0;g.phase='play';g.opened.bot=opened;return g;
}
test('joker candidates have exact declarations, distinct suits and valid Ace boundaries',()=>{
 const hand=[card('a','A'),card('two','2'),card('q','Q'),card('k','K'),card('j','JOKER','')];
 const candidates=meldCandidates(hand);assert.ok(candidates.some(m=>m.cardIds.includes('two')&&m.jokerAssignments.some(a=>a.rank==='3')));
 for(const m of candidates)assert.equal(validateMeld(m.cardIds.map(id=>hand.find(c=>c.id===id)),m.jokerAssignments).ok,true);
 assert.ok(!candidates.some(m=>['a','two','k'].every(id=>m.cardIds.includes(id))));
});
test('local bot opens with jokers and wins below 44 with one final discard',()=>{
 const g=fixture([card('a','A'),card('two','2'),card('j','JOKER',''),card('x','4','♥')]);
 const first=rummyOptions(publicRummy(g,'bot'),'bot')[0].action;assert.equal(first.type,'meldBatch');rummyAction(g,'bot',first);
 assert.equal(g.hands.bot.length,1);rummyAction(g,'bot',rummyOptions(publicRummy(g,'bot'),'bot')[0].action);assert.equal(g.winner,'bot');
});
test('discard pickup is offered only with a useful valid opening or addition',()=>{
 const g=fixture([card('j','J','♥'),card('q','Q','♥'),card('joker','JOKER',''),card('x','7','♣'),card('y','3','♦')]);g.phase='draw';
 g.discard=[card('k','K','♥')];
 assert.equal(rummyOptions(publicRummy(g,'bot'),'bot')[0].action.from,'discard');
 rummyAction(g,'bot',{type:'draw',from:'discard'});
 const options=rummyOptions(publicRummy(g,'bot'),'bot');assert.ok(options.length);
 for(const option of options){const copy=structuredClone(g);assert.doesNotThrow(()=>rummyAction(copy,'bot',option.action));}
});
test('AI Rummy projection excludes opponent hands, names, stock order and internal IDs',async()=>{
 const g=fixture([card('internal-joker','JOKER',''),card('internal-7','7','♣'),card('internal-king','K','♦')]);
 const room={role:'player',name:'secret-name',game:publicRummy(g,'bot')};
 const decision=rummyDecision(room,'bot');const text=JSON.stringify(decision.state);
 for(const secret of ['internal-joker','internal-7','internal-king','secret-name',...g.hands.human.map(c=>c.id),...g.stock.map(c=>c.id)])assert.ok(!text.includes(secret));
 let called=false;
 const choose=createAiChooser({env:{BOT_ENGINE:'hybrid',OPENAI_API_KEY:'test'},log:()=>{},fetchImpl:async(_url,options)=>{
  called=true;assert.ok(JSON.parse(options.body).instructions.includes('Bulgarian Rummy'));
  return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"candidateId":0}'}]}]})};
 }});
 const action=await choose(room,'bot');assert.equal(called,true);assert.doesNotThrow(()=>rummyAction(g,'bot',action));
});
test('generated Rummy options remain server legal through varied complete play',()=>{
 for(let trial=0;trial<5;trial++){
  const g=newRummy([{id:'bot'},{id:'human'}]);
  for(let turn=0;turn<350&&!g.winner;turn++){
   const id=g.players[g.turn],options=rummyOptions(publicRummy(g,id),id);assert.ok(options.length,'no available action');
   // Verify each proposed alternative, not just the highest-ranked fallback.
   for(const option of options){const copy=structuredClone(g);assert.doesNotThrow(()=>rummyAction(copy,id,option.action),JSON.stringify(option.action));}
   rummyAction(g,id,options[0].action);
  }
 }
});
