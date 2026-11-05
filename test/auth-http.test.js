import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('optional authentication stays disabled cleanly and public rating responses contain no secrets',{timeout:10000},async t=>{
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'18102',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',PUBLIC_BASE_URL:''},stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());await once(child.stdout,'data');
 const account=await fetch('http://127.0.0.1:18102/api/account').then(response=>response.json());assert.deepEqual(account,{configured:false,account:null});
 const board=await fetch('http://127.0.0.1:18102/api/scoreboard').then(response=>response.json());assert.deepEqual(board,{ratings:[],recent:[]});assert.ok(!JSON.stringify(board).match(/email|token|subject/i));
 assert.equal((await fetch('http://127.0.0.1:18102/auth/google',{redirect:'manual'})).status,503);
 const logout=await fetch('http://127.0.0.1:18102/auth/logout',{method:'POST'});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
