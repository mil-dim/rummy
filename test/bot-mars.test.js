import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseAction,urgentBearOffMoves} from '../bot/strategy.js';
import {createAiChooser} from '../bot/ai.js';

for(const variant of ['normal','gulbara','tapa'])for(const side of [0,1]){
 test(`${variant} side ${side} takes first checker off to save Mars without an API call`,async()=>{
  const physical=(rank,who)=>who===0?rank:variant==='gulbara'?(rank+12)%24:23-rank;
  const points=Array.from({length:24},()=>({owner:null,count:0}));
  points[physical(0,side)]={owner:side,count:1};points[physical(4,side)]={owner:side,count:14};
  points[physical(0,1-side)]={owner:1-side,count:5};
  const g={kind:'backgammon',variant,players:['a','b'],turn:side,phase:'play',winner:null,
   points,bar:[0,0],borneOff:side===0?[0,10]:[10,0],dice:[1,2],used:[],
   legalMoves:[{from:physical(4,side),dieIndex:0},{from:physical(0,side),dieIndex:0}]};
  const room={role:'player',game:g},id=g.players[side];
  assert.equal(chooseAction(room,id,()=>0).from,physical(0,side));
  let calls=0;
  const choose=createAiChooser({env:{BOT_ENGINE:'hybrid',OPENAI_API_KEY:'test'},log:()=>{},fetchImpl:()=>{calls++;throw Error('must not call');}});
  assert.equal((await choose(room,id)).from,physical(0,side));assert.equal(calls,0);
  g.legalMoves.shift();g.legalMoves=[];assert.deepEqual(urgentBearOffMoves(g,side),[]);
 });
}
