import test from "node:test";
import assert from "node:assert/strict";
import { rummyAction, validateMeld } from "../lib/rummy.js";

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
