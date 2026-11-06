import test from 'node:test';
import assert from 'node:assert/strict';
import {newSantase,santaseAction,publicSantase,forfeitSantase} from '../lib/santase.js';
import {makeDeck} from '../lib/trick-cards.js';

const players=[{id:'a'},{id:'b'}];
const deck=()=>makeDeck(['A','10','K','Q','J','9'],'test');

test('Santase deals privately and exposes only the viewer hand',()=>{
 const g=newSantase(players,{deck:deck()});
 assert.deepEqual(g.hands.map(hand=>hand.length),[6,6]);assert.equal(g.stock.length,11);assert.ok(g.trumpCard);
 const a=publicSantase(g,'a'),watcher=publicSantase(g,null);
 assert.equal(a.hands[0].length,6);assert.deepEqual(a.hands[1],{count:6});assert.deepEqual(watcher.hands,[{count:6},{count:6}]);
 assert.ok(!watcher.legalCardIds.includes(g.hands[0][0].id));
});

test('open talon allows any reply; closed talon requires following and beating',()=>{
 const g=newSantase(players,{deck:deck()});g.leader=0;g.turn=0;
 g.hands[0]=[{id:'lead',rank:'Q',suit:'♠'}];
 g.hands[1]=[{id:'low',rank:'J',suit:'♠'},{id:'high',rank:'K',suit:'♠'},{id:'off',rank:'A',suit:'♥'}];
 santaseAction(g,'a',{type:'play',cardId:'lead'});
 assert.deepEqual(new Set(publicSantase(g,'b').legalCardIds),new Set(['low','high','off']));
 g.closed=true;
 assert.deepEqual(publicSantase(g,'b').legalCardIds,['high']);
 assert.throws(()=>santaseAction(g,'b',{type:'play',cardId:'off'}),/cannot/);
});

test('marriages, trump-nine exchange, claiming and false claims score correctly',()=>{
 const g=newSantase(players,{deck:deck()});g.leader=0;g.turn=0;g.tricksWon[0]=1;g.trumpSuit='♥';g.trumpCard={id:'up',rank:'A',suit:'♥'};g.stock=[{id:'x',rank:'9',suit:'♠'},{id:'y',rank:'10',suit:'♠'}];
 g.hands[0]=[{id:'nine',rank:'9',suit:'♥'},{id:'king',rank:'K',suit:'♥'},{id:'queen',rank:'Q',suit:'♥'}];
 santaseAction(g,'a',{type:'exchangeTrump'});assert.equal(g.hands[0][0].id,'up');assert.equal(g.trumpCard.id,'nine');
 santaseAction(g,'a',{type:'play',cardId:'king',announce:true});assert.equal(g.marriagePoints[0],40);

 const claim=newSantase(players,{deck:deck()});claim.turn=0;claim.leader=0;claim.cardPoints[0]=46;claim.marriagePoints[0]=20;claim.cardPoints[1]=32;claim.tricksWon=[2,1];
 santaseAction(claim,'a',{type:'claim66'});assert.equal(claim.winner,'a');assert.equal(claim.awarded,2);
 const bad=newSantase(players,{deck:deck()});bad.turn=0;bad.leader=0;bad.cardPoints[0]=50;bad.tricksWon=[1,0];
 santaseAction(bad,'a',{type:'claim66'});assert.equal(bad.winner,'b');assert.equal(bad.awarded,2);
});

test('Santase forfeit awards one point',()=>{
 const g=newSantase(players,{deck:deck()});forfeitSantase(g,'a');assert.equal(g.winner,'b');assert.equal(g.awarded,1);assert.equal(g.finished,true);
});

test('a complete Santase deal terminates and preserves all 24 cards',()=>{
 const g=newSantase(players);
 for(let step=0;step<30&&!g.finished;step++){
  const side=g.turn,legal=publicSantase(g,g.players[side]).legalCardIds;assert.ok(legal.length);santaseAction(g,g.players[side],{type:'play',cardId:legal[0]});
  const count=g.hands.flat().length+g.stock.length+(g.trumpCard?1:0)+g.taken.flat().length+g.trick.length;assert.equal(count,24);
 }
 assert.equal(g.finished,true);assert.ok(g.winner||g.draw);
});
