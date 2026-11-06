import test from 'node:test';
import assert from 'node:assert/strict';
import {newBlato,blatoAction,publicBlato,forfeitBlato} from '../lib/blato.js';
import {makeDeck} from '../lib/trick-cards.js';

const players=[{id:'a'},{id:'b'},{id:'c'}];
const deck=()=>makeDeck(['A','K','Q','J','10','9','8','7','6','5','4','3','2'],'test');

test('Blato rotates 8-5-3 targets and hides hands from opponents and watchers',()=>{
 const first=newBlato(players,{gameNumber:1,dealer:0,deck:deck()});assert.deepEqual(first.targets,[3,8,5]);
 const second=newBlato(players,{gameNumber:2,dealer:1,deck:deck()});assert.deepEqual(second.targets,[5,3,8]);
 const view=publicBlato(first,'a'),watch=publicBlato(first,null);assert.equal(view.hands[0].length,16);assert.deepEqual(view.hands[1],{count:16});assert.deepEqual(watch.hands,[{count:16},{count:16},{count:16}]);
});

test('Blato bidding, public talon, discard and forced play rules work',()=>{
 const g=newBlato(players,{dealer:0,deck:deck()});assert.equal(g.turn,1);
 blatoAction(g,'b',{type:'bid',contract:'♥'});assert.equal(g.phase,'kitty');
 const publicKitty=publicBlato(g,null);assert.equal(publicKitty.kitty.length,4);
 const eight=g.eightSide,giver=g.players[eight];
 const discard=[...g.hands[eight].slice(0,4).map(card=>card.id)];
 blatoAction(g,giver,{type:'discardKitty',cardIds:discard});assert.equal(g.phase,'play');assert.equal(g.hands[eight].length,16);
 g.hands[eight]=[{id:'lead',rank:'10',suit:'♠'}];g.turn=eight;g.trick=[];
 const reply=(eight+1)%3;g.hands[reply]=[{id:'same',rank:'2',suit:'♠'},{id:'off',rank:'A',suit:'♣'}];
 blatoAction(g,giver,{type:'play',cardId:'lead'});
 assert.deepEqual(publicBlato(g,g.players[reply]).legalCardIds,['same']);
 assert.throws(()=>blatoAction(g,g.players[reply],{type:'play',cardId:'off'}),/cannot/);
});

test('Blato exchanges plus/minus cards and a pass is usable once per match',()=>{
 const g=newBlato(players,{gameNumber:2,dealer:0,previousScores:[-1,1,0],deck:deck()});
 blatoAction(g,'b',{type:'bid',contract:'♠'});assert.equal(g.phase,'exchange');assert.equal(g.turn,1);
 const before=g.hands[1].length,card=g.hands[1][0];blatoAction(g,'b',{type:'exchange',cardId:card.id});assert.equal(g.hands[1].length,before);assert.equal(g.phase,'kitty');
 const pass=newBlato(players,{deck:deck()});blatoAction(pass,'b',{type:'bid',contract:'PASS'});assert.equal(pass.passesUsed[1],true);
});

test('Blato forfeit ranks the departing player below both opponents',()=>{
 const g=newBlato(players,{deck:deck()});forfeitBlato(g,'b');assert.deepEqual(g.scores,[.5,-1,.5]);assert.deepEqual(g.winners,['a','c']);
});

test('a complete Blato deal plays 16 legal tricks and remains zero-sum',()=>{
 const g=newBlato(players);blatoAction(g,g.players[g.turn],{type:'bid',contract:'♦'});
 const eight=g.eightSide,ids=[...g.hands[eight].slice(0,2),...g.kitty.slice(0,2)].map(card=>card.id);blatoAction(g,g.players[eight],{type:'discardKitty',cardIds:ids});
 for(let play=0;play<48&&!g.finished;play++){
  const side=g.turn,legal=publicBlato(g,g.players[side]).legalCardIds;assert.ok(legal.length);blatoAction(g,g.players[side],{type:'play',cardId:legal[0]});
 }
 assert.equal(g.finished,true);assert.equal(g.played.length,48);assert.equal(g.tricks.reduce((sum,value)=>sum+value,0),16);assert.equal(g.scores.reduce((sum,value)=>sum+value,0),0);
});
