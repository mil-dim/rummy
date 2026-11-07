import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../',import.meta.url));let server,browser;
try{
 server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'18106'},stdio:['ignore','pipe','pipe']});await once(server.stdout,'data');
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const errors=[];
 async function player(name){const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(`${name}: ${error.message}`));await page.goto('http://127.0.0.1:18106');await page.locator('#name').fill(name);await page.locator('#identity button').click();await page.locator('#lobby:not([hidden])').waitFor();return page}
 const [a,b,watch,c,d,e]=await Promise.all(['Ana','Boris','Watcher','Ceco','Dora','Eli'].map(player));

 await a.locator('#newRoom').click();await a.locator('#gameType').selectOption('santase');assert.equal(await a.locator('#maxPlayers').inputValue(),'2');assert.equal(await a.locator('#maxPlayers').isDisabled(),true);await a.locator('#createName').fill('Santase table');await a.locator('#createGo').click();
 const santaseCard=b.locator('.roomCard').filter({has:b.getByRole('heading',{name:'Santase table'})});await santaseCard.locator('[data-join]').click();await a.locator('#players').filter({hasText:'Boris'}).waitFor();
 await a.locator('#start').click();assert.equal(await a.locator('#cardMatchTitle').innerText(),'Santase match');await a.locator('#cardMatchGo').click();await b.locator('.santase-hand .playing-card').first().waitFor();assert.equal(await b.locator('.santase-hand .playing-card').count(),6);
 await watch.locator('.roomCard').filter({has:watch.getByRole('heading',{name:'Santase table'})}).locator('[data-watch]').click();await watch.locator('.trick-game').waitFor();assert.equal(await watch.locator('.santase-hand').count(),0);assert.match(await watch.locator('#game').innerText(),/Hands are hidden/);
 await b.locator('.santase-hand [data-trick-card]:not([disabled])').first().click();await b.locator('#playSantase').click();await a.locator('.trick-table .card-row .playing-card').first().waitFor();

 await c.locator('#newRoom').click();await c.locator('#gameType').selectOption('blato');assert.equal(await c.locator('#maxPlayers').inputValue(),'3');assert.equal(await c.locator('#maxPlayers').isDisabled(),true);await c.locator('#createName').fill('Blato table');await c.locator('#createGo').click();
 for(const page of [d,e])await page.locator('.roomCard').filter({has:page.getByRole('heading',{name:'Blato table'})}).locator('[data-join]').click();
 await c.locator('#players').filter({hasText:'Eli'}).waitFor();await c.locator('#start').click();assert.equal(await c.locator('#cardMatchTitle').innerText(),'Blato match');await c.locator('#cardMatchGo').click();
 for(let round=0;round<12;round++){
  let clicked=false;for(const page of [c,d,e])if(await page.locator('#cutBlato').isVisible().catch(()=>false)){
   clicked=await page.locator('#cutBlato').click({timeout:2000}).then(()=>true).catch(()=>false)||clicked;await page.waitForTimeout(75);
  }
  if(!clicked&&!await Promise.all([c,d,e].map(page=>page.locator('#cutBlato').isVisible().catch(()=>false))).then(values=>values.some(Boolean)))break;
 }
 let declarer;for(const page of [c,d,e])if(await page.locator('[data-trump="♥"]').isVisible().catch(()=>false)){declarer=page;break}
 assert.ok(declarer);await declarer.locator('[data-trump="♥"]').click();await declarer.locator('.trick-game').filter({hasText:'Public talon'}).waitFor();
 assert.equal(await declarer.locator('.trick-game section').filter({hasText:'Public talon'}).locator('[data-trick-card]').count(),4);
 const hand=declarer.locator('.blato-hand [data-trick-card]:not([disabled])');assert.equal(await hand.count(),20);for(let index=0;index<4;index++)await hand.nth(index).click();await declarer.locator('#discardKitty').click();await declarer.locator('.blato-hand').waitFor();
 await declarer.locator('.blato-hand [data-trick-card]:not([disabled])').first().click();await c.locator('.trick-table .card-row .playing-card').first().waitFor();
 await declarer.setViewportSize({width:390,height:844});assert.equal(await declarer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 console.log('PASS: Santase and Blato room setup, private hands, opening cut, trump, talon selection, play and mobile layout');
}finally{await browser?.close();server?.kill()}
