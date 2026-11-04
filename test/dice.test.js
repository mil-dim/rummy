import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { diceRandom } from '../lib/dice.js';

test('dice request the unbiased crypto integer interval independently each time',t=>{
  const calls=[];let next=0;
  t.after(()=>{t.mock.restoreAll();syncBuiltinESMExports()});
  t.mock.method(crypto,'randomInt',(min,max)=>{calls.push([min,max]);return [3,3,6,1][next++]});
  syncBuiltinESMExports();
  assert.deepEqual(Array.from({length:4},()=>diceRandom.roll()),[3,3,6,1]);
  assert.deepEqual(calls,[[1,7],[1,7],[1,7],[1,7]]);
});

test('real cryptographic rolls stay in range without using Math.random',t=>{
  t.mock.method(Math,'random',()=>{throw Error('Math.random must not generate dice')});
  for(let i=0;i<1024;i++){
    const die=diceRandom.roll();assert.ok(Number.isInteger(die)&&die>=1&&die<=6);
  }
});
