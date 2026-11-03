import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { io } from 'socket.io-client';

const send = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);
test('room leave, host transfer, forfeit, multi-tab cleanup and reconnect', {timeout:20000}, async t => {
  const child = spawn(process.execPath, ['server.js'], {env:{...process.env,PORT:'18089'},stdio:['ignore','pipe','pipe']});
  t.after(() => child.kill());
  await once(child.stdout, 'data');
  const clients=[];
  t.after(() => clients.forEach(client=>client.disconnect()));
  async function connect(token, name='Player') {
    const socket=io('http://127.0.0.1:18089',{transports:['websocket'],forceNew:true,reconnection:false});
    clients.push(socket);
    await once(socket,'connect');
    socket.on('room', state=>{socket.room=state});
    socket.on('roomLeft', ()=>{socket.left=true;socket.room=null});
    const identity=await send(socket,'identify',{token,name});
    assert.equal(identity.ok,true);
    socket.identity=identity;
    return socket;
  }
  const a=await connect(undefined,'Host'), b=await connect(undefined,'Guest');
  const created=await send(a,'createRoom',{gameType:'rummy'});
  assert.equal((await send(b,'joinRoom',{id:created.id})).ok,true);
  assert.equal((await send(a,'leaveRoom')).ok,true);
  assert.equal(b.room.hostId,b.identity.player.id);
  assert.equal((await send(a,'joinRoom',{id:created.id})).ok,true);
  assert.equal((await send(b,'startGame',{sprintCount:2})).ok,true);
  const tab=await connect(a.identity.token,'Host');
  assert.equal(tab.identity.resumed,true);
  assert.equal((await send(tab,'createRoom',{})).ok,false);
  assert.equal((await send(tab,'leaveRoom')).ok,true);
  // Each socket's notifications precede its following acknowledgement.
  await send(a,'joinRoom',{id:'INVALID'});
  await send(b,'joinRoom',{id:created.id});
  assert.equal(a.left,true);
  assert.equal(tab.left,true);
  assert.equal(b.room.game.winner,b.identity.player.id);
  assert.equal(b.room.match.finished,true);
  assert.equal((await send(a,'action',{type:'draw',from:'stock'})).ok,false);
  const reconnected=await connect(a.identity.token,'Host');
  assert.equal(reconnected.identity.resumed,false);
  assert.equal((await send(reconnected,'createRoom',{gameType:'backgammon'})).ok,true);
  const bgId=reconnected.room.id;
  assert.equal((await send(b,'leaveRoom')).ok,true);
  assert.equal((await send(b,'joinRoom',{id:bgId})).ok,true);
  assert.equal((await send(reconnected,'startGame',{})).ok,true);
  assert.equal((await send(b,'leaveRoom')).ok,true);
  await send(reconnected,'joinRoom',{id:bgId});
  assert.equal(reconnected.room.game.winner,reconnected.identity.player.id);
  assert.equal((await send(reconnected,'leaveRoom')).ok,true);
  assert.equal((await send(b,'joinRoom',{id:bgId})).ok,false);
});
