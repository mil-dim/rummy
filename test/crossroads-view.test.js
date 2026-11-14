import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('Crossroads renders safe player-name markup instead of escaped tags',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.equal(source.includes('esc(playerName('),false);
 assert.equal(source.includes('esc(crossStatus('),false);
 assert.match(source,/plainPlayerName\(game\.players\[index\]\)/);
});
