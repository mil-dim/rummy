import test from 'node:test';
import assert from 'node:assert/strict';
import {newBackgammon,backgammonAction,legalBackgammonMoves,publicBackgammon,pointRank,physicalPoint} from '../lib/backgammon.js';
import {backgammonVariant,startBackgammonMatch,recordBackgammonResult} from '../lib/backgammon-match.js';
import {boardView} from '../public/backgammon-view.js';
import {diceRandom} from '../lib/dice.js';
const players=[{id:'w'},{id:'r'}];
const action=(g,type,extra={},side=g.turn)=>backgammonAction(g,g.players[side],{type,...extra});
const put=(g,p,side,count=1)=>g.points[p]={owner:side,count};
function empty(variant,dice=[1,2]){
 const g=newBackgammon(players,{variant,starter:'w'});
 g.points=Array.from({length:24},()=>({owner:null,count:0}));g.phase='play';g.dice=dice;return g;
}
const roll=(t,values)=>{let i=0;t.mock.method(diceRandom,'roll',()=>{assert.ok(i<values.length);return values[i++]})};
const count=(g,side)=>g.bar[side]+g.borneOff[side]+g.points.reduce((n,p)=>n+(p.owner===side?p.count:0)+(p.pinned===side?1:0),0);

test('rounds contain normal, Gulbara, Tapa and carry points until the last game',()=>{
 const room={players};startBackgammonMatch(room,2);
 assert.equal(room.match.roundCount,2);assert.equal(room.match.totalGames,6);
 assert.deepEqual([1,2,3,4,5,6].map(backgammonVariant),['normal','gulbara','tapa','normal','gulbara','tapa']);
 for(let n=1;n<=6;n++){
  room.game=newBackgammon(players,{gameNumber:n,variant:backgammonVariant(n),starter:n===1?null:'r'});
  if(n>1){assert.equal(room.game.turn,1);assert.equal(room.game.phase,'roll')}
  room.game.winner='r';room.game.scores={awarded:2};recordBackgammonResult(room);recordBackgammonResult(room);
  assert.equal(room.match.cumulative.r,n*2);assert.equal(room.match.finished,n===6);
 }
 assert.throws(()=>newBackgammon(players,{variant:'invented'}));
});

test('variant setups and perspective coordinates retain authoritative point IDs',()=>{
 for(const variant of ['normal','gulbara','tapa']){
  const g=newBackgammon(players,{variant});
  for(const side of [0,1]){
   assert.equal(count(g,side),15);
   const view=boardView(variant,side),points=[...view.top,...view.bottom];
   assert.equal(new Set(points).size,24);
   for(const p of points){assert.equal(view.label(p),pointRank(g,p,side)+1);assert.equal(physicalPoint(g,pointRank(g,p,side),side),p)}
   const start=view.top.at(-1);
   assert.equal(g.points[start].owner,side);assert.equal(g.points[start].count,variant==='normal'?2:15);
   assert.equal(view.label(start),24);
  }
 }
 const g=newBackgammon(players,{variant:'gulbara'});
 assert.equal(g.points[23].count,15);assert.equal(g.points[11].count,15);
});

test('Tapa pins, cannot move a pinned checker, releases it and restores pins on undo',()=>{
 const g=empty('tapa');put(g,6,0);put(g,5,1);put(g,18,1,14);put(g,12,0,14);
 const before=structuredClone(g);
 action(g,'move',{from:6,dieIndex:0});
 assert.deepEqual(g.points[5],{owner:0,count:1,pinned:1});assert.deepEqual(g.bar,[0,0]);
 assert.equal(count(g,0),15);assert.equal(count(g,1),15);
 action(g,'undo');assert.deepEqual(g,before);
 action(g,'move',{from:6,dieIndex:0});action(g,'move',{from:5,dieIndex:1});
 assert.deepEqual(g.points[5],{owner:1,count:1});
 const pinned=empty('tapa');put(pinned,4,0);pinned.points[4].pinned=1;pinned.turn=1;
 assert.equal(legalBackgammonMoves(pinned).some(m=>m.from===4),false);
});

test('Tapa pinning either starting checker ends immediately with Mars',()=>{
 for(const side of [0,1]){
  const g=empty('tapa');g.turn=side;
  const origin=side===0?1:22,target=side===0?0:23;
  put(g,origin,side);put(g,target,1-side);g.borneOff[1-side]=1;
  action(g,'move',{from:origin,dieIndex:0});
  assert.equal(g.winner,g.players[side]);assert.equal(g.scores.awarded,2);assert.equal(g.scores.mars,true);
  assert.equal(publicBackgammon(g,g.players[side]).canUndo,false);
 }
});

test('Tapa a pinned home checker still prevents bearing off outside its home',()=>{
 const g=empty('tapa',[6]);put(g,0,0);put(g,10,1);g.points[10].pinned=0;
 assert.equal(legalBackgammonMoves(g).length,0);
});

test('Gulbara blocks single opposing checkers and both sides move in the same direction',()=>{
 const g=empty('gulbara');put(g,23,0);put(g,22,1);
 assert.equal(legalBackgammonMoves(g).some(m=>m.from===23&&m.dieIndex===0),false);
 action(g,'move',{from:23,dieIndex:1});assert.equal(g.points[21].owner,0);assert.deepEqual(g.bar,[0,0]);
 const r=empty('gulbara',[2]);r.turn=1;put(r,0,1);put(r,11,1,14);
 action(r,'move',{from:0,dieIndex:0});assert.equal(r.points[22].owner,1); // wraps across the common direction
});

test('Gulbara red bearing off uses its own home and oversized-die rule',()=>{
 const g=empty('gulbara',[6]);g.turn=1;g.borneOff[1]=13;put(g,16,1);put(g,17,1);
 assert.equal(legalBackgammonMoves(g).some(m=>m.from===16),false);
 action(g,'move',{from:17,dieIndex:0});assert.equal(g.borneOff[1],14);
});

test('Gulbara first three rolls per player are ordinary; fourth own roll activates ascending doubles',t=>{
 roll(t,[3,3,3,3,3,3]);
 const g=newBackgammon(players,{variant:'gulbara',starter:'w'});
 g.rollsBySide=[2,0];action(g,'roll');assert.equal(g.sequence,null);assert.equal(g.rollsBySide[0],3);
 // New controlled turn, keeping this side's roll counter.
 g.phase='roll';g.dice=[];g.used=[];action(g,'roll');
 assert.equal(g.rollsBySide[0],4);assert.equal(g.sequence.face,3);
 assert.deepEqual(g.dice,[3,3,3,3]);assert.equal(g.rollsBySide[1],0);
 g.phase='roll';g.turn=1;g.sequence=null;g.dice=[];g.used=[];action(g,'roll');assert.equal(g.sequence,null);
});

test('ascending 3:3 plays four threes, fours, fives and sixes then opponent rolls normally',t=>{
 roll(t,[3,3]);const g=newBackgammon(players,{variant:'gulbara',starter:'w'});g.rollsBySide[0]=3;
 // Keep opponent clear of the white path while testing the whole sequence.
 g.points[11]={owner:null,count:0};put(g,12,1,15);action(g,'roll');
 const played=[];
 while(g.phase==='play'){
  const legal=legalBackgammonMoves(g);assert.ok(legal.length);
  const m=legal.find(m=>pointRank(g,m.from,0)===Math.max(...legal.map(m=>pointRank(g,m.from,0))))||legal[0];
  played.push(g.dice[m.dieIndex]);action(g,'move',m);
 }
 assert.deepEqual(played,[...Array(4).fill(3),...Array(4).fill(4),...Array(4).fill(5),...Array(4).fill(6)]);
 assert.equal(g.turn,1);assert.equal(g.sequence,null);assert.equal(g.rollHistory.length,1);
});

test('partially blocked doubles transfer remaining dice once, then recipient gets own roll',t=>{
 roll(t,[3,3,1,2]);const g=empty('gulbara',[]);g.phase='roll';g.rollsBySide[0]=3;
 put(g,10,0);put(g,4,1,15);put(g,23,0,14);
 // Block other white sources and leave exactly one initial move.
 put(g,20,1);action(g,'roll');action(g,'move',{from:10,dieIndex:0});
 assert.equal(g.turn,1);assert.equal(g.sequence.handedOver,true);assert.deepEqual(g.used,[0]);
 assert.equal(publicBackgammon(g,'w').canUndo,false);
 assert.throws(()=>action(g,'roll'),/Move your current/);
 while(g.phase==='play')action(g,'move',legalBackgammonMoves(g)[0]);
 assert.equal(g.turn,1);assert.equal(g.phase,'roll');
 action(g,'roll');assert.equal(g.rollsBySide[1],1);assert.deepEqual(g.dice,[1,2]);
});

test('a completely blocked initial double never transfers and inherited blocking never transfers back',t=>{
 roll(t,[3,3,3,3]);
 const g=empty('gulbara',[]);g.phase='roll';g.rollsBySide[0]=3;put(g,10,0);put(g,7,1);
 action(g,'roll');assert.equal(g.turn,1);assert.equal(g.phase,'roll');assert.equal(g.sequence,null);assert.equal(g.points[7].count,1);
 const h=empty('gulbara',[]);h.phase='roll';h.rollsBySide[0]=3;put(h,10,0);put(h,4,1);put(h,1,0);
 action(h,'roll');action(h,'move',{from:10,dieIndex:0});
 assert.equal(h.turn,1);assert.equal(h.phase,'roll');assert.equal(h.sequence,null);assert.equal(h.points[4].owner,1);
});

test('ascending stages undo without rerolling; final completion commits',()=>{
 const g=empty('gulbara',[5,5,5,5]);put(g,23,0,15);put(g,12,1,15);
 g.sequence={roller:0,face:5,started:false,handedOver:false};
 for(let i=0;i<3;i++)action(g,'move',{from:23,dieIndex:i});
 const before=structuredClone(g);action(g,'move',{from:23,dieIndex:3});assert.equal(g.sequence.face,6);
 action(g,'undo');assert.deepEqual(g,before);
 action(g,'move',{from:23,dieIndex:3});
 while(g.phase==='play')action(g,'move',legalBackgammonMoves(g)[0]);
 assert.equal(publicBackgammon(g,'w').canUndo,false);
});

test('concession requires opponent acceptance, validates points and ends only this game',()=>{
 const g=newBackgammon(players,{starter:'w'});
 assert.throws(()=>action(g,'offerResignation',{points:0}));assert.throws(()=>action(g,'offerResignation',{points:'1'}));
 action(g,'offerResignation',{points:1},1);assert.equal(g.winner,null);
 assert.throws(()=>action(g,'acceptResignation',{},1),/other player/);
 assert.throws(()=>action(g,'roll'),/concession offer/);
 action(g,'declineResignation',{},0);assert.equal(publicBackgammon(g,'w').resignationOffer,null);
 action(g,'offerResignation',{points:2},1);action(g,'cancelResignation',{},1);
 action(g,'offerResignation',{points:2},1);action(g,'acceptResignation',{},0);
 assert.equal(g.winner,'w');assert.equal(g.scores.awarded,2);assert.equal(g.scores.resigned,true);
 const room={players};startBackgammonMatch(room,1);room.game=g;recordBackgammonResult(room);
 assert.equal(room.match.finished,false);assert.equal(room.match.cumulative.w,2);
 assert.equal(publicBackgammon(g,'w').resignationOffer,null);
});

test('complete seeded variant games preserve every checker including pinned ones',t=>{
 let seed=82713;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 t.mock.method(diceRandom,'roll',()=>1+Math.floor(random()*6));
 for(const variant of ['gulbara','tapa']){
  const g=newBackgammon(players,{variant,starter:'w'});
  let actions=0;
  while(!g.winner&&actions++<6000){
   if(g.phase==='roll')action(g,'roll');
   else {
    const moves=legalBackgammonMoves(g);assert.ok(moves.length);
    action(g,'move',moves[Math.floor(random()*moves.length)]);
   }
   for(const side of [0,1])assert.equal(count(g,side),15,variant+' checker conservation');
   assert.deepEqual(g.bar,[0,0]);
  }
  assert.ok(g.winner,variant+' must finish');
 }
});

test('outsiders and self-acceptance cannot manipulate concession scores',()=>{
 const g=newBackgammon(players,{starter:'w'}),before=structuredClone(g);
 for(const type of ['offerResignation','acceptResignation','declineResignation','cancelResignation'])assert.throws(()=>backgammonAction(g,'outsider',{type,points:2}),/not in this game/);
 assert.deepEqual(g,before);
 action(g,'offerResignation',{points:1});
 assert.throws(()=>action(g,'acceptResignation'),/other player/);
 assert.equal(publicBackgammon(g,'w').canUndo,false);
 assert.deepEqual(publicBackgammon(g,'w').legalMoves,[]);
 assert.equal(g.winner,null);
});
