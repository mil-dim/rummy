import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {io} from 'socket.io-client';
const send=(socket,event,payload={})=>socket.timeout(3000).emitWithAck(event,payload);
function event(socket,name,predicate=()=>true){return new Promise((resolve,reject)=>{
 const timeout=setTimeout(()=>{socket.off(name,listener);reject(Error('Timed out: '+name))},3000);
 function listener(value){if(predicate(value)){clearTimeout(timeout);socket.off(name,listener);resolve(value)}}
 socket.on(name,listener);
})}

test('watchers receive live public state, resume safely, cannot play, and leave without forfeit',{timeout:20000},async t=>{
 const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'18092'},stdio:['ignore','pipe','pipe']});t.after(()=>server.kill());await once(server.stdout,'data');
 const clients=[];t.after(()=>clients.forEach(s=>s.disconnect()));
 async function connect(name,token){
  const s=io('http://127.0.0.1:18092',{transports:['websocket'],forceNew:true,reconnection:false});clients.push(s);await once(s,'connect');
  s.on('room',room=>s.room=room);s.on('roomLeft',()=>{s.left=true;s.room=null});s.on('lobby',rooms=>s.lobby=rooms);
  const resumed=token?event(s,'room'):null;
  s.identity=await send(s,'identify',{name,token});assert.equal(s.identity.ok,true);if(resumed)await resumed;
  return s;
 }
 const a=await connect('Host'),b=await connect('Player'),watcher=await connect('Watch'),other=await connect('Other watcher');
 const made=await send(a,'createRoom',{name:'Public Rummy',gameType:'rummy',maxPlayers:2});assert.equal(made.ok,true);
 assert.equal((await send(b,'joinRoom',{id:made.id})).ok,true);
 assert.equal((await send(watcher,'watchRoom',{id:made.id})).ok,true);
 assert.equal(watcher.room.role,'watcher');assert.equal(watcher.room.players.length,2);assert.equal(watcher.room.hostId,a.identity.player.id);
 const lobby=watcher.lobby.find(r=>r.id===made.id);assert.deepEqual(lobby.playerList.map(p=>p.name),['Host','Player']);assert.equal(lobby.watchers[0].name,'Watch');assert.equal(lobby.status,'waiting');
 for(const member of [...lobby.playerList,...lobby.watchers])assert.deepEqual(Object.keys(member).sort(),['connected','id','name']);
 const started=event(watcher,'room',r=>!!r.game),bStarted=event(b,'room',r=>!!r.game);
 assert.equal((await send(a,'startGame',{sprintCount:2})).ok,true);await Promise.all([started,bStarted]);
 let g=watcher.room.game;assert.equal(watcher.room.protocolVersion,8);
 for(const id of g.players)assert.deepEqual(g.hands[id],{count:13});assert.equal(g.canUndo,false);assert.deepEqual(Object.keys(g.stock),['count']);
 const hidden=[...a.room.game.hands[a.identity.player.id],...b.room.game.hands[b.identity.player.id]].map(c=>c.id);
 for(const id of hidden)assert.ok(!JSON.stringify(watcher.room).includes(id),'hand IDs must not reach watcher');
 for(const request of [
  ['action',{type:'draw',from:'stock',playerId:a.identity.player.id}],['action',{type:'undo'}],['action',{type:'meld',cardIds:hidden.slice(0,3)}],
  ['startGame',{}],['joinRoom',{id:made.id}],['createRoom',{gameType:'rummy'}]
 ])assert.equal((await send(watcher,...request)).ok,false);
 const drawn=event(watcher,'room',r=>r.game.hands[a.identity.player.id].count===14);
 assert.equal((await send(a,'action',{type:'draw',from:'stock'})).ok,true);await drawn;
 assert.equal(watcher.room.game.canUndo,false);
 const token=watcher.identity.token;watcher.disconnect();
 const resumed=await connect('Watch',token);assert.equal(resumed.identity.resumed,true);assert.equal(resumed.room.role,'watcher');assert.equal(resumed.room.watchers.length,1);
 assert.equal((await send(other,'watchRoom',{id:made.id})).ok,true);
 const before=JSON.stringify(a.room.game),left=event(resumed,'roomLeft');assert.equal((await send(resumed,'leaveRoom')).ok,true);await left;
 assert.equal(JSON.stringify(a.room.game),before);assert.equal(a.room.match.endAfterHand,undefined);
 // Rejoin, then a second tab with the same watcher token. Leaving clears both tabs.
 assert.equal((await send(resumed,'watchRoom',{id:made.id})).ok,true);
 const tab=await connect('Watch',token);assert.equal(tab.room.watchers.length,2);
 const leftOld=event(resumed,'roomLeft'),leftNew=event(tab,'roomLeft');assert.equal((await send(tab,'leaveRoom')).ok,true);await Promise.all([leftOld,leftNew]);
 const finished=event(other,'room',r=>!!r.game?.winner);assert.equal((await send(b,'leaveRoom')).ok,true);await finished;
 for(const id of other.room.game.players)assert.ok(Array.isArray(other.room.game.hands[id]),'finished hands show scoring evidence');
 const closed=event(other,'roomLeft');assert.equal((await send(a,'leaveRoom')).ok,true);await closed;assert.equal(other.room,null);
 // Full Backgammon rooms remain watchable; watchers cannot roll, move or accept concessions.
 const bg=await send(a,'createRoom',{name:'BG watchers',gameType:'backgammon'});assert.equal((await send(b,'joinRoom',{id:bg.id})).ok,true);
 assert.equal((await send(other,'watchRoom',{id:bg.id})).ok,true);
 const opening=event(other,'room',r=>!!r.game);assert.equal((await send(a,'startGame',{roundCount:1})).ok,true);await opening;
 for(const variant of ['normal','gulbara','tapa']){
  assert.equal(other.room.game.variant,variant);assert.equal(other.room.role,'watcher');assert.deepEqual(other.room.game.legalMoves,[]);assert.equal(other.room.game.canUndo,false);
  for(const type of ['roll','move','undo','offerResignation','acceptResignation','declineResignation'])assert.equal((await send(other,'action',{type,from:0,dieIndex:0,points:1})).ok,false);
  const offered=event(other,'room',r=>!!r.game.resignationOffer);assert.equal((await send(b,'action',{type:'offerResignation',points:1})).ok,true);await offered;
  assert.equal(other.room.game.resignationOffer.points,1);
  const result=event(other,'room',r=>!!r.game.winner);assert.equal((await send(a,'action',{type:'acceptResignation'})).ok,true);await result;
  if(variant!=='tapa'){const next=event(other,'room',r=>r.game?.variant!==variant);assert.equal((await send(a,'startGame')).ok,true);await next;}
 }
 assert.equal(other.room.match.finished,true);assert.equal(other.room.match.cumulative[a.identity.player.id],3);
});
