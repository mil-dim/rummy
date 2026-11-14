import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {io} from 'socket.io-client';

const send=(socket,event,payload={})=>socket.timeout(3000).emitWithAck(event,payload);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('Crossroads room requires 3–4 players and preserves private materials',{timeout:15000},async t=>{
 const server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'18107'},stdio:['ignore','pipe','pipe']});t.after(()=>server.kill());await once(server.stdout,'data');
 const clients=[];t.after(()=>clients.forEach(socket=>socket.disconnect()));
 async function connect(name){const socket=io('http://127.0.0.1:18107',{transports:['websocket'],forceNew:true,reconnection:false});clients.push(socket);await once(socket,'connect');socket.on('room',value=>socket.room=value);socket.identity=await send(socket,'identify',{name});return socket}
 const a=await connect('A'),b=await connect('B'),c=await connect('C'),watcher=await connect('Watcher');
 const created=await send(a,'createRoom',{name:'Thrace',gameType:'crossroads',maxPlayers:3});assert.equal(created.ok,true);await wait(10);assert.equal(a.room.maxPlayers,3);
 assert.equal((await send(a,'startGame',{})).ok,false);assert.equal((await send(b,'joinRoom',{id:created.id})).ok,true);assert.equal((await send(c,'joinRoom',{id:created.id})).ok,true);assert.equal((await send(watcher,'watchRoom',{id:created.id})).ok,true);
 assert.equal((await send(a,'startGame',{})).ok,true);await wait(30);assert.equal(a.room.game.kind,'crossroads');assert.equal(watcher.room.game.kind,'crossroads');
 assert.deepEqual(watcher.room.game.resources,[{count:0},{count:0},{count:0}]);assert.deepEqual(watcher.room.game.fortunes,[{count:0},{count:0},{count:0}]);assert.equal(watcher.room.game.board.hexes.length,19);assert.equal(watcher.room.game.phase,'opening');
 assert.equal((await send(watcher,'action',{type:'buildVillage',vertex:0})).ok,false);
 for(let guard=0;watcher.room.game.phase==='opening'&&guard++<20;)for(const socket of [a,b,c])if(socket.room.game.can.openingRoll){assert.equal((await send(socket,'action',{type:'openingRoll'})).ok,true);await wait(10)}
 assert.equal(watcher.room.game.phase,'setup-village');const starterId=watcher.room.game.players[watcher.room.game.turn],starter=[a,b,c].find(socket=>socket.identity.player.id===starterId),vertex=starter.room.game.legalVertices[0];assert.equal((await send(starter,'action',{type:'buildVillage',vertex})).ok,true);await wait(20);assert.equal(starter.room.game.phase,'setup-route');assert.equal(starter.room.game.buildings.length,1);
});
