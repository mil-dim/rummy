import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {io} from 'socket.io-client';
import {createScoreStore} from '../lib/score-store.js';

const send=(socket,event,payload={})=>socket.timeout(3000).emitWithAck(event,payload);
const event=(socket,name,predicate=()=>true)=>new Promise(resolve=>{const listener=value=>{if(predicate(value)){socket.off(name,listener);resolve(value)}};socket.on(name,listener)});

test('approved signed players can finish one idempotent rated match while guests remain optional',{timeout:15000},async t=>{
 const dir=mkdtempSync(join(tmpdir(),'tabletop-rated-')),dbPath=join(dir,'scores.sqlite');let store=createScoreStore(dbPath);
 const alice=store.upsertGoogle({sub:'alice',email:'alice@example.test',name:'Alice'}),bob=store.upsertGoogle({sub:'bob',email:'bob@example.test',name:'Bob'});
 store.setApproved(alice.id,true);store.setApproved(bob.id,true);const aAuth=store.createSession(alice.id),bAuth=store.createSession(bob.id);store.close();
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'18101',SCORE_DB_PATH:dbPath},stdio:['ignore','pipe','pipe']});
 t.after(()=>{child.kill();rmSync(dir,{recursive:true,force:true})});await once(child.stdout,'data');const clients=[];t.after(()=>clients.forEach(socket=>socket.disconnect()));
 async function connect(name,token){const socket=io('http://127.0.0.1:18101',{transports:['websocket'],forceNew:true,reconnection:false,extraHeaders:{Cookie:'tabletop_auth='+token}});clients.push(socket);await once(socket,'connect');socket.on('room',room=>socket.room=room);socket.identity=await send(socket,'identify',{name});return socket}
 const a=await connect('Alice',aAuth.token),b=await connect('Bob',bAuth.token);assert.equal(a.identity.player.account.approved,true);assert.equal(b.identity.player.account.approved,true);
 const made=await send(a,'createRoom',{gameType:'backgammon'});assert.equal(made.ok,true);assert.equal((await send(b,'joinRoom',{id:made.id})).ok,true);
 const started=event(a,'room',room=>room.match?.rated===true);assert.equal((await send(a,'startGame',{roundCount:1,variantMode:'normal',rated:true})).ok,true);await started;
 const finished=event(a,'room',room=>room.match?.finished&&room.match?.ratingChanges?.length===2);assert.equal((await send(b,'leaveRoom')).ok,true);const final=await finished;
 assert.equal(final.match.rated,true);assert.equal(final.match.ratingChanges.reduce((sum,row)=>sum+row.delta,0),0);
 const board=await fetch('http://127.0.0.1:18101/api/scoreboard').then(response=>response.json());assert.equal(board.ratings.length,2);assert.equal(board.recent.length,1);assert.deepEqual(board.recent[0].players.map(player=>player.display_name).sort(),['Alice','Bob']);
});
