import test from 'node:test';import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';import {once} from 'node:events';import http from 'node:http';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {io} from 'socket.io-client';
const send=(s,event,payload={})=>s.timeout(3000).emitWithAck(event,payload);
test('private operations API, draining, audit, rename and signout authorization',{timeout:20000},async t=>{
 const dir=mkdtempSync(join(tmpdir(),'tabletop-ops-')),tokenPath=join(dir,'admin.token'),auditDir=join(dir,'dice');
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'18094',ADMIN_PORT:'18095',ADMIN_TOKEN_FILE:tokenPath,DICE_AUDIT_DIR:auditDir},stdio:['ignore','pipe','pipe']});
 t.after(()=>{child.kill();rmSync(dir,{recursive:true,force:true})});await once(child.stdout,'data');
 const clients=[];t.after(()=>clients.forEach(s=>s.disconnect()));
 async function connect(name,token){const s=io('http://127.0.0.1:18094',{transports:['websocket'],forceNew:true,reconnection:false});clients.push(s);await once(s,'connect');s.on('room',r=>s.room=r);s.on('people',p=>s.people=p);s.on('identityChanged',p=>s.changed=p);s.on('signedOut',()=>s.loggedOut=true);s.identity=await send(s,'identify',{name,token});assert.equal(s.identity.ok,true);return s}
 const admin=(method,path,body)=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:18095,method,path,headers:{Authorization:'Bearer '+readFileSync(tokenPath,'utf8')}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({code:res.statusCode,...JSON.parse(data)}))});req.on('error',reject);req.end(body?JSON.stringify(body):null)});
 assert.equal((await fetch('http://127.0.0.1:18094/status')).status,404);assert.equal((await fetch('http://127.0.0.1:18094/maintenance',{method:'POST'})).status,404);
 const unauthorized=await fetch('http://127.0.0.1:18095/status');assert.equal(unauthorized.status,401);
 assert.deepEqual((await admin('GET','/accounts')).accounts,[]);
 const a=await connect('Milen'),b=await connect('Ilia'),c=await connect('Lobby');
 const room=await send(a,'createRoom',{name:'Same table',gameType:'backgammon'});assert.equal(room.ok,true);
 const duplicate=await send(c,'createRoom',{name:'same TABLE',gameType:'rummy'});assert.equal(duplicate.ok,true);assert.equal(c.room.name,'same TABLE 2');await send(c,'leaveRoom');
 assert.equal((await send(b,'joinRoom',{id:room.id})).ok,true);assert.equal((await send(a,'startGame',{roundCount:1})).ok,true);
 const beforeId=a.identity.player.id;assert.equal((await send(a,'rename',{name:'New Milen'})).ok,true);assert.equal(a.changed.id,beforeId);assert.equal(a.room.players[0].name,'New Milen');
 assert.equal((await send(a,'signOut')).ok,false);assert.ok(a.room.game);
 assert.equal((await admin('POST','/maintenance',{minutes:-1})).code,400);
 const announced=await admin('POST','/maintenance',{minutes:10,message:'Deploy test'});assert.equal(announced.maintenance.message,'Deploy test');assert.equal(announced.onlineUsers,3);assert.equal(announced.safeToDeploy,false);
 const blocked=spawnSync(process.execPath,['scripts/admin.mjs','ready'],{env:{...process.env,ADMIN_PORT:'18095',ADMIN_TOKEN_FILE:tokenPath}});assert.equal(blocked.status,1);
 assert.equal((await send(c,'createRoom',{gameType:'rummy'})).ok,false);assert.equal((await send(c,'joinRoom',{id:room.id})).ok,false);
 // Current games continue and logging records only successful physical rolls.
 assert.equal((await send(a,'action',{type:'roll'})).ok,true);assert.equal((await send(a,'action',{type:'roll'})).ok,false);assert.equal((await send(b,'action',{type:'roll'})).ok,true);
 const rows=readdirSync(auditDir).flatMap(file=>readFileSync(join(auditDir,file),'utf8').trim().split('\n').map(JSON.parse));
 assert.equal(rows.length,2);assert.ok(rows.every(row=>row.kind==='opening'&&row.dice.length===1));assert.ok(!JSON.stringify(rows).includes('Milen'));
 const status=await admin('GET','/status');assert.equal(status.audit.writtenThisBoot,2);assert.equal(status.unfinishedGames.length,1);assert.ok(status.memory.rss>0);
 await admin('POST','/maintenance',{minutes:0});assert.equal((await admin('GET','/status')).safeToDeploy,false);
 await send(a,'leaveRoom');await send(b,'leaveRoom');const tab=await connect('New Milen',a.identity.token); // same identity, no room
 assert.equal((await send(a,'signOut')).ok,true);
 await new Promise(resolve=>setTimeout(resolve,25));assert.equal(tab.loggedOut,true);assert.equal((await send(tab,'rename',{name:'Cannot rename'})).ok,false);
 await send(b,'signOut');await send(c,'signOut');
 const ready=await admin('GET','/status');assert.equal(ready.onlineUsers,0);assert.equal(ready.unfinishedGames.length,0);assert.equal(ready.safeToDeploy,true);
 const allowed=spawnSync(process.execPath,['scripts/admin.mjs','ready'],{env:{...process.env,ADMIN_PORT:'18095',ADMIN_TOKEN_FILE:tokenPath}});assert.equal(allowed.status,0);assert.equal(JSON.parse(allowed.stdout).maintenance.locked,true);
 const cancelled=await admin('POST','/maintenance',{cancel:true});assert.equal(cancelled.maintenance,null);assert.equal(cancelled.safeToDeploy,false);
});
