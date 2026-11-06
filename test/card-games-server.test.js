import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {io} from 'socket.io-client';

const send=(socket,event,payload={})=>socket.timeout(3000).emitWithAck(event,payload);
const event=(socket,name,predicate=()=>true)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Timed out: '+name)),3000);const listener=value=>{if(predicate(value)){clearTimeout(timer);socket.off(name,listener);resolve(value)}};socket.on(name,listener)});

test('Santase and Blato rooms enforce seats, privacy, spectators and server actions',{timeout:15000},async t=>{
 const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'18105'},stdio:['ignore','pipe','pipe']});t.after(()=>server.kill());await once(server.stdout,'data');
 const clients=[];t.after(()=>clients.forEach(socket=>socket.disconnect()));
 async function connect(name){const socket=io('http://127.0.0.1:18105',{transports:['websocket'],forceNew:true,reconnection:false});clients.push(socket);await once(socket,'connect');socket.on('room',room=>socket.room=room);socket.identity=await send(socket,'identify',{name});return socket}
 const a=await connect('A'),b=await connect('B'),c=await connect('C'),watcher=await connect('Watcher');

 const santase=await send(a,'createRoom',{name:'Sixty-six',gameType:'santase'});assert.equal(santase.ok,true);assert.equal(a.room.maxPlayers,2);
 assert.equal((await send(b,'joinRoom',{id:santase.id})).ok,true);assert.equal((await send(watcher,'watchRoom',{id:santase.id})).ok,true);
 const santaseStarted=event(watcher,'room',room=>room.game?.kind==='santase');assert.equal((await send(a,'startGame',{})).ok,true);await santaseStarted;
 assert.deepEqual(watcher.room.game.hands,[{count:6},{count:6}]);assert.equal(watcher.room.game.legalCardIds.length,0);
 assert.equal((await send(watcher,'action',{type:'claim66'})).ok,false);
 const santaseFinished=event(a,'room',room=>room.game?.finished);assert.equal((await send(b,'leaveRoom')).ok,true);await santaseFinished;assert.equal(a.room.game.awarded,1);
 assert.equal((await send(watcher,'leaveRoom')).ok,true);assert.equal((await send(a,'leaveRoom')).ok,true);

 const blato=await send(a,'createRoom',{name:'Mud',gameType:'blato'});assert.equal(blato.ok,true);assert.equal(a.room.maxPlayers,3);
 assert.equal((await send(b,'joinRoom',{id:blato.id})).ok,true);assert.equal((await send(c,'joinRoom',{id:blato.id})).ok,true);assert.equal((await send(watcher,'watchRoom',{id:blato.id})).ok,true);
 const blatoStarted=event(watcher,'room',room=>room.game?.kind==='blato');assert.equal((await send(a,'startGame',{})).ok,true);await blatoStarted;
 assert.deepEqual(watcher.room.game.hands,[{count:16},{count:16},{count:16}]);assert.equal(watcher.room.game.phase,'bid');
 const bidder=[a,b,c].find(socket=>socket.identity.player.id===b.room.game.players[b.room.game.turn]);
 const kitty=event(watcher,'room',room=>room.game?.phase==='kitty');assert.equal((await send(bidder,'action',{type:'bid',contract:'♥'})).ok,true);await kitty;assert.equal(watcher.room.game.kitty.length,4);
 const eight=[a,b,c].find(socket=>socket.identity.player.id===a.room.game.players[a.room.game.eightSide]);
 const own=eight.room.game.hands[eight.room.game.players.indexOf(eight.identity.player.id)],ids=[...own.slice(0,2),...eight.room.game.kitty.slice(0,2)].map(card=>card.id);
 const playing=event(watcher,'room',room=>room.game?.phase==='play');assert.equal((await send(eight,'action',{type:'discardKitty',cardIds:ids})).ok,true);await playing;
 assert.deepEqual(watcher.room.game.hands,[{count:16},{count:16},{count:16}]);assert.equal(watcher.room.game.discarded.count,4);
});
