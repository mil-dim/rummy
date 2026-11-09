import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('optional authentication stays disabled cleanly and public rating responses contain no secrets',{timeout:10000},async t=>{
 const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'18102',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',PUBLIC_BASE_URL:''},stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());await once(child.stdout,'data');
 const account=await fetch('http://127.0.0.1:18102/api/account').then(response=>response.json());assert.deepEqual(account,{configured:false,account:null});
 const board=await fetch('http://127.0.0.1:18102/api/scoreboard').then(response=>response.json());assert.deepEqual(board,{ratings:[],recent:[]});assert.ok(!JSON.stringify(board).match(/email|token|subject/i));
 assert.equal((await fetch('http://127.0.0.1:18102/auth/google',{redirect:'manual'})).status,503);
 const home=await fetch('http://127.0.0.1:18102/').then(response=>response.text());assert.match(home,/href="\/privacy"/);assert.match(home,/href="\/terms"/);assert.match(home,/id="feedbackDialog"/);assert.match(home,/id="feedbackCancel" type="button"/);assert.doesNotMatch(home,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
 const privacy=await fetch('http://127.0.0.1:18102/privacy');assert.equal(privacy.status,200);assert.equal(privacy.headers.get('cache-control'),'no-store');assert.match(await privacy.text(),/Google access tokens[^<]+are not retained/);
 assert.match(await fetch('http://127.0.0.1:18102/privacy').then(response=>response.text()),/limited usage analytics/);
 assert.match(await fetch('http://127.0.0.1:18102/privacy').then(response=>response.text()),/feedback form[^<]+stores/);
 const terms=await fetch('http://127.0.0.1:18102/terms');assert.equal(terms.status,200);assert.equal(terms.headers.get('cache-control'),'no-store');assert.match(await terms.text(),/not a gambling service/);
 const logout=await fetch('http://127.0.0.1:18102/auth/logout',{method:'POST'});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});
