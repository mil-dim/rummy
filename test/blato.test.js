import test from 'node:test';
import assert from 'node:assert/strict';
import {newBlato,blatoAction,publicBlato,forfeitBlato} from '../lib/blato.js';
import {makeDeck} from '../lib/trick-cards.js';

const players=[{id:'a'},{id:'b'},{id:'c'}];
const deck=()=>makeDeck(['A','K','Q','J','10','9','8','7','6','5','4','3','2'],'test');
const cut=(rank,id)=>({rank,suit:'♠',id});

test('opening cut assigns 8-5-3, redraws only ties and keeps dealt hands closed',()=>{
 const g=newBlato(players,{deck:deck(),cutDeck:[cut('A','ca'),cut('A','cb'),cut('2','cc'),cut('K','ca2'),cut('Q','cb2')]});
 for(const id of ['a','b','c'])blatoAction(g,id,{type:'cut'});
 assert.equal(g.phase,'cut');assert.deepEqual(g.cutCandidates,[0,1]);assert.equal(g.targets[2],null);
 blatoAction(g,'a',{type:'cut'});blatoAction(g,'b',{type:'cut'});
 assert.deepEqual(g.targets,[8,5,3]);assert.equal(g.phase,'declareTrump');assert.equal(g.eightSide,0);
 assert.deepEqual(publicBlato(g,'a').hands,[{count:16},{count:16},{count:16}]);
});

test('8-player declares trump before hands open, then takes the public talon and discards privately',()=>{
 const g=newBlato(players,{gameNumber:2,targets:[8,5,3],deck:deck()});
 assert.deepEqual(publicBlato(g,'a').hands,[{count:16},{count:16},{count:16}]);
 blatoAction(g,'a',{type:'declareTrump',suit:'♥'});assert.equal(g.phase,'kitty');assert.equal(g.contract,'♥');
 const view=publicBlato(g,'a'),watch=publicBlato(g,null);assert.equal(view.hands[0].length,20);assert.equal(watch.kitty.length,4);
 const discard=g.hands[0].slice(0,4).map(card=>card.id);blatoAction(g,'a',{type:'discardKitty',cardIds:discard});
 assert.equal(g.phase,'play');assert.equal(g.hands[0].length,16);assert.deepEqual(publicBlato(g,null).discarded,{count:4});
});

test('pulling is optional, batched, private, ordered by positive score and excludes trump',()=>{
 const g=newBlato(players,{gameNumber:2,targets:[8,5,3],previousScores:[2,-2,0],deck:deck()});
 g.hands[0][0]={id:'giveS',rank:'2',suit:'♠'};g.hands[0][1]={id:'giveC',rank:'3',suit:'♣'};
 g.hands[1][0]={id:'returnS',rank:'A',suit:'♠'};g.hands[1][1]={id:'returnC',rank:'K',suit:'♣'};
 blatoAction(g,'a',{type:'declareTrump',suit:'♥'});assert.equal(g.phase,'pull');assert.deepEqual(g.exchangeQueue[0],{giver:0,receiver:1,maxCount:2});
 assert.throws(()=>blatoAction(g,'a',{type:'pull',cardIds:[g.hands[0].find(card=>card.suit==='♥').id]}),/Trump/);
 blatoAction(g,'a',{type:'pull',cardIds:['giveS','giveC']});assert.equal(g.phase,'kitty');
 assert.ok(g.hands[0].some(card=>card.id==='returnS')&&g.hands[0].some(card=>card.id==='returnC'));
 assert.ok(g.hands[1].some(card=>card.id==='giveS')&&g.hands[1].some(card=>card.id==='giveC'));
 assert.ok(publicBlato(g,'a').exchangeLog[0].given);assert.equal(publicBlato(g,'c').exchangeLog[0].given,undefined);

 const forgiven=newBlato(players,{gameNumber:2,targets:[8,5,3],previousScores:[1,-1,0],deck:deck()});
 blatoAction(forgiven,'a',{type:'declareTrump',suit:'♦'});blatoAction(forgiven,'a',{type:'pull',cardIds:[]});
 assert.equal(forgiven.exchangeLog[0].count,0);assert.equal(forgiven.phase,'kitty');
});

test('answering is mandatory while raising, trumping and overtrumping are optional',()=>{
 const g=newBlato(players,{gameNumber:2,targets:[8,5,3],deck:deck()});blatoAction(g,'a',{type:'declareTrump',suit:'♥'});
 blatoAction(g,'a',{type:'discardKitty',cardIds:g.hands[0].slice(0,4).map(card=>card.id)});
 g.hands[0]=[{id:'lead',rank:'10',suit:'♠'}];g.hands[1]=[{id:'same',rank:'2',suit:'♠'},{id:'off',rank:'A',suit:'♣'}];g.hands[2]=[{id:'trump',rank:'A',suit:'♥'},{id:'discard',rank:'2',suit:'♣'}];g.turn=0;g.trick=[];
 blatoAction(g,'a',{type:'play',cardId:'lead'});assert.deepEqual(publicBlato(g,'b').legalCardIds,['same']);
 blatoAction(g,'b',{type:'play',cardId:'same'});assert.deepEqual(new Set(publicBlato(g,'c').legalCardIds),new Set(['trump','discard']));
});

test('Blato forfeit ranks the departing player below both opponents',()=>{
 const g=newBlato(players,{gameNumber:2,targets:[8,5,3],deck:deck()});forfeitBlato(g,'b');assert.deepEqual(g.scores,[.5,-1,.5]);assert.deepEqual(g.winners,['a','c']);
});

test('a complete Blato deal plays 16 legal tricks and remains zero-sum',()=>{
 const g=newBlato(players,{gameNumber:2,targets:[8,5,3]});blatoAction(g,'a',{type:'declareTrump',suit:'♦'});
 blatoAction(g,'a',{type:'discardKitty',cardIds:g.hands[0].slice(0,4).map(card=>card.id)});
 for(let play=0;play<48&&!g.finished;play++){
  const side=g.turn,legal=publicBlato(g,g.players[side]).legalCardIds;assert.ok(legal.length);blatoAction(g,g.players[side],{type:'play',cardId:legal[0]});
 }
 assert.equal(g.finished,true);assert.equal(g.played.length,48);assert.equal(g.tricks.reduce((sum,value)=>sum+value,0),16);assert.equal(g.scores.reduce((sum,value)=>sum+value,0),0);
});
