import test from "node:test";
import assert from "node:assert/strict";
import { backgammonAction, newBackgammon } from "../lib/backgammon.js";

const players=[{id:"p1"},{id:"p2"}];

test("backgammon rejects voluntary passing",()=>{
  const game=newBackgammon(players);
  game.dice=[3,4];
  assert.throws(()=>backgammonAction(game,"p1",{type:"end"}),/Roll first/);
});

test("oversized bearing off is blocked while a farther checker remains",()=>{
  const game=newBackgammon(players);
  game.points=Array.from({length:24},()=>({owner:null,count:0}));
  game.points[4]={owner:0,count:1};
  game.points[5]={owner:0,count:1};
  game.borneOff=[13,0];
  game.dice=[6];game.used=[];game.turn=0;
  assert.throws(()=>backgammonAction(game,"p1",{type:"move",from:4,dieIndex:0}),/not legal/);
});
