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
 await a.locator('#uiLanguage').selectOption('bg');
 assert.equal(await a.locator('#newRoom').innerText(),'Нова стая');
 assert.equal(await a.locator('#lobby h2').innerText(),'Изберете маса');
 assert.equal(await a.locator('#name').getAttribute('placeholder'),'Вашето име');
 assert.equal(await a.locator('html').getAttribute('lang'),'bg');
 assert.equal(await a.locator('#leaveGame').innerText(),'Напусни играта');
 assert.equal(await a.locator('#soundToggle').innerText(),'🔊 Звукът е включен');await a.locator('#soundToggle').click();assert.equal(await a.locator('#soundToggle').innerText(),'🔇 Без звук');assert.equal(await a.evaluate(()=>localStorage.tabletopMuted),'1');await a.locator('#soundToggle').click();
 await a.locator('#uiLanguage').selectOption('en');assert.equal(await a.locator('#newRoom').innerText(),'New room');
 await a.locator('#uiLanguage').selectOption('bg');
 await a.locator('#newRoom').click();await a.locator('#createName').fill('Your hand');await a.locator('#gameType').selectOption('backgammon');await a.locator('#createGo').click();await b.locator('[data-join]').click();await a.locator('#start').click();assert.equal(await a.locator('#bgVariantMode').inputValue(),'normal');assert.equal(await a.locator('#bgCountLabel').innerText(),'Брой партии');await a.locator('#bgVariantMode').selectOption('rotate');assert.equal(await a.locator('#bgCountLabel').innerText(),'Брой кръгове');await a.locator('#bgMatchGo').click();
 assert.equal(await a.locator('#roll').innerText(),'Хвърли за начало');
 assert.equal(await a.locator('#roomName').innerText(),'Your hand');
 assert.match(await a.locator('.board-hint').innerText(),/Обикновена табла/);
 assert.equal(await a.locator('.bar-zone.side-0').locator('span').innerText(),'Бели');
 await a.locator('#uiLanguage').selectOption('en');
 assert.match(await a.locator('.board-hint').innerText(),/Normal backgammon/);
 assert.equal(await a.locator('#roomName').innerText(),'Your hand');
 await a.locator('#uiLanguage').selectOption('bg');
 await a.locator('#roll').click();await b.locator('#roll').click();await a.waitForFunction(()=>document.querySelectorAll('.roll-history li').length===2);
 const lines=await a.locator('.roll-history li').allTextContents();assert.equal(lines.length,2);assert.match(lines[0],/#2/);assert.match(lines[1],/#1/);
 let mover=null;for(let attempt=0;attempt<8&&!mover;attempt++){
  for(const page of [a,b])await page.evaluate(()=>{const button=document.querySelector('#roll:enabled');if(button)button.click()});
  await a.waitForTimeout(150);
  for(const page of [a,b])if(await page.locator('.checker-drag-source').first().isVisible().catch(()=>false)){mover=page;break}
 }
 assert.ok(mover,'a player should have draggable legal checkers');const source=mover.locator('.checker-drag-source .checker').first(),sourceBox=await source.boundingBox();assert.ok(sourceBox);const sourceInfo=await source.evaluate(element=>{const button=element.closest('button');return {point:button.dataset.point??null,bar:button.dataset.bar??null,label:button.getAttribute('aria-label')}});
 await mover.mouse.move(sourceBox.x+sourceBox.width/2,sourceBox.y+sourceBox.height/2);await mover.mouse.down();await mover.locator('.checker-drop-target').first().waitFor();const targetBox=await mover.locator('.checker-drop-target').first().boundingBox();assert.ok(targetBox);await mover.mouse.move(targetBox.x+targetBox.width/2,targetBox.y+targetBox.height/2,{steps:5});await mover.mouse.up();
 await mover.waitForFunction(info=>{const selector=info.point!==null?`[data-point="${info.point}"]`:`[data-bar="${info.bar}"]`;return document.querySelector(selector)?.getAttribute('aria-label')!==info.label},sourceInfo);
 const persistedLines=await a.locator('.roll-history li').allTextContents();
 const token=await a.evaluate(()=>{localStorage.setItem('rummyOrder:keep','["saved-card"]');return localStorage.token});
 await a.reload();await a.locator('.roll-history').waitFor();assert.equal(await a.locator('#uiLanguage').inputValue(),'bg');assert.deepEqual(await a.locator('.roll-history li').allTextContents(),persistedLines);assert.equal(await a.evaluate(()=>localStorage.token),token);

 // Opponent sees its own starting pair at display point 24, with physical IDs intact.
 assert.equal(await a.locator('.bg-row.top [data-point]').last().getAttribute('data-point'),'23');
 assert.equal(await b.locator('.bg-row.top [data-point]').last().getAttribute('data-point'),'0');
 assert.equal(await b.locator('.bg-row.top [data-point]').last().locator('small').innerText(),'24');
 assert.equal(await b.locator('.bg-colors .color-seat').last().locator('.player-checker').getAttribute('class'),'player-checker side-1');
 a.once('dialog',dialog=>dialog.dismiss());await a.locator('[data-concede="2"]').click();
 assert.equal(await b.locator('#acceptResign').count(),0);
 for(const [variant,points] of [['normal',2],['gulbara',1],['tapa',2]]){
  a.once('dialog',dialog=>dialog.accept());await a.locator(`[data-concede="${points}"]`).click();
  await b.locator('#acceptResign').click();await a.locator('.results').waitFor();
  assert.equal(await a.locator('[data-concede]').count(),0);
  await a.locator('#start').click();
  await a.locator('.results').waitFor({state:'detached'});
  await b.locator('.bg-progress').filter({hasText:variant==='normal'?'Gulbara':variant==='gulbara'?'Tapa':'Normal backgammon'}).waitFor();
  if(variant==='normal'){
   await b.locator('.bg-progress').filter({hasText:'Gulbara'}).waitFor();
   assert.equal(await b.locator('.bg-row.top [data-point]').last().getAttribute('data-point'),'11');
   assert.equal(await a.locator('[data-bar]').count(),0);
   assert.equal(await b.locator('#roll').isEnabled(),true); // previous winner starts
  }
  if(variant==='gulbara'){
   await b.locator('.bg-progress').filter({hasText:'Tapa'}).waitFor();
   assert.equal(await b.locator('.bg-row.top [data-point]').last().getAttribute('data-point'),'0');
   assert.equal(await b.locator('.bg-row.top [data-point]').last().locator('.checker-count').innerText(),'15');
  }
 }
 await a.setViewportSize({width:390,height:844});
 assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await a.setViewportSize({width:1280,height:720});
 const exited=once(server,'exit');server.kill();await exited;await start();
 await a.locator('#lobby:not([hidden])').waitFor({timeout:15000});await b.locator('#lobby:not([hidden])').waitFor({timeout:15000});
 assert.equal(await a.locator('#room').isVisible(),false);assert.equal(await a.locator('#game').innerHTML(),'');
 assert.notEqual(await a.evaluate(()=>localStorage.token),token);assert.equal(await a.evaluate(()=>localStorage.name),'Milen');assert.equal(await a.evaluate(()=>localStorage.getItem('rummyOrder:keep')),'["saved-card"]');
 await a.locator('#newRoom').click();await a.locator('#gameType').selectOption('rummy');await a.locator('#createGo').click();await a.locator('#room:not([hidden])').waitFor();
 await b.locator('[data-join]').click();await a.locator('#start').click();await a.locator('#matchGo').click();
 await a.locator('#stock:enabled').waitFor();assert.match(await a.locator('#stock').innerText(),/Тегли от тестето/);
 assert.equal(await a.locator('#stage').innerText(),'Подготви избраната комбинация');
 await a.locator('#stock').click();await a.locator('#stage:enabled').waitFor();await a.locator('[data-hand-card]').first().click();
 const selectedCard=await a.locator('.hand .selected').getAttribute('data-hand-card');
 const stockCount=await a.locator('#stock b').innerText();
 await a.locator('#uiLanguage').selectOption('en');assert.equal(await a.locator('#stage').innerText(),'Stage selected meld');
 assert.equal(await a.locator('.hand .selected').getAttribute('data-hand-card'),selectedCard);
 assert.equal(await a.locator('#stock b').innerText(),stockCount);
 await a.locator('#uiLanguage').selectOption('bg');assert.equal(await a.locator('#arrangeHand').innerText(),'Подреди картите');
 assert.equal(await a.locator('.hand .selected').getAttribute('data-hand-card'),selectedCard);
 await a.setViewportSize({width:390,height:844});
 assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await a.setViewportSize({width:1280,height:720});
 await a.route('**/version',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({environment:'web-qa',version:'next-test',build:'new-server-build'})}));
 const oldUrl=a.url();await a.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await a.locator('#updateNotice:not([hidden])').waitFor();
 assert.equal(a.url(),oldUrl);assert.ok((await a.locator('#buildInfo').innerText()).includes('v'+version));assert.match(await a.locator('#updateMessage').innerText(),/next-test/);
 const newToken=await a.evaluate(()=>localStorage.token);await a.unroute('**/version');
 await Promise.all([a.waitForURL(/_buildReload=/),a.locator('#reloadUpdate').click()]);await a.locator('#room:not([hidden])').waitFor();
 assert.equal(await a.locator('#updateNotice').isVisible(),false);assert.equal(await a.evaluate(()=>localStorage.token),newToken);assert.equal(await a.locator('#uiLanguage').inputValue(),'bg');assert.equal(await a.locator('#stage').innerText(),'Подготви избраната комбинация');assert.equal(await a.evaluate(()=>localStorage.getItem('rummyOrder:keep')),'["saved-card"]');
 assert.deepEqual(errors,[]);console.log('PASS: three variants rotate, opposite perspectives/color badges and two-step concessions work; EN/BG controls persist and preserve selection/counts; numbered roll history survives valid resume, server restart recovers expired sessions, update notice detects mismatch without forcing reload, one-click reload preserves player/order data');
}finally{await browser?.close();server?.kill()}
