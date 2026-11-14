import test from 'node:test';
import assert from 'node:assert/strict';
import {newCrossroads,publicCrossroads,crossroadsAction,crossroadsGeometry,forfeitCrossroads} from '../lib/crossroads.js';

const players=['a','b','c','d'].map(id=>({id}));

function finishSetup(game){
 while(game.phase.startsWith('setup-')){
  const id=game.players[game.turn],view=publicCrossroads(game,id);
  if(game.phase==='setup-village')crossroadsAction(game,id,{type:'buildVillage',vertex:view.legalVertices[0]});
  else crossroadsAction(game,id,{type:'buildRoute',edge:view.legalEdges[0]});
 }
}

test('Crossroads board has the standard base-game graph and private hands',()=>{
 assert.equal(crossroadsGeometry.hexes.length,19);assert.equal(crossroadsGeometry.vertices.length,54);assert.equal(crossroadsGeometry.edges.length,72);
 const game=newCrossroads(players.slice(0,3));
 assert.deepEqual(game.tiles.reduce((counts,tile)=>(counts[tile.resource]=(counts[tile.resource]||0)+1,counts),{}),{timber:4,stone:3,livestock:4,grain:4,metal:3,wasteland:1});
 const a=publicCrossroads(game,'a'),watch=publicCrossroads(game,null);
 assert.equal(a.resources[0].timber,0);assert.deepEqual(a.resources[1],{count:0});assert.deepEqual(watch.resources,[{count:0},{count:0},{count:0}]);
 assert.equal(watch.fortunes[0].count,0);assert.equal(a.legalVertices.length,54);
});

test('snake setup enforces distance, grants second-village materials and reaches roll',()=>{
 const game=newCrossroads(players.slice(0,3));finishSetup(game);
 assert.equal(game.phase,'roll');assert.equal(game.turn,0);assert.equal(game.buildings.length,6);assert.equal(game.routes.length,6);
 for(const building of game.buildings)for(const other of game.buildings)if(building!==other)assert.ok(!crossroadsGeometry.adjacentVertices[building.vertex].includes(other.vertex));
 assert.ok(game.resources.every(hand=>Object.values(hand).reduce((a,b)=>a+b,0)>=1));
 crossroadsAction(game,'a',{type:'roll'});assert.ok(['action','discard','raider'].includes(game.phase));assert.equal(game.dice.length,2);
});

test('server validates costs, building, bank trades and player trades',()=>{
 const game=newCrossroads(players.slice(0,3));finishSetup(game);game.phase='action';game.turn=0;Object.assign(game.resources[0],{timber:1,stone:1});const candidate=publicCrossroads(game,'a').legalEdges[0];for(const name of Object.keys(game.resources[0]))game.resources[0][name]=0;
 assert.throws(()=>crossroadsAction(game,'a',{type:'buildRoute',edge:candidate}),/required materials/);
 Object.assign(game.resources[0],{timber:6,stone:2,livestock:1,grain:1,metal:1});
 const edge=publicCrossroads(game,'a').legalEdges[0];crossroadsAction(game,'a',{type:'buildRoute',edge});assert.ok(game.routes.some(route=>route.edge===edge&&route.side===0));
 crossroadsAction(game,'a',{type:'bankTrade',give:'timber',get:'metal'});assert.equal(game.resources[0].metal,2);
 game.resources[1].grain=2;crossroadsAction(game,'a',{type:'offerTrade',give:{metal:1},want:{grain:1}});crossroadsAction(game,'b',{type:'acceptTrade'});
 assert.equal(game.trade,null);assert.equal(game.resources[0].grain,2);assert.equal(game.resources[1].metal,1);
});

test('fortune identities stay private and forfeit completes a game',()=>{
 const game=newCrossroads(players.slice(0,3));finishSetup(game);game.phase='action';game.turn=0;Object.assign(game.resources[0],{livestock:1,grain:1,metal:1});
 crossroadsAction(game,'a',{type:'buyFortune'});const own=publicCrossroads(game,'a'),other=publicCrossroads(game,'b');assert.equal(typeof own.fortunes[0][0].type,'string');assert.deepEqual(other.fortunes[0],{count:1});
 forfeitCrossroads(game,'c');assert.equal(game.finished,true);assert.notEqual(game.winner,'c');
});

test('seven discards are simultaneous and free-route Fortune resumes the turn',()=>{
 const game=newCrossroads(players.slice(0,3));finishSetup(game);game.turn=0;game.phase='discard';game.pendingDiscards=[4,4,0];
 Object.assign(game.resources[0],{timber:4,stone:4,livestock:0,grain:0,metal:0});Object.assign(game.resources[1],{timber:0,stone:0,livestock:4,grain:4,metal:0});
 crossroadsAction(game,'b',{type:'discard',resources:{livestock:2,grain:2}});assert.equal(game.phase,'discard');crossroadsAction(game,'a',{type:'discard',resources:{timber:2,stone:2}});assert.equal(game.phase,'raider');
 game.phase='action';game.pendingDiscards=[0,0,0];game.turnNumber=5;game.fortunes[0].push({id:'routes',type:'routes',boughtTurn:1});
 crossroadsAction(game,'a',{type:'playFortune',cardId:'routes'});assert.equal(game.phase,'free-routes');assert.equal(game.freeRoutes,2);
 let view=publicCrossroads(game,'a');crossroadsAction(game,'a',{type:'buildRoute',edge:view.legalEdges[0]});view=publicCrossroads(game,'a');assert.ok(['free-routes','action'].includes(game.phase));if(game.phase==='free-routes')crossroadsAction(game,'a',{type:'buildRoute',edge:view.legalEdges[0]});assert.equal(game.phase,'action');assert.equal(game.freeRoutes,0);
});
