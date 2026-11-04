import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { get } from 'node:http';
import { io } from 'socket.io-client';

// Register before triggering an action: acknowledgements on another socket do
// not guarantee this socket has received its room/roomLeft notification yet.
function waitForEvent(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, listener); reject(Error('Timed out waiting for ' + event)); }, 3000);
    function listener(value) {
      if (!predicate(value)) return;
      clearTimeout(timer); socket.off(event, listener); resolve(value);
    }
    socket.on(event, listener);
  });
}

const send = (socket, event, payload = {}) => socket.timeout(3000).emitWithAck(event, payload);
test('room leave, host transfer, forfeit, multi-tab cleanup and reconnect', {timeout:20000}, async t => {
  const child = spawn(process.execPath, ['server.js'], {env:{...process.env,PORT:'18089'},stdio:['ignore','pipe','pipe']});
  t.after(() => child.kill());
  await once(child.stdout, 'data');
  // Old unversioned URLs and new versioned URLs must both revalidate.
  for (const path of ['/', '/index.html', '/app.js', '/styles.css', '/app.js?v=1.0.7', '/styles.css?v=1.0.7', '/version']) {
    const response = await fetch('http://127.0.0.1:18089' + path);
    assert.equal(response.status, 200);
    const policy = response.headers.get('cache-control');
    if (path === '/' || path === '/index.html' || path === '/version') assert.equal(policy, 'no-store');
    else {
      assert.equal(policy, 'private, no-cache, max-age=0, must-revalidate');
      const etag = response.headers.get('etag');
      assert.ok(etag);
      // Use raw HTTP: fetch can add request Cache-Control: no-cache, which
      // deliberately forces Express to return a full 200 instead of a 304.
      const cached = await new Promise((resolve, reject) => {
        get('http://127.0.0.1:18089' + path, {headers:{'If-None-Match':etag}}, res => {
          res.resume(); res.on('end', () => resolve(res));
        }).on('error', reject);
      });
      assert.equal(cached.statusCode, 304);
      assert.equal(cached.headers['cache-control'], policy);
    }
    await response.arrayBuffer();
  }
  const version=await (await fetch('http://127.0.0.1:18089/version')).json();
  const html=await (await fetch('http://127.0.0.1:18089/')).text();
  assert.ok(html.includes('name="app-build" content="'+version.build+'"'));
  assert.ok(html.includes('/app.js?v='+version.build));
  assert.ok(html.includes('/styles.css?v='+version.build));
  assert.ok(!html.includes('__APP_BUILD__'));
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
  const expired=await connect('expired-session-token','Returning');
  assert.equal(expired.identity.sessionReplaced,true);
  assert.equal(expired.identity.resumed,false);
  assert.notEqual(expired.identity.token,'expired-session-token');
  const a=await connect(undefined,'Host'), b=await connect(undefined,'Guest');
  assert.equal(a.identity.sessionReplaced,false);
  const created=await send(a,'createRoom',{gameType:'rummy'});
  assert.equal((await send(b,'joinRoom',{id:created.id})).ok,true);
  const transferred = waitForEvent(b, 'room', state => state.hostId === b.identity.player.id);
  assert.equal((await send(a,'leaveRoom')).ok,true);
  const transferredState = await transferred;
  assert.equal(transferredState.hostId,b.identity.player.id);
  assert.equal(transferredState.players.length,1);
  assert.equal((await send(a,'joinRoom',{id:created.id})).ok,true);
  assert.equal((await send(b,'startGame',{sprintCount:2})).ok,true);
  const tab=await connect(a.identity.token,'Host');
  assert.equal(tab.identity.resumed,true);
  assert.equal(tab.identity.sessionReplaced,false);
  assert.equal((await send(tab,'createRoom',{})).ok,false);
  const leftA = waitForEvent(a, 'roomLeft');
  const leftTab = waitForEvent(tab, 'roomLeft');
  const rummyWon = waitForEvent(b, 'room', state => state.game?.winner === b.identity.player.id);
  assert.equal((await send(tab,'leaveRoom')).ok,true);
  await Promise.all([leftA, leftTab, rummyWon]);
  assert.equal(a.left,true);
  assert.equal(tab.left,true);
  assert.equal(b.room.game.winner,b.identity.player.id);
  assert.equal(b.room.match.finished,true);
  assert.equal(b.room.match.cumulative[b.identity.player.id],10);
  assert.equal(b.room.match.cumulative[a.identity.player.id],-10);
  assert.equal(Object.values(b.room.match.cumulative).reduce((sum, score) => sum + score,0),0);
  // Re-emitting the finished room must not count the hand twice.
  assert.equal((await send(b,'joinRoom',{id:created.id})).ok,true);
  assert.equal(b.room.match.cumulative[b.identity.player.id],10);
  assert.equal(b.room.match.cumulative[a.identity.player.id],-10);
  assert.equal((await send(a,'action',{type:'draw',from:'stock'})).ok,false);
  const reconnected=await connect(a.identity.token,'Host');
  assert.equal(reconnected.identity.resumed,false);
  assert.equal((await send(reconnected,'createRoom',{gameType:'backgammon'})).ok,true);
  const bgId=reconnected.room.id;
  assert.equal((await send(b,'leaveRoom')).ok,true);
  assert.equal((await send(b,'joinRoom',{id:bgId})).ok,true);
  assert.equal((await send(reconnected,'startGame',{gameCount:0})).ok,false);
  assert.equal((await send(reconnected,'startGame',{gameCount:3})).ok,true);
  assert.equal(reconnected.room.match.totalGames,3);
  assert.equal(reconnected.room.game.phase,'opening');
  assert.equal((await send(reconnected,'action',{type:'roll'})).ok,true);
  assert.ok(reconnected.room.game.openingRolls[0]>=1);
  assert.equal((await send(b,'action',{type:'roll'})).ok,true);
  const bgWon = waitForEvent(reconnected, 'room', state => state.game?.winner === reconnected.identity.player.id);
  assert.equal((await send(b,'leaveRoom')).ok,true);
  await bgWon;
  assert.equal(reconnected.room.game.winner,reconnected.identity.player.id);
  assert.equal(reconnected.room.game.scores.awarded,1);
  assert.equal(reconnected.room.match.cumulative[reconnected.identity.player.id],1);
  assert.equal(reconnected.room.match.finished,true);
  assert.equal((await send(reconnected,'leaveRoom')).ok,true);
  assert.equal((await send(b,'joinRoom',{id:bgId})).ok,false);
});
