import {chromium} from 'playwright';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
import {spawn} from 'node:child_process';import {once} from 'node:events';import assert from 'node:assert/strict';
let server,browser;
async function start(){server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'18091'},stdio:['ignore','pipe','pipe']});await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Test server did not start')),10000);server.stdout.once('data',()=>{clearTimeout(timer);resolve()});server.once('error',error=>{clearTimeout(timer);reject(error)})})}
try{
 await start();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);const [a,b]=await Promise.all(contexts.map(c=>c.newPage()));for(const p of [a,b])p.setDefaultTimeout(10000);const errors=[];
 for(const [p,name] of [[a,'Milen'],[b,'Ilia']]){p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:18091');await p.locator('#name').fill(name);await p.locator('#identity button').click()}
 await a.locator('#newRoom').click();await a.locator('#gameType').selectOption('backgammon');await a.locator('#createGo').click();await b.locator('[data-join]').click();await a.locator('#start').click();await a.locator('#bgMatchGo').click();
 await a.locator('#roll').click();await b.locator('#roll').click();await a.waitForFunction(()=>document.querySelectorAll('.roll-history li').length===2);
 const lines=await a.locator('.roll-history li').allTextContents();assert.equal(lines.length,2);assert.match(lines[0],/#2/);assert.match(lines[1],/#1/);
 const token=await a.evaluate(()=>{localStorage.setItem('rummyOrder:keep','["saved-card"]');return localStorage.token});
 await a.reload();await a.locator('.roll-history').waitFor();assert.deepEqual(await a.locator('.roll-history li').allTextContents(),lines);assert.equal(await a.evaluate(()=>localStorage.token),token);
 const exited=once(server,'exit');server.kill();await exited;await start();
 await a.locator('#lobby:not([hidden])').waitFor({timeout:15000});await b.locator('#lobby:not([hidden])').waitFor({timeout:15000});
 assert.equal(await a.locator('#room').isVisible(),false);assert.equal(await a.locator('#game').innerHTML(),'');
 assert.notEqual(await a.evaluate(()=>localStorage.token),token);assert.equal(await a.evaluate(()=>localStorage.name),'Milen');assert.equal(await a.evaluate(()=>localStorage.getItem('rummyOrder:keep')),'["saved-card"]');
 await a.locator('#newRoom').click();await a.locator('#createGo').click();await a.locator('#room:not([hidden])').waitFor();
 await a.route('**/version',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({environment:'web-qa',version:'next-test',build:'new-server-build'})}));
 const oldUrl=a.url();await a.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await a.locator('#updateNotice:not([hidden])').waitFor();
 assert.equal(a.url(),oldUrl);assert.ok((await a.locator('#buildInfo').innerText()).includes('v'+version));assert.match(await a.locator('#updateMessage').innerText(),/next-test/);
 const newToken=await a.evaluate(()=>localStorage.token);await a.unroute('**/version');
 await Promise.all([a.waitForURL(/_buildReload=/),a.locator('#reloadUpdate').click()]);await a.locator('#room:not([hidden])').waitFor();
 assert.equal(await a.locator('#updateNotice').isVisible(),false);assert.equal(await a.evaluate(()=>localStorage.token),newToken);assert.equal(await a.evaluate(()=>localStorage.getItem('rummyOrder:keep')),'["saved-card"]');
 assert.deepEqual(errors,[]);console.log('PASS: numbered roll history survives valid resume, server restart recovers expired sessions, update notice detects mismatch without forcing reload, one-click reload preserves player/order data');
}finally{await browser?.close();server?.kill()}
