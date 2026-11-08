import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createScoreStore} from '../lib/score-store.js';

test('optional accounts, approval, sessions and Elo results persist without exposing credentials',()=>{
 const dir=mkdtempSync(join(tmpdir(),'tabletop-scores-')),path=join(dir,'scores.sqlite');
 try{
  let store=createScoreStore(path);
  const a=store.upsertGoogle({sub:'google-a',email:'a@example.test',name:'Alice'}),b=store.upsertGoogle({sub:'google-b',email:'b@example.test',name:'Bob'});
  assert.equal(a.approved,false);
  assert.throws(()=>store.recordMatch({roomId:'ROOM',category:'rummy',participants:[{accountId:a.id,score:1},{accountId:b.id,score:0}]}),/approved/);
  store.setApproved(a.id,true);store.setApproved(b.id,true);
  const session=store.createSession(a.id);assert.equal(store.accountForSession(session.token).displayName,'Alice');assert.equal(store.accountForSession('wrong'),null);
  const result=store.recordMatch({id:'MATCH-1',roomId:'ROOM',category:'rummy',participants:[{accountId:a.id,score:10},{accountId:b.id,score:-10}]});
  assert.equal(result.recorded,true);assert.deepEqual(result.changes.map(row=>row.delta),[4,-4]);assert.equal(result.changes.reduce((sum,row)=>sum+row.delta,0),0);
  assert.equal(store.recordMatch({id:'MATCH-1',roomId:'ROOM',category:'rummy',participants:[{accountId:a.id,score:10},{accountId:b.id,score:-10}]}).recorded,false);
  assert.deepEqual(store.scoreboard().map(row=>[row.display_name,row.rating,row.games]),[['Alice',1204,1],['Bob',1196,1]]);
  assert.deepEqual(store.recentMatches()[0].players.map(row=>row.display_name),['Alice','Bob']);store.close();
  store=createScoreStore(path);assert.equal(store.scoreboard().length,2);assert.equal(store.accountForSession(session.token).approved,true);store.revokeSession(session.token);assert.equal(store.accountForSession(session.token),null);store.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('multiplayer pairwise rating changes remain zero-sum and duplicate accounts are rejected',()=>{
 const store=createScoreStore(':memory:');
 const accounts=['A','B','C'].map(name=>store.upsertGoogle({sub:name,email:name+'@example.test',name}));accounts.forEach(account=>store.setApproved(account.id,true));
 assert.throws(()=>store.recordMatch({roomId:'R',category:'rummy',participants:[{accountId:accounts[0].id,score:1},{accountId:accounts[0].id,score:0}]}),/distinct/);
 const result=store.recordMatch({roomId:'R',category:'rummy',participants:accounts.map((account,index)=>({accountId:account.id,score:3-index}))});
 assert.equal(Math.round(result.changes.reduce((sum,row)=>sum+row.delta,0)),0);assert.deepEqual(result.changes.map(row=>row.place),[1,2,3]);store.close();
});

test('Santase and Blato have independent rating categories',()=>{
 const store=createScoreStore(':memory:'),accounts=['A','B','C'].map(name=>store.upsertGoogle({sub:'card-'+name,email:name+'@cards.test',name}));accounts.forEach(account=>store.setApproved(account.id,true));
 store.recordMatch({roomId:'S',category:'santase',participants:accounts.slice(0,2).map((account,index)=>({accountId:account.id,score:1-index}))});
 store.recordMatch({roomId:'B',category:'blato',participants:accounts.map((account,index)=>({accountId:account.id,score:1-index}))});
 assert.deepEqual(new Set(store.scoreboard().map(row=>row.category)),new Set(['santase','blato']));store.close();
});

test('private usage reports aggregate visits, countries, activity and completed games',()=>{
 const store=createScoreStore(':memory:'),now=2_000_000_000_000,start=now-120_000;
 const alice=store.startUsageVisit({playerId:'alice-player',displayName:'Alice',country:'US',locale:'en-US',timeZone:'America/New_York',startedAt:start});
 store.recordUsageEvent(alice,'room-created',{roomId:'ROOM',gameType:'backgammon',createdAt:start+1000});
 store.recordUsageEvent(alice,'watch-started',{roomId:'OTHER',gameType:'rummy',createdAt:start+2000});
 store.endUsageVisit(alice,start+90_000);
 const bob=store.startUsageVisit({playerId:'bob-player',displayName:'Bob',country:'BG',locale:'bg-BG',timeZone:'Europe/Sofia',startedAt:start+10_000});
 store.recordUsageEvent(bob,'room-joined',{roomId:'ROOM',gameType:'backgammon',createdAt:start+11_000});store.endUsageVisit(bob,start+70_000);
 const game=store.startUsageGame({roomId:'ROOM',roomName:'Morning table',gameType:'backgammon',variant:'normal',gameNumber:1,startedAt:start+20_000,
  players:[{playerId:'alice-player',displayName:'Alice'},{playerId:'bob-player',displayName:'Bob'}]});
 assert.equal(store.finishUsageGame(game,{winnerPlayerId:'alice-player',result:{scores:{awarded:1}},finishedAt:start+60_000}),true);
 assert.equal(store.finishUsageGame(game,{winnerPlayerId:'bob-player',finishedAt:start+61_000}),false,'finish is idempotent');
 const report=store.usageReport(30,now);assert.deepEqual(report.totals,{visitors:2,visits:2,activeSeconds:150,gamesStarted:1,gamesFinished:1,completionRate:1});
 assert.deepEqual(report.countries.map(row=>row.country),['BG','US']);assert.equal(report.games[0].variant,'normal');
 assert.equal(report.people.find(row=>row.name==='Alice').wins,1);assert.equal(report.people.find(row=>row.name==='Alice').roomsCreated,1);
 assert.equal(report.people.find(row=>row.name==='Bob').roomsJoined,1);assert.equal(report.recentGames[0].winner,'Alice');store.close();
});
