import test from "node:test";
import assert from "node:assert/strict";
import { rummyAction, validateMeld, newRummy, publicRummy } from "../lib/rummy.js";

let serial=0;
const card=(rank,suit="♥")=>({id:`c${++serial}`,rank,suit});
const joker=()=>card("JOKER","");

function game(hand,other=[card("K","♠")]) {
  return {
    kind:"rummy",gameNumber:1,sprint:false,players:["p1","p2"],
    hands:{p1:hand,p2:other},stock:[card("4","♠")],discard:[card("5","♦")],
    melds:[],opened:{p1:false,p2:false},openedTurn:{p1:null,p2:null},
    turn:0,turnNumber:0,phase:"play",winner:null,scores:null,
    drawnDiscard:null,mustOpenAfterDiscard:false
  };
}

test("Bulgarian ace rules",()=>{
  assert.equal(validateMeld([card("Q"),card("K"),card("A")]).points,30);
  assert.equal(validateMeld([card("A"),card("2"),card("3")]).points,6);
  assert.equal(validateMeld([card("K"),card("A"),card("2")]).ok,false);
});

test("sets and suited runs",()=>{
  assert.equal(validateMeld([card("7","♠"),card("7","♥"),card("7","♦")]).ok,true);
  assert.equal(validateMeld([card("4"),card("5"),card("6")]).ok,true);
  assert.equal(validateMeld([card("4","♥"),card("5","♠"),card("6","♥")]).ok,false);
});

test("multiple melds combine for the 44 point opening",()=>{
  const run=[card("6","♣"),card("7","♣"),card("8","♣")];
  const set=[card("10","♥"),card("10","♣"),card("10","♦")];
  const extra=card("2","♠");
  const state=game([...run,...set,extra]);
  rummyAction(state,"p1",{type:"meldBatch",melds:[
    {cardIds:run.map(c=>c.id)},{cardIds:set.map(c=>c.id)}
  ]});
  assert.equal(state.opened.p1,true);
  assert.equal(state.melds.length,2);
  assert.deepEqual(state.hands.p1,[extra]);
});

test("one physical card cannot belong to two staged melds",()=>{
  const shared=card("10","♣");
  const run=[card("8","♣"),card("9","♣"),shared];
  const set=[card("10","♥"),card("10","♦"),shared];
  const state=game([...new Set([...run,...set]),card("2","♠")]);
  assert.throws(()=>rummyAction(state,"p1",{type:"meldBatch",melds:[
    {cardIds:run.map(c=>c.id)},{cardIds:set.map(c=>c.id)}
  ]}),/only one meld/);
});

test("taking discard requires an opening before ending the turn",()=>{
  const run=[card("Q","♣"),card("K","♣"),card("A","♣")];
  const set=[card("7","♥"),card("7","♦"),card("7","♠")];
  const throwaway=card("2","♣");
  const state=game([...run,...set,throwaway]);
  state.phase="draw";
  rummyAction(state,"p1",{type:"draw",from:"discard"});
  assert.throws(()=>rummyAction(state,"p1",{type:"discard",cardId:throwaway.id}),/must complete a valid opening/);
  rummyAction(state,"p1",{type:"meldBatch",melds:[
    {cardIds:run.map(c=>c.id)},{cardIds:set.map(c=>c.id)}
  ]});
  rummyAction(state,"p1",{type:"discard",cardId:throwaway.id});
  assert.equal(state.turn,1);
});

test("discard pile turns over without shuffling and oldest is drawn first",()=>{
  const oldest=card("2","♣"),middle=card("3","♣"),newest=card("4","♣");
  const state=game([card("9","♥")]);
  state.phase="draw";state.stock=[];state.discard=[oldest,middle,newest];
  rummyAction(state,"p1",{type:"draw",from:"stock"});
  assert.equal(state.hands.p1.at(-1).id,oldest.id);
  assert.deepEqual(state.stock.map(c=>c.id),[newest.id,middle.id]);
  assert.equal(state.discard.length,0);
});

test("joker has an exact declared identity and can be replaced only after an earlier opening",()=>{
  const j=joker(),heart=card("J","♥"),diamond=card("J","♦");
  const declaration={cardId:j.id,rank:"J",suit:"♠"};
  const validated=validateMeld([heart,j,diamond],[declaration]);
  assert.equal(validated.ok,true);
  assert.deepEqual(validated.cards.find(c=>c.id===j.id).represents,{rank:"J",suit:"♠"});

  const replacement=card("J","♠");
  const state=game([replacement,card("2","♣")]);
  state.opened.p1=true;state.openedTurn.p1=0;state.turnNumber=1;
  state.melds=[{id:"m1",owner:"p2",type:"set",cards:validated.cards}];
  rummyAction(state,"p1",{type:"replaceJoker",meldId:"m1",jokerId:j.id,cardId:replacement.id});
  assert.equal(state.melds[0].cards.some(c=>c.id===replacement.id),true);
  assert.equal(state.hands.p1.some(c=>c.rank==="JOKER"),true);
});

test("unopened opponent is a 100 point full hand",()=>{
  const winning=[card("A","♣"),card("2","♣"),card("3","♣")];
  const state=game(winning,[card("K","♠"),card("3","♦")]);
  rummyAction(state,"p1",{type:"meldBatch",melds:[{cardIds:winning.map(c=>c.id)}]});
  assert.equal(state.winner,"p1");
  assert.equal(state.scores.players.p2.raw,100);
  assert.equal(state.scores.awarded,10);
  assert.equal(state.scores.players.p1.match,10);
  assert.equal(state.scores.players.p2.match,-10);
});

test("player may open below 44 only when going out immediately",()=>{
  const lowRun=[card("A","♣"),card("2","♣"),card("3","♣")],last=card("9","♦");
  const state=game([...lowRun,last]);
  rummyAction(state,"p1",{type:"meldBatch",melds:[{cardIds:lowRun.map(c=>c.id)}]});
  assert.equal(state.opened.p1,true);
  rummyAction(state,"p1",{type:"discard",cardId:last.id});
  assert.equal(state.winner,"p1");

  const invalid=game([...lowRun,card("8","♦"),card("9","♦")]);
  assert.throws(()=>rummyAction(invalid,"p1",{type:"meldBatch",melds:[{cardIds:lowRun.map(c=>c.id)}]}),/at least 44/);
});

test("discard pickup can be undone and replaced by stock draw",()=>{
  const state=game([card("2","♣"),card("9","♦")]);
  state.phase="draw";
  const original=structuredClone(state);
  rummyAction(state,"p1",{type:"draw",from:"discard"});
  rummyAction(state,"p1",{type:"undo"});
  assert.deepEqual(state,original);
  rummyAction(state,"p1",{type:"draw",from:"stock"});
  assert.throws(()=>rummyAction(state,"p1",{type:"undo"}),/Nothing to undo/);
  rummyAction(state,"p1",{type:"discard",cardId:state.hands.p1[0].id});
  assert.throws(()=>rummyAction(state,"p1",{type:"undo"}),/not your turn/);
  assert.throws(()=>rummyAction(state,"p2",{type:"undo"}),/Nothing to undo/);
});
test("undo restores a meld and opening status without exposing history",()=>{
  const run=[card("Q","♣"),card("K","♣"),card("A","♣")];
  const set=[card("7","♥"),card("7","♦"),card("7","♠")];
  const state=game([...run,...set,card("2","♠")]);
  const before=structuredClone(state);
  rummyAction(state,"p1",{type:"meldBatch",melds:[
    {cardIds:run.map(c=>c.id)},{cardIds:set.map(c=>c.id)}
  ]});
  rummyAction(state,"p1",{type:"undo"});
  assert.deepEqual(state,before);
});

test("undo after stock preserves the draw while reverting later melds",()=>{
  const run=[card("Q","♣"),card("K","♣"),card("A","♣")];
  const set=[card("7","♥"),card("7","♦"),card("7","♠")];
  const state=game([...run,...set,card("2","♠")]);
  state.phase="draw";
  rummyAction(state,"p1",{type:"draw",from:"stock"});
  const afterDraw=structuredClone(state);
  rummyAction(state,"p1",{type:"meldBatch",melds:[
    {cardIds:run.map(c=>c.id)},{cardIds:set.map(c=>c.id)}
  ]});
  rummyAction(state,"p1",{type:"undo"});
  assert.deepEqual(state,afterDraw);
  assert.throws(()=>rummyAction(state,"p1",{type:"undo"}),/Nothing to undo/);
});

test("high Ace continues longer runs and existing J-Q-K melds",()=>{
  const run=[card("J","♣"),card("Q","♣"),card("K","♣"),card("A","♣")];
  const result=validateMeld(run);
  assert.equal(result.ok,true);
  assert.equal(result.points,40);
  assert.deepEqual(result.cards.map(c=>c.rank),["J","Q","K","A"]);
  assert.equal(validateMeld([card("10","♣"),...run]).ok,true);
  assert.equal(validateMeld([card("K","♣"),card("A","♣"),card("2","♣")]).ok,false);
  assert.equal(validateMeld([...run,card("2","♣")]).ok,false);
  const ace=run[3],state=game([ace,card("4","♥")]);
  state.opened.p1=true;
  state.melds=[{id:"run",owner:"p2",type:"run",cards:run.slice(0,3)}];
  rummyAction(state,"p1",{type:"add",meldId:"run",cardIds:[ace.id]});
  assert.deepEqual(state.melds[0].cards.map(c=>c.rank),["J","Q","K","A"]);
});

test("sets reject duplicate suits even with two decks or declared jokers",()=>{
  const set=[card("5","♠"),card("5","♦"),card("5","♣")];
  const duplicate=card("5","♣"),missing=card("5","♥");
  assert.equal(validateMeld([...set,duplicate]).ok,false);
  assert.equal(validateMeld([...set,missing]).ok,true);
  const j=card("JOKER","");
  assert.equal(validateMeld([...set,j],[{cardId:j.id,rank:"5",suit:"♣"}]).ok,false);
  const state=game([duplicate,missing]);
  state.opened.p1=true;
  state.melds=[{id:"set",owner:"p2",type:"set",cards:set}];
  const before=structuredClone(state);
  assert.throws(()=>rummyAction(state,"p1",{type:"add",meldId:"set",cardIds:[duplicate.id]}),/distinct suits/);
  assert.deepEqual(state,before);
  rummyAction(state,"p1",{type:"add",meldId:"set",cardIds:[missing.id]});
  assert.equal(state.melds[0].cards.length,4);
});

test('forfeit advances the turn, skips departed players and preserves their score', async () => {
  const { forfeitRummy } = await import('../lib/rummy.js');
  const g = newRummy([{id:'a'},{id:'b'},{id:'c'}]);
  forfeitRummy(g, 'a');
  assert.equal(g.players[g.turn], 'b');
  assert.throws(() => rummyAction(g, 'a', {type:'undo'}));
  rummyAction(g, 'b', {type:'draw',from:'stock'});
  rummyAction(g, 'b', {type:'discard',cardId:g.hands.b[0].id});
  rummyAction(g, 'c', {type:'draw',from:'stock'});
  rummyAction(g, 'c', {type:'discard',cardId:g.hands.c[0].id});
  assert.equal(g.players[g.turn], 'b');
  forfeitRummy(g, 'c');
  assert.equal(g.winner, 'b');
  assert.equal(g.scores.players.a.raw, 100);
});

test('undo after another player forfeits cannot restore that player', async () => {
  const { forfeitRummy } = await import('../lib/rummy.js');
  const g = newRummy([{id:'a'},{id:'b'},{id:'c'}]);
  const discard = g.discard.at(-1).id;
  rummyAction(g, 'a', {type:'draw',from:'discard'});
  forfeitRummy(g, 'b');
  assert.equal(publicRummy(g, 'a').canUndo, true);
  rummyAction(g, 'a', {type:'undo'});
  assert.deepEqual(g.forfeited, ['b']);
  assert.equal(g.phase, 'draw');
  assert.equal(g.discard.at(-1).id, discard);
  assert.equal(g.hands.a.length, 13);
});


test('round each opponent score before applying the sprint multiplier', () => {
  for (const [ranks, expected] of [
    [['3'], 1], [['10','10','4'], 2], [['10','10','5'], 3],
    [['10','10','7'], 3], [['10','10','10','4'], 3], [['10','10','10','5'], 4]
  ]) {
    for (const sprint of [false, true]) {
      const last = card('2');
      const state = game([last], ranks.map(rank => card(rank)));
      state.opened.p2 = true;
      state.sprint = sprint;
      rummyAction(state, 'p1', {type:'discard', cardId:last.id});
      assert.equal(state.scores.players.p2.match, -expected * (sprint ? 2 : 1));
      assert.equal(state.scores.awarded, expected * (sprint ? 2 : 1));
      assert.equal(state.scores.players.p1.match, state.scores.awarded);
      assert.equal(Object.values(state.scores.players).reduce((sum, score) => sum + score.match, 0), 0);
    }
  }
});

test('round opponents separately and sum their match points for the winner', () => {
  const last = card('2');
  const state = game([last], [card('10'),card('10'),card('7')]);
  state.players.push('p3');
  state.hands.p3 = [card('10'),card('10'),card('6')];
  state.opened.p2 = state.opened.p3 = true;
  state.sprint = true;
  rummyAction(state, 'p1', {type:'discard',cardId:last.id});
  assert.equal(state.scores.players.p2.match,-6);
  assert.equal(state.scores.players.p3.match,-6);
  assert.equal(state.scores.awarded,12);
  assert.equal(state.scores.players.p1.match,12);
  assert.equal(Object.values(state.scores.players).reduce((sum, score) => sum + score.match, 0),0);
});


test('Rummy starter alternates for two players and rotates for larger tables',()=>{
  for(const count of [2,3,6]){
    const roster=Array.from({length:count},(_,i)=>({id:'p'+i}));
    for(let number=1;number<=count*2;number++){
      const g=newRummy(roster,number);
      assert.equal(g.players[g.turn],roster[(number-1)%count].id);
      assert.deepEqual(g.players,roster.map(p=>p.id));
      assert.ok(Object.values(g.hands).every(hand=>hand.length===13));
      assert.equal(g.phase,'draw');assert.equal(g.turnNumber,0);
    }
    assert.equal(newRummy(roster,1).turn,0,'new match resets the starting order');
  }
});
