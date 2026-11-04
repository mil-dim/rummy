import test from 'node:test';
import assert from 'node:assert/strict';
import { backgammonAction, newBackgammon, publicBackgammon, legalBackgammonMoves, forfeitBackgammon } from '../lib/backgammon.js';
import { startBackgammonMatch, recordBackgammonResult } from '../lib/backgammon-match.js';
const players=[{id:'p1'},{id:'p2'}];
function position(dice=[1,2]) {
  const g=newBackgammon(players,{starter:'p1'});
  g.points=Array.from({length:24},()=>({owner:null,count:0}));
  g.dice=dice;g.phase='play';return g;
}
const put=(g,index,side,count=1)=>{g.points[index]={owner:side,count}};
const move=(g,from,dieIndex=0,id='p1')=>backgammonAction(g,id,{type:'move',from,dieIndex});
function rolling(t,values) { let i=0;t.mock.method(Math,'random',()=>((values[i++]-1)+0.1)/6); }

test('opening both roll one die, ties reroll and winner rolls fresh dice',t=>{
  const g=newBackgammon(players);rolling(t,[4,4,2,6,3,5]);
  backgammonAction(g,'p2',{type:'roll'});
  assert.throws(()=>backgammonAction(g,'p2',{type:'roll'}),/Wait/);
  assert.throws(()=>move(g,23),/Roll to decide/);
  backgammonAction(g,'p1',{type:'roll'});
  assert.deepEqual(g.openingPrevious,[4,4]);assert.deepEqual(g.openingRolls,[null,null]);
  backgammonAction(g,'p1',{type:'roll'});backgammonAction(g,'p2',{type:'roll'});
  assert.equal(g.turn,1);assert.equal(g.phase,'roll');assert.deepEqual(g.dice,[]);
  assert.throws(()=>backgammonAction(g,'p1',{type:'roll'}),/not your turn/);
  backgammonAction(g,'p2',{type:'roll'});assert.deepEqual(g.dice,[3,5]);
});

test('subsequent game uses the supplied previous winner and needs no opening contest',()=>{
  const g=newBackgammon(players,{gameNumber:2,starter:'p2'});
  assert.equal(g.gameNumber,2);assert.equal(g.turn,1);assert.equal(g.phase,'roll');
});

test('reject a locally legal first move that prevents using both dice',()=>{
  const g=position();put(g,1,0);g.borneOff=[14,1];
  const before=structuredClone(g);
  assert.throws(()=>move(g,1,1),/maximum/);assert.deepEqual(g,before);
  move(g,1,0);move(g,0,1);
  assert.equal(g.winner,'p1');assert.equal(g.scores.awarded,1);assert.equal(g.scores.mars,false);
});

test('higher die is compulsory when only one die can be played',()=>{
  const g=position();put(g,0,0);g.borneOff=[14,1];
  assert.throws(()=>move(g,0,0),/higher die/);move(g,0,1);assert.equal(g.winner,'p1');
});

test('doubles roll as four dice and all four moves are compulsory',t=>{
  const g=position([]);g.phase='roll';put(g,23,0);g.borneOff=[14,1];rolling(t,[6,6]);
  backgammonAction(g,'p1',{type:'roll'});assert.deepEqual(g.dice,[6,6,6,6]);
  for(const [i,from] of [23,17,11,5].entries())move(g,from,i);
  assert.equal(g.winner,'p1');assert.equal(g.borneOff[0],15);
});

test('doubles play maximum available moves before a blocked pass',()=>{
  const g=position([2,2,2,2]);put(g,7,0);put(g,1,1,2);
  move(g,7,0);move(g,5,1);
  assert.equal(g.turn,1);assert.equal(g.phase,'roll');
  assert.deepEqual(g.lastTurn.used,[0,1]);assert.deepEqual(g.lastTurn.dice,[2,2,2,2]);
  assert.equal(g.lastTurn.reason,'blocked');
});

test('no legal move preserves dice until the opponent rolls',t=>{
  const g=position([]);g.phase='roll';g.bar[0]=1;put(g,23,1,2);put(g,22,1,2);rolling(t,[1,2,3,4]);
  backgammonAction(g,'p1',{type:'roll'});
  assert.equal(g.turn,1);assert.equal(g.phase,'roll');assert.deepEqual(g.lastTurn.dice,[1,2]);
  assert.equal(g.lastTurn.reason,'blocked');assert.equal(g.lastTurn.playerId,'p1');
  backgammonAction(g,'p2',{type:'roll'});assert.equal(g.lastTurn,null);assert.deepEqual(g.dice,[3,4]);
});

test('bar entry is mandatory and hitting moves exactly one opponent checker to the bar',()=>{
  const g=position();g.bar[0]=1;put(g,5,0);put(g,23,1);
  assert.throws(()=>move(g,5,0),/not legal/);
  move(g,'bar',0);assert.equal(g.bar[0],0);assert.equal(g.bar[1],1);assert.equal(g.points[23].owner,0);
});

test('first move undo restores hits, bar, dice and turn; second move commits',()=>{
  const g=position();put(g,6,0);put(g,5,1);const before=structuredClone(g);
  move(g,6,0);assert.equal(g.bar[1],1);assert.equal(publicBackgammon(g,'p1').canUndo,true);
  assert.equal(publicBackgammon(g,'p2').canUndo,false);
  assert.throws(()=>backgammonAction(g,'p2',{type:'undo'}),/first move/);
  backgammonAction(g,'p1',{type:'undo'});assert.deepEqual(g,before);
  move(g,6,0);move(g,5,1);
  assert.equal(publicBackgammon(g,'p1').canUndo,false);
  assert.throws(()=>backgammonAction(g,'p1',{type:'undo'}),/first move/);
});

test('single playable move can be undone until opponent rolls',t=>{
  const g=position();g.bar[0]=2;put(g,23,1,2);const before=structuredClone(g);
  move(g,'bar',1);assert.equal(g.turn,1);assert.equal(publicBackgammon(g,'p1').canUndo,true);
  backgammonAction(g,'p1',{type:'undo'});assert.deepEqual(g,before);
  move(g,'bar',1);rolling(t,[3,4]);backgammonAction(g,'p2',{type:'roll'});
  assert.throws(()=>backgammonAction(g,'p1',{type:'undo'}),/first move/);
});

test('undo is private and cannot reroll, undo a win or a forfeit',t=>{
  const g=position([]);g.phase='roll';rolling(t,[1,2]);
  backgammonAction(g,'p1',{type:'roll'});
  assert.throws(()=>backgammonAction(g,'p1',{type:'undo'}),/first move/);
  const h=position();put(h,0,0);h.borneOff=[14,0];move(h,0,1);
  assert.equal(h.scores.awarded,2);assert.equal(h.scores.mars,true);
  assert.equal(publicBackgammon(h,'p1').canUndo,false);
  assert.throws(()=>backgammonAction(h,'p1',{type:'undo'}),/finished/);
  const f=position();put(f,6,0);move(f,6,0);forfeitBackgammon(f,'p2');
  assert.equal(f.scores.awarded,1);assert.equal(f.scores.forfeit,true);
  assert.equal(publicBackgammon(f,'p1').canUndo,false);
  assert.ok(!JSON.stringify(publicBackgammon(f,'p1')).includes('snapshot'));
});

test('oversized bearing off is blocked while a farther checker remains',()=>{
  const g=position([6]);put(g,4,0);put(g,5,0);g.borneOff=[13,0];
  assert.throws(()=>move(g,4,0),/not legal/);move(g,5,0);assert.equal(g.borneOff[0],14);
});

test('voluntary passing, malformed moves and outsiders are rejected without mutation',()=>{
  const g=position();put(g,6,0);const before=structuredClone(g);
  for(const a of [{type:'end'},{type:'move',from:6,dieIndex:0.5},{type:'move',from:-1,dieIndex:0},{type:'move',from:6,dieIndex:'0'}])
    assert.throws(()=>backgammonAction(g,'p1',a));
  assert.throws(()=>backgammonAction(g,'outsider',{type:'roll'}));assert.deepEqual(g,before);
  assert.ok(legalBackgammonMoves(g).length);
});

test('match scores accumulate normal wins and Mars once, and finish at chosen count',()=>{
  const room={players};
  for(const invalid of [0,101,1.5,true,'3',null,Infinity])assert.throws(()=>startBackgammonMatch(room,invalid));
  startBackgammonMatch(room,2);
  let g=position();g.gameNumber=1;put(g,0,0);g.borneOff=[14,1];move(g,0,1);room.game=g;
  recordBackgammonResult(room);recordBackgammonResult(room);
  assert.deepEqual(room.match.cumulative,{p1:1,p2:0});assert.equal(room.match.finished,false);
  g=position();g.gameNumber=2;g.turn=1;put(g,23,1);g.borneOff=[0,14];move(g,23,1,'p2');room.game=g;
  recordBackgammonResult(room);assert.deepEqual(room.match.cumulative,{p1:1,p2:2});assert.equal(room.match.finished,true);
  startBackgammonMatch(room,3);assert.deepEqual(room.match.cumulative,{p1:0,p2:0});assert.equal(room.gameNumber,0);
});

test('complete seeded game preserves all 15 checkers per side',t=>{
  let seed=73421;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  t.mock.method(Math,'random',random);
  const g=newBackgammon(players,{starter:'p1'});
  let actions=0;
  while(!g.winner&&actions++<5000){
    const id=g.players[g.turn];
    if(g.phase==='roll')backgammonAction(g,id,{type:'roll'});
    else {
      const moves=legalBackgammonMoves(g);
      assert.ok(moves.length);
      backgammonAction(g,id,{type:'move',...moves[Math.floor(random()*moves.length)]});
    }
    for(const side of [0,1])assert.equal(g.bar[side]+g.borneOff[side]+g.points.reduce((n,p)=>n+(p.owner===side?p.count:0),0),15);
  }
  assert.ok(g.winner,'game must finish');assert.ok([1,2].includes(g.scores.awarded));
});
