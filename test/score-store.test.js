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
