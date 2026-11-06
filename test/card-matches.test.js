import test from 'node:test';
import assert from 'node:assert/strict';
import {startSantaseMatch,recordSantaseResult,startBlatoMatch,recordBlatoResult} from '../lib/card-matches.js';

const room=()=>({players:[{id:'a'},{id:'b'}],formerPlayers:[]});
test('Santase match accumulates to eleven and carries the winning dealer',()=>{
 const r=room();startSantaseMatch(r);assert.equal(r.match.target,11);
 for(let number=1;number<=4;number++){r.game={kind:'santase',gameNumber:number,players:['a','b'],dealer:r.match.dealer,finished:true,winner:'a',awarded:3};recordSantaseResult(r)}
 assert.equal(r.match.cumulative.a,12);assert.equal(r.match.finished,true);assert.equal(r.match.dealer,0);
});

test('Blato records zero-sum deals and finishes after nine',()=>{
 const r={players:[{id:'a'},{id:'b'},{id:'c'}],formerPlayers:[]};startBlatoMatch(r);
 for(let number=1;number<=9;number++){r.game={kind:'blato',gameNumber:number,players:['a','b','c'],finished:true,winner:'a',scores:[1,0,-1],passesUsed:[true,false,false]};recordBlatoResult(r)}
 assert.deepEqual(r.match.cumulative,{a:9,b:0,c:-9});assert.equal(r.match.finished,true);assert.deepEqual(r.match.passesUsed,[true,false,false]);
});
