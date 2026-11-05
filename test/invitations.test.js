import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {io} from 'socket.io-client';

const send=(socket,event,payload={})=>socket.timeout(3000).emitWithAck(event,payload);
const next=(socket,event,predicate=()=>true)=>new Promise(resolve=>{const listener=value=>{if(predicate(value)){socket.off(event,listener);resolve(value)}};socket.on(event,listener)});

test('invitations persist, revalidate, seat the recipient, and expose current game labels',{timeout:15000},async t=>{
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'18098'},stdio:['ignore','pipe','pipe']});
 t.after(()=>child.kill());await once(child.stdout,'data');
 const clients=[];t.after(()=>clients.forEach(client=>client.disconnect()));
 async function connect(name,token){
  const socket=io('http://127.0.0.1:18098',{transports:['websocket'],forceNew:true,reconnection:false});clients.push(socket);await once(socket,'connect');
  socket.on('gameInvitation',value=>socket.invitation=value);
  socket.identity=await send(socket,'identify',{name,token});assert.equal(socket.identity.ok,true);return socket;
 }
 const host=await connect('Host'),guest=await connect('Guest'),other=await connect('Other');
 const hostRoom=next(host,'room');const created=await send(host,'createRoom',{name:'Invitation table',gameType:'rummy'});assert.equal(created.ok,true);
 assert.equal((await hostRoom).maxPlayers,2,'server fallback must match the two-player browser default');

 const firstInvite=next(guest,'gameInvitation',Boolean);assert.equal((await send(host,'invitePlayer',{playerId:guest.identity.player.id})).ok,true);
 const declined=await firstInvite;assert.equal(declined.fromName,'Host');assert.equal(declined.gameType,'rummy');
 assert.deepEqual(await send(guest,'respondInvitation',{id:declined.id,accept:false}),{ok:true,joined:false});

 const secondInvite=next(guest,'gameInvitation',Boolean);await send(host,'invitePlayer',{playerId:guest.identity.player.id});const pending=await secondInvite;
 guest.disconnect();const resumedInvitePromise=(async()=>{const resumed=await connect('Guest',guest.identity.token);return {resumed,invitation:resumed.invitation||await next(resumed,'gameInvitation',Boolean)}})();
 const {resumed,invitation}=await resumedInvitePromise;assert.equal(invitation.id,pending.id,'pending invitation must survive reconnect');
 const joinedRoom=next(resumed,'room',room=>room.id===created.id);assert.deepEqual(await send(resumed,'respondInvitation',{id:invitation.id,accept:true}),{ok:true,joined:true});assert.equal((await joinedRoom).players.length,2);
 assert.equal((await send(host,'invitePlayer',{playerId:other.identity.player.id})).ok,false,'a full table cannot invite another player');

 const lobbyGame=next(other,'lobby',rooms=>rooms.some(room=>room.id===created.id&&room.currentGame));
 assert.equal((await send(host,'startGame',{sprintCount:2})).ok,true);
 const entry=(await lobbyGame).find(room=>room.id===created.id);assert.equal(entry.currentGame.number,1);assert.equal(entry.currentGame.totalGames,6);assert.equal(entry.currentGame.variant,null);
});
