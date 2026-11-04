import test from 'node:test';
import assert from 'node:assert/strict';
import { backgammonAction, newBackgammon, publicBackgammon, legalBackgammonMoves, forfeitBackgammon } from '../lib/backgammon.js';
import { startBackgammonMatch, recordBackgammonResult } from '../lib/backgammon-match.js';
import { diceRandom } from '../lib/dice.js';
const players=[{id:'p1'},{id:'p2'}];
function position(dice=[1,2]) {
  const g=newBackgammon(players,{starter:'p1'});
  g.points=Array.from({length:24},()=>({owner:null,count:0}));
  g.dice=dice;g.phase='play';return g;
}
const put=(g,index,side,count=1)=>{g.points[index]={owner:side,count}};
const move=(g,from,dieIndex=0,id='p1')=>backgammonAction(g,id,{type:'move',from,dieIndex});
function rolling(t,values) { let i=0;t.mock.method(diceRandom,'roll',()=>{assert.ok(i<values.length,'Unexpected extra dice generation');return values[i++]}); }

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
  assert.throws(()=>backgammonAction(g,'p2',{type:'undo'}),/No move can be undone/);
  backgammonAction(g,'p1',{type:'undo'});assert.deepEqual(g,before);
  move(g,6,0);move(g,5,1);
  assert.equal(publicBackgammon(g,'p1').canUndo,false);
  assert.throws(()=>backgammonAction(g,'p1',{type:'undo'}),/No move can be undone/);
});

test('single playable move can be undone until opponent rolls',t=>{
  const g=position();g.bar[0]=2;put(g,23,1,2);const before=structuredClone(g);
  move(g,'bar',1);assert.equal(g.turn,1);assert.equal(publicBackgammon(g,'p1').canUndo,true);
  backgammonAction(g,'p1',{type:'undo'});assert.deepEqual(g,before);
  move(g,'bar',1);rolling(t,[3,4]);backgammonAction(g,'p2',{type:'roll'});
  assert.throws(()=>backgammonAction(g,'p1',{type:'undo'}),/No move can be undone/);
});

test('undo is private and cannot reroll, undo a win or a forfeit',t=>{
  const g=position([]);g.phase='roll';rolling(t,[1,2]);
  backgammonAction(g,'p1',{type:'roll'});
  assert.throws(()=>backgammonAction(g,'p1',{type:'undo'}),/No move can be undone/);
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

test('match scores accumulate normal wins and Mars once, and finish at chosen round count',()=>{
  const room={players};
  for(const invalid of [0,101,1.5,true,'3',null,Infinity])assert.throws(()=>startBackgammonMatch(room,invalid));
  startBackgammonMatch(room,2);
  let g=position();g.gameNumber=1;put(g,0,0);g.borneOff=[14,1];move(g,0,1);room.game=g;
  recordBackgammonResult(room);recordBackgammonResult(room);
  assert.deepEqual(room.match.cumulative,{p1:1,p2:0});assert.equal(room.match.finished,false);
  g=position();g.gameNumber=6;g.turn=1;put(g,23,1);g.borneOff=[0,14];move(g,23,1,'p2');room.game=g;
  recordBackgammonResult(room);assert.deepEqual(room.match.cumulative,{p1:1,p2:2});assert.equal(room.match.finished,true);
  startBackgammonMatch(room,3);assert.deepEqual(room.match.cumulative,{p1:0,p2:0});assert.equal(room.gameNumber,0);
});

test('complete seeded game preserves all 15 checkers per side',t=>{
  let seed=73421;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  t.mock.method(diceRandom,'roll',()=>1+Math.floor(random()*6));
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


test('legitimate repeated rolls have distinct IDs and doubles generate only two values', t => {
  const g=newBackgammon(players);rolling(t,[3,3,3,3,3,3]);
  for(let i=0;i<3;i++){backgammonAction(g,'p1',{type:'roll'});backgammonAction(g,'p2',{type:'roll'})}
  assert.equal(g.openingRound,4);assert.equal(g.rollNumber,6);
  assert.deepEqual(g.rollHistory.map(r=>r.id),[1,2,3,4,5,6]);
  assert.ok(g.rollHistory.every(r=>r.dice[0]===3&&r.kind==='opening'));
  const h=position([]);h.phase='roll';put(h,23,0,2);
  rolling(t,[6,6]);backgammonAction(h,'p1',{type:'roll'});
  assert.deepEqual(h.dice,[6,6,6,6]);assert.deepEqual(h.rollHistory[0].dice,[6,6]);
  const before=structuredClone(h.rollHistory);
  assert.throws(()=>backgammonAction(h,'p1',{type:'roll'}),/Move your current dice/);
  assert.deepEqual(h.rollHistory,before);
  const m=legalBackgammonMoves(h)[0];backgammonAction(h,'p1',{type:'move',...m});
  backgammonAction(h,'p1',{type:'undo'});assert.deepEqual(h.rollHistory,before);
});

test('roll history is bounded and random source failure does not consume a turn',t=>{
  const g=newBackgammon(players,{starter:'p1'});
  t.mock.method(diceRandom,'roll',()=>{throw Error('Entropy unavailable')});
  const before=structuredClone(g);assert.throws(()=>backgammonAction(g,'p1',{type:'roll'}),/Entropy/);assert.deepEqual(g,before);
  t.mock.restoreAll();t.mock.method(diceRandom,'roll',()=>2);
  for(let i=0;i<60;i++){g.phase='roll';g.dice=[];g.used=[];backgammonAction(g,'p1',{type:'roll'})}
  assert.equal(g.rollHistory.length,50);assert.equal(g.rollHistory[0].id,11);assert.equal(g.rollHistory.at(-1).id,60);
});


test('doubles undo each of the first three moves, including hits, then fourth move commits',()=>{
  const g=position([1,1,1,1]);put(g,8,0);put(g,7,1);
  const snapshots=[structuredClone(g)];
  for(const [i,from] of [8,7,6].entries()){
    move(g,from,i);snapshots.push(structuredClone(g));
    assert.equal(publicBackgammon(g,'p1').canUndo,true);
    assert.equal(publicBackgammon(g,'p2').canUndo,false);
  }
  assert.equal(g.bar[1],1);
  for(const expected of snapshots.slice(0,3).reverse()){
    backgammonAction(g,'p1',{type:'undo'});assert.deepEqual(g,expected);
  }
  assert.equal(g.bar[1],0);assert.equal(g.points[7].owner,1);
  assert.equal(publicBackgammon(g,'p1').canUndo,false);
  assert.throws(()=>backgammonAction(g,'p1',{type:'undo'}),/No move/);
  for(const [i,from] of [8,7,6,5].entries())move(g,from,i);
  assert.equal(g.turn,1);assert.equal(g.lastTurn.reason,'complete');
  assert.equal(publicBackgammon(g,'p1').canUndo,false);
  assert.throws(()=>backgammonAction(g,'p1',{type:'undo'}),/No move/);
});

test('doubles undo restores borne-off checkers one move at a time',()=>{
  const g=position([2,2,2,2]);put(g,5,0);put(g,1,0,2);g.borneOff[0]=12;
  const initial=structuredClone(g);
  move(g,5,0);const afterOne=structuredClone(g);
  move(g,1,1);const afterTwo=structuredClone(g);
  assert.equal(g.borneOff[0],13);move(g,3,2);
  backgammonAction(g,'p1',{type:'undo'});assert.deepEqual(g,afterTwo);
  backgammonAction(g,'p1',{type:'undo'});assert.deepEqual(g,afterOne);assert.equal(g.borneOff[0],12);
  backgammonAction(g,'p1',{type:'undo'});assert.deepEqual(g,initial);
});

test('blocked partial doubles keep the undo stack only until the opponent rolls',t=>{
  const g=position([2,2,2,2]);put(g,7,0);put(g,1,1,2);
  const initial=structuredClone(g);
  move(g,7,0);const afterOne=structuredClone(g);move(g,5,1);
  assert.equal(g.turn,1);assert.equal(g.lastTurn.reason,'blocked');
  backgammonAction(g,'p1',{type:'undo'});assert.deepEqual(g,afterOne);
  backgammonAction(g,'p1',{type:'undo'});assert.deepEqual(g,initial);
  move(g,7,0);move(g,5,1);rolling(t,[3,4]);backgammonAction(g,'p2',{type:'roll'});
  assert.equal(publicBackgammon(g,'p1').canUndo,false);
  assert.throws(()=>backgammonAction(g,'p1',{type:'undo'}),/No move/);
});
