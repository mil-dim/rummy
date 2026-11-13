import test from "node:test";
import assert from "node:assert/strict";
import {evaluateBackgammon,chooseAction} from "../bot/strategy.js";
const position = variant => ({variant,points:Array.from({length:24},()=>({owner:null,count:0})),bar:[0,0],borneOff:[0,0]});
test("normal bot values home points more than outside points",()=>{
 const home=position("normal"),outside=position("normal");
 home.points[4]={owner:0,count:2};outside.points[10]={owner:0,count:2};
 assert.ok(evaluateBackgammon(home,0)>evaluateBackgammon(outside,0));
});
test("Gulbara spreads blockers and avoids trapped stacks",()=>{
 const stack=position("gulbara");stack.points[10]={owner:0,count:2};
 const spread=structuredClone(stack);spread.points[10].count=1;spread.points[8]={owner:0,count:1};
 assert.ok(evaluateBackgammon(spread,0)>evaluateBackgammon(stack,0));
 const trapped=structuredClone(stack);
 for(let i=4;i<10;i++)trapped.points[i]={owner:1,count:1};
 assert.ok(evaluateBackgammon(trapped,0)<evaluateBackgammon(stack,0));
});
test("Tapa keeps and reinforces pins, including the mother checker",()=>{
 const pin=position("tapa");pin.points[5]={owner:0,count:1,pinned:1};
 const reinforced=structuredClone(pin);reinforced.points[5].count=2;
 assert.ok(evaluateBackgammon(reinforced,0)>evaluateBackgammon(pin,0));
 const released=structuredClone(pin);released.points[5]={owner:1,count:1};
 assert.ok(evaluateBackgammon(pin,0)>evaluateBackgammon(released,0));
});
test("Rummy bot preserves a joker when an ordinary discard exists",()=>{
 const game={kind:"rummy",players:["bot","human"],turn:0,phase:"play",winner:null,
 hands:{bot:[{id:"j",rank:"JOKER",suit:""},{id:"x",rank:"7",suit:"♣"}],human:{count:13}},
 opened:{bot:false},melds:[]};
 assert.deepEqual(chooseAction({role:"player",game},"bot"),{type:"discard",cardId:"x"});
});
