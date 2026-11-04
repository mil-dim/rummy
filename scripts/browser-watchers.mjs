import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
let server,browser;
try{
 server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'18093'},stdio:['ignore','pipe','pipe']});await once(server.stdout,'data');
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
 const [a,b,w]=await Promise.all(contexts.map(context=>context.newPage()));const errors=[];
 for(const [page,name] of [[a,'Milen'],[b,'Ilia'],[w,'Watch']]){
  page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:18093');await page.locator('#name').fill(name);await page.locator('#identity button').click();
 }
 await a.locator('#newRoom').click();await a.locator('#gameType').selectOption('rummy');await a.locator('#maxPlayers').fill('2');await a.locator('#createGo').click();await b.locator('[data-join]').click();await a.locator('#start').click();await a.locator('#matchGo').click();
 await w.locator('.room-status').filter({hasText:'In progress'}).waitFor();
 assert.match(await w.locator('.room-members').innerText(),/Milen.*Ilia/);
 assert.equal(await w.locator('[data-join]').isEnabled(),false);assert.equal(await w.locator('[data-watch]').isEnabled(),true);
 await w.locator('[data-watch]').click();await w.locator('#watchingNotice:not([hidden])').waitFor();
 assert.match(await w.locator('#watchers').innerText(),/Watch/);
 assert.equal(await w.locator('.hand-counts p').count(),2);
 for(const selector of ['[data-hand-card]','#stock','#discardDraw','#stage','#discardBtn','#undoTurn','#arrangeHand','[data-add]','[data-replace]'])assert.equal(await w.locator(selector).count(),0,selector+' must be absent');
 assert.equal(await w.locator('#start').isVisible(),false);
 const countsBefore=await w.locator('.hand-counts p').allTextContents();assert.ok(countsBefore.every(text=>text.includes('13')));
 await a.locator('#stock:enabled').click();await w.locator('.hand-counts p').filter({hasText:'14'}).waitFor();
 await w.reload();await w.locator('#watchingNotice:not([hidden])').waitFor();assert.equal(await w.locator('[data-hand-card]').count(),0);
 await w.locator('#backLobby').click();await w.locator('#lobby:not([hidden])').waitFor();
 assert.equal(await w.locator('#resumeGame').innerText(),'Resume watching');assert.match(await w.locator('.room-watchers').innerText(),/Watch/);
 await w.locator('#uiLanguage').selectOption('bg');assert.equal(await w.locator('#resumeGame').innerText(),'Продължи наблюдението');assert.match(await w.locator('.room-watchers').innerText(),/Watch/);
 await w.locator('#resumeGame').click();await w.locator('#leaveGame').click();await w.locator('#lobby:not([hidden])').waitFor();
 assert.equal(await w.locator('#resumeArea').isVisible(),false);assert.equal(await a.locator('.results').count(),0);
 await w.locator('#uiLanguage').selectOption('en');await w.locator('[data-watch]').click();
 a.once('dialog',dialog=>dialog.accept());await a.locator('#leaveGame').click();await w.locator('.remaining-hands').waitFor();
 assert.ok(await w.locator('.remaining-hands .playing-card').count()>0);assert.equal(await w.locator('.remaining-hands .playing-card:not(:disabled)').count(),0);
 b.once('dialog',dialog=>dialog.accept());await b.locator('#leaveGame').click();await w.locator('#lobby:not([hidden])').waitFor();assert.equal(await w.locator('#room').isVisible(),false);
 await a.locator('#newRoom').click();await a.locator('#gameType').selectOption('backgammon');await a.locator('#createGo').click();await b.locator('[data-join]').click();await a.locator('#start').click();await a.locator('#bgGameCount').fill('1');await a.locator('#bgMatchGo').click();await w.locator('[data-watch]').click();
 for(const variant of ['Normal backgammon','Gulbara','Tapa']){
  await w.locator('.bg-progress').filter({hasText:variant}).waitFor();
  assert.equal(await w.locator('[data-point]').count(),24);assert.equal(await w.locator('[data-point]:not(:disabled)').count(),0);
  assert.equal(await w.locator('.bg-row.top [data-point]').last().getAttribute('data-point'),'23');
  for(const selector of ['#roll','#bgUndo','[data-concede]','#acceptResign','#declineResign'])assert.equal(await w.locator(selector).count(),0);
  a.once('dialog',dialog=>dialog.accept());await a.locator('[data-concede="1"]').click();await b.locator('#acceptResign').waitFor();
  assert.equal(await w.locator('#acceptResign').count(),0);assert.match(await w.locator('.notice').allTextContents().then(texts=>texts.join(' ')),/Watching/);
  await b.locator('#acceptResign').click();await w.locator('.results').waitFor();
  if(variant!=='Tapa'){await a.locator('#start').click();await w.locator('.results').waitFor({state:'detached'})}
 }
 await w.locator('#backLobby').click();await w.setViewportSize({width:390,height:844});assert.equal(await w.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await w.locator('#leaveLobby').click();await w.locator('#resumeArea').waitFor({state:'hidden'});assert.equal(await a.locator('.results').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS: lobby rosters, live Rummy privacy/counts, watcher reload/resume/stop, finished proof, room deletion, read-only normal/Gulbara/Tapa, EN/BG and mobile width');
}finally{await browser?.close();server?.kill()}
