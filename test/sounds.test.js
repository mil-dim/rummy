import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const files=['dice-hard-table.wav','checker-stack-clack.wav','checker-brutal-hit.wav'];

test('selected game sounds are valid non-empty WAV assets',()=>{
 for(const file of files){
  const data=readFileSync(new URL(`../public/sounds/${file}`,import.meta.url));
  assert.equal(data.subarray(0,4).toString(),'RIFF');
  assert.equal(data.subarray(8,12).toString(),'WAVE');
  assert.ok(data.length>50_000,`${file} should contain the selected sound`);
 }
});
