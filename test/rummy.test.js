import test from "node:test";
import assert from "node:assert/strict";
import { validateMeld } from "../lib/rummy.js";
const c=(rank,suit="♥")=>({id:rank+suit,rank,suit});
test("Bulgarian ace rules",()=>{
  assert.equal(validateMeld([c("Q"),c("K"),c("A")]).points,30);
  assert.equal(validateMeld([c("A"),c("2"),c("3")]).points,6);
  assert.equal(validateMeld([c("K"),c("A"),c("2")]).ok,false);
});
test("sets and suited runs",()=>{
  assert.equal(validateMeld([c("7","♠"),c("7","♥"),c("7","♦")]).ok,true);
  assert.equal(validateMeld([c("4"),c("5"),c("6")]).ok,true);
  assert.equal(validateMeld([c("4","♥"),c("5","♠"),c("6","♥")]).ok,false);
});
