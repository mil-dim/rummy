import test from "node:test";
import assert from "node:assert/strict";
import { chooseAction } from "../bot/strategy.js";

const room = game => ({ role: "player", game });
const fixedRandom = () => 0;

test("bot uses only its projected Backgammon state and legal moves", () => {
  const rolling = { kind: "backgammon", players: ["bot", "human"], turn: 0, phase: "roll", winner: null,
    resignationOffer: null, openingRolls: [null, null] };
  assert.deepEqual(chooseAction(room(rolling), "bot", fixedRandom), { type: "roll" });

  const points = Array.from({ length: 24 }, () => ({ owner: null, count: 0 }));
  points[5] = { owner: 0, count: 2 };
  const playing = { ...rolling, phase: "play", variant: "normal", points, bar: [0, 0], borneOff: [0, 0],
    dice: [3, 5], used: [], legalMoves: [{ from: 5, dieIndex: 0 }, { from: 5, dieIndex: 1 }] };
  const action = chooseAction(room(playing), "bot", fixedRandom);
  assert.equal(action.type, "move");
  assert.ok(playing.legalMoves.some(move => move.from === action.from && move.dieIndex === action.dieIndex));
});

test("bot plays projected Santase and Blato turns", () => {
  const santase = { kind: "santase", players: ["human", "bot"], turn: 1, finished: false, trick: [],
    hands: [{ count: 6 }, [{ id: "a", rank: "9", suit: "♠" }]], legalCardIds: ["a"],
    cardPoints: [0, 66], marriagePoints: [0, 0], tricksWon: [0, 1], trumpSuit: "♥", canExchange: false };
  assert.deepEqual(chooseAction(room(santase), "bot", fixedRandom), { type: "claim66" });

  const blato = { kind: "blato", players: ["bot", "a", "b"], turn: null, finished: false,
    hands: [{ count: 0 }, { count: 0 }, { count: 0 }], canCut: true };
  assert.deepEqual(chooseAction(room(blato), "bot", fixedRandom), { type: "cut" });
});

test("casual Rummy bot finds a natural 44 point opening without opponent cards", () => {
  const hand = [
    { id: "h10", rank: "10", suit: "♥" }, { id: "hj", rank: "J", suit: "♥" },
    { id: "hq", rank: "Q", suit: "♥" }, { id: "hk", rank: "K", suit: "♥" },
    { id: "2s", rank: "2", suit: "♠" }, { id: "2h", rank: "2", suit: "♥" },
    { id: "2d", rank: "2", suit: "♦" }, { id: "x", rank: "7", suit: "♣" }
  ];
  const game = { kind: "rummy", players: ["bot", "human"], turn: 0, phase: "play", winner: null,
    hands: { bot: hand, human: { count: 8 } }, opened: { bot: false, human: false }, melds: [] };
  const action = chooseAction(room(game), "bot", fixedRandom);
  assert.equal(action.type, "meldBatch");
  assert.ok(action.melds.flatMap(meld => meld.cardIds).length >= 7);
});
