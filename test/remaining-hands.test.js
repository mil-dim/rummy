import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const cardRenderer=source.slice(source.indexOf('function declared('),source.indexOf('function orderKey('));
const proofRenderer=source.slice(source.indexOf('function remainingHands('),source.indexOf('function standings('));
const context=vm.createContext({
 esc:value=>String(value).replaceAll('<','&lt;'),
 playerName:id=>id==='b'?'Loser B':'Departed C',
 signedPoints:value=>String(value),selected:new Set(['b1']),arranging:false
});
vm.runInContext(cardRenderer+proofRenderer,context);

test('finished result renders every loser, including departed players, as read-only cards',()=>{
 const game={winner:'a',players:['a','b','c'],forfeited:['c'],
 hands:{a:[],b:[{id:'b1',rank:'3',suit:'♥'}],c:[{id:'c1',rank:'JOKER',suit:''}]},
 scores:{players:{b:{cards:1,raw:3,match:-1},c:{cards:1,raw:100,match:-10,fullHand:true}}}};
 context.game=game;
 const html=vm.runInContext('remainingHands(game)',context);
 assert.match(html,/Loser B/);assert.match(html,/Departed C/);
 assert.match(html,/3 of ♥/);assert.match(html,/JOKER/);
 assert.match(html,/Full hand: 100 points/);
 assert.equal((html.match(/class="playing-card/g)||[]).length,2);
 assert.equal((html.match(/disabled/g)||[]).length,2);
 assert.doesNotMatch(html,/data-hand-card|draggable|selected"/);
 game.winner=null;
 assert.equal(vm.runInContext('remainingHands(game)',context),'');
});
