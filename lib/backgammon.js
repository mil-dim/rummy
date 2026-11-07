import { diceRandom } from "./dice.js";

export function newBackgammon(players, { gameNumber = 1, starter = null, variant = "normal" } = {}) {
  if (!["normal", "gulbara", "tapa"].includes(variant)) throw Error("Unknown backgammon variant.");
  const points = Array(24).fill(null).map(() => ({ owner: null, count: 0 }));
  const put = (i, owner, count) => points[i] = { owner, count };
  if (variant === "normal") {
    put(23, 0, 2); put(12, 0, 5); put(7, 0, 3); put(5, 0, 5);
    put(0, 1, 2); put(11, 1, 5); put(16, 1, 3); put(18, 1, 5);
  } else { put(23, 0, 15); put(variant === "gulbara" ? 11 : 0, 1, 15); }
  return { variant, rollsBySide: [0, 0], sequence: null, kind: "backgammon", players: players.map(p => p.id), points, bar: [0, 0],
    borneOff: [0, 0], turn: Math.max(0, players.findIndex(p => p.id === starter)),
    dice: [], used: [], winner: null, scores: null, gameNumber,
    phase: starter ? "roll" : "opening", openingRolls: [null, null],
    openingPrevious: null, openingRound: 1, lastTurn: null, rollNumber: 0, moveNumber: 0, rollHistory: [] };
}

// Rank is distance from this side's bearing-off edge (0..23).
// Gulbara sides share a direction but start half a board apart.
export const pointRank = (g, point, side) => side === 0 ? point
  : g.variant === "gulbara" ? (point + 12) % 24 : 23 - point;
export const physicalPoint = (g, rank, side) => side === 0 ? rank
  : g.variant === "gulbara" ? (rank + 12) % 24 : 23 - rank;
const destination = (g, from, die, side) => pointRank(g, from, side) - die < 0 ? -1
  : physicalPoint(g, pointRank(g, from, side) - die, side);
const belongs = (point, side) => point.owner === side || point.pinned === side;
function canBearOff(g, side, from, die) {
  if (g.bar[side] || !g.points.every((point, index) => !belongs(point, side) || pointRank(g,index,side) < 6)) return false;
  const rank = pointRank(g, from, side);
  if (die === rank + 1) return true;
  return die > rank + 1 && !g.points.some((point,index) => belongs(point,side) && pointRank(g,index,side) > rank);
}

function canMove(g, side, from, die) {
  if (g.bar[side] && from !== "bar") return false;
  if (from !== "bar") {
    const point = g.points[from];
    if (!point || point.owner !== side || point.count < 1) return false;
  }
  const to = from === "bar" ? (side === 0 ? 24 - die : die - 1) : destination(g, from, die, side);
  if (to < 0 || to > 23) return from !== "bar" && canBearOff(g, side, from, die);
  const target = g.points[to];
  return target.owner === null || target.owner === side || (g.variant !== "gulbara" && target.count === 1 && target.pinned === undefined);
}


// A turn has at most four moves. Search complete continuations rather than
// accepting a locally legal move that would waste another playable die.
function candidates(g) {
  const result = [], values = new Set();
  for (let dieIndex = 0; dieIndex < g.dice.length; dieIndex++) {
    const die = g.dice[dieIndex];
    if (g.used.includes(dieIndex) || values.has(die)) continue;
    values.add(die);
    const sources = g.bar[g.turn] ? ["bar"] : g.points.map((_, i) => i);
    for (const from of sources) if (canMove(g, g.turn, from, die)) result.push({ from, dieIndex });
  }
  return result;
}

function applyMove(g, { from, dieIndex }) {
  const side = g.turn, die = g.dice[dieIndex];
  const to = from === "bar" ? (side === 0 ? 24 - die : die - 1) : destination(g, from, die, side);
  if (from === "bar") g.bar[side]--;
  else if (--g.points[from].count === 0) {
    const source = g.points[from];
    if (source.pinned !== undefined) { source.owner = source.pinned; source.count = 1; delete source.pinned; }
    else source.owner = null;
  }
  if (to < 0 || to > 23) g.borneOff[side]++;
  else {
    const target = g.points[to];
    if (target.owner !== null && target.owner !== side) {
      if (g.variant === "tapa") {
        target.pinned = target.owner;
        if (pointRank(g,to,target.owner) === 23) g.tapaWinner = side;
      } else g.bar[1 - side]++;
      target.owner = side; target.count = 1;
    } else { target.owner = side; target.count++; }
  }
  g.used.push(dieIndex);
}

function nextPosition(g, move) {
  const copy = { ...g, points: g.points.map(p => ({ ...p })),
    bar: [...g.bar], borneOff: [...g.borneOff], used: [...g.used] };
  applyMove(copy, move);
  return copy;
}

export function legalBackgammonMoves(g) {
  if (g.winner || g.phase !== "play") return [];
  const memo = new Map();
  function maxMoves(position) {
    if (position.borneOff[position.turn] === 15 || position.tapaWinner !== undefined) return 0;
    const key = JSON.stringify([position.points, position.bar, position.borneOff,
      position.dice.filter((_, i) => !position.used.includes(i)).sort()]);
    if (memo.has(key)) return memo.get(key);
    let best = 0;
    for (const move of candidates(position)) best = Math.max(best, 1 + maxMoves(nextPosition(position, move)));
    memo.set(key, best);
    return best;
  }
  const ranked = candidates(g).map(move => ({ ...move, length: 1 + maxMoves(nextPosition(g, move)) }));
  // Capturing the starting checker is an immediate Tapa win.
  const wins = ranked.filter(move => { const next = nextPosition(g,move); return next.tapaWinner === g.turn; });
  const maximum = Math.max(0, ...ranked.map(move => move.length));
  let best = wins.length ? wins : ranked.filter(move => move.length === maximum);
  // When only one of two different dice can be used, the higher is compulsory.
  if (maximum === 1 && g.dice.length === 2 && g.dice[0] !== g.dice[1] && !g.used.length) {
    const higher = Math.max(...best.map(move => g.dice[move.dieIndex]));
    best = best.filter(move => g.dice[move.dieIndex] === higher);
  }
  // Doubles are interchangeable, so allow selecting any unused equivalent die.
  return best.flatMap(move => g.dice.flatMap((die, dieIndex) =>
    !g.used.includes(dieIndex) && die === g.dice[move.dieIndex] ? [{ from: move.from, dieIndex }] : []));
}

const turnMoveUndo = new WeakMap();
const resignationOffers = new WeakMap();
function finish(g, side, forfeit = false) {
  g.winner = g.players[side]; g.phase = "finished";
  const mars = !forfeit && (g.tapaWinner === side || g.borneOff[1 - side] === 0);
  g.scores = { winner: g.winner, awarded: mars ? 2 : 1, mars, forfeit };
  turnMoveUndo.delete(g); resignationOffers.delete(g);
}
function nextTurn(g, reason, nextSide = 1 - g.turn) {
  if (reason === "complete") turnMoveUndo.delete(g);
  g.lastTurn = { playerId: g.players[g.turn], dice: [...g.dice], used: [...g.used], reason };
  g.dice = []; g.used = []; g.turn = nextSide; g.phase = "roll"; g.sequence = null;
}

// Ascending doubles are kept as four dice at a time, bounding move search.
// A sequence transfers at most once, and only after its roller made a move.
function settleDice(g) {
  while (!g.winner) {
    if (g.used.length === g.dice.length) {
      if (g.sequence && g.sequence.face < 6) {
        g.sequence.face++; g.dice = Array(4).fill(g.sequence.face); g.used = [];
      } else { nextTurn(g, "complete", g.sequence ? 1 - g.sequence.roller : 1 - g.turn); return; }
    }
    if (legalBackgammonMoves(g).length) return;
    if (g.sequence && g.sequence.started && !g.sequence.handedOver) {
      g.sequence.handedOver = true;
      g.turn = 1 - g.sequence.roller;
      turnMoveUndo.delete(g); // Opponent's inheritance commits the original moves.
      if (legalBackgammonMoves(g).length) return;
    }
    nextTurn(g, "blocked", g.sequence ? 1 - g.sequence.roller : 1 - g.turn);
    return;
  }
}

export function publicBackgammon(g, viewer) {
  return { ...g, resignationOffer: resignationOffers.get(g) || null, canUndo: !g.winner && !resignationOffers.has(g) && turnMoveUndo.get(g)?.playerId === viewer,
    legalMoves: !resignationOffers.has(g) && g.phase === "play" && g.players[g.turn] === viewer ? legalBackgammonMoves(g) : [] };
}

export function forfeitBackgammon(g, playerId) {
  const side = g.players.indexOf(playerId);
  if (side < 0) throw Error("Player is not in this game.");
  if (g.winner) return;
  g.forfeited = [playerId];
  finish(g, 1 - side, true);
}

function recordRoll(g, playerId, kind, dice) {
  g.rollNumber += 1;
  g.rollHistory.push({ id: g.rollNumber, playerId, kind, dice: [...dice], at: Date.now() });
  // Bound state and network payloads; only completed, already-visible rolls.
  if (g.rollHistory.length > 50) g.rollHistory.shift();
}
export function backgammonAction(g, playerId, a) {
  if (g.winner) throw Error("This game has finished.");
  const side = g.players.indexOf(playerId);
  if (side < 0) throw Error("Player is not in this game.");
  if (!a || typeof a !== "object" || Array.isArray(a)) throw Error("Invalid action.");
  if (a.type === "offerResignation") {
    if (![1,2].includes(a.points)) throw Error("Choose 1 or 2 points.");
    if (resignationOffers.has(g)) throw Error("Respond to the existing concession offer first.");
    resignationOffers.set(g, { side, points: a.points }); return;
  }
  const offer = resignationOffers.get(g);
  if (["acceptResignation", "declineResignation", "cancelResignation"].includes(a.type)) {
    if (!offer) throw Error("No concession offer is pending.");
    if (a.type === "cancelResignation" ? side !== offer.side : side === offer.side)
      throw Error("Only the other player can respond to this offer.");
    resignationOffers.delete(g);
    if (a.type === "acceptResignation") {
      finish(g, 1 - offer.side);
      g.scores = { winner: g.winner, awarded: offer.points, mars: offer.points === 2, resigned: true, forfeit: false };
    }
    return;
  }
  if (offer) throw Error("Respond to the concession offer before continuing play.");
  if (a.type === "undo") {
    const saved = turnMoveUndo.get(g);
    if (!saved || saved.playerId !== playerId || !saved.snapshots.length)
      throw Error("No move can be undone after the final move or the opponent's roll.");
    const snapshot = saved.snapshots.pop();
    for (const key of Object.keys(g)) delete g[key];
    Object.assign(g, snapshot);
    if (!saved.snapshots.length) turnMoveUndo.delete(g);
    return;
  }
  if (g.phase === "opening") {
    if (a.type !== "roll") throw Error("Roll to decide who starts first.");
    if (g.openingRolls[side] !== null) throw Error("Wait for the other player's opening roll.");
    g.openingRolls[side] = diceRandom.roll();
    recordRoll(g, playerId, "opening", [g.openingRolls[side]]);
    if (g.openingRolls.every(die => die !== null)) {
      if (g.openingRolls[0] === g.openingRolls[1]) {
        g.openingPrevious = [...g.openingRolls]; g.openingRolls = [null, null]; g.openingRound++;
      } else { g.turn = g.openingRolls[0] > g.openingRolls[1] ? 0 : 1; g.phase = "roll"; }
    }
    return;
  }
  if (side !== g.turn) throw Error("It is not your turn.");
  if (a.type === "roll") {
    if (g.phase !== "roll") throw Error("Move your current dice first.");
    const d = [diceRandom.roll(), diceRandom.roll()];
    turnMoveUndo.delete(g); g.lastTurn = null;
    recordRoll(g, playerId, "turn", d);
    g.dice = d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : d;
    g.rollsBySide[side]++;
    g.sequence = g.variant === "gulbara" && g.rollsBySide[side] > 2 && d[0] === d[1]
      ? { roller: side, face: d[0], started: false, handedOver: false } : null;
    g.used = []; g.phase = "play";
    settleDice(g);
    return;
  }
  if (a.type !== "move" || g.phase !== "play") throw Error("Roll first; passing is not allowed.");
  const dieIndex = a.dieIndex;
  const from = a.from;
  if (!Number.isInteger(dieIndex) || dieIndex < 0 || dieIndex >= g.dice.length ||
      (from !== "bar" && (!Number.isInteger(from) || from < 0 || from > 23))) throw Error("Invalid move.");
  const move = legalBackgammonMoves(g).find(m => m.from === from && m.dieIndex === dieIndex);
  if (!move) throw Error("That move is not legal. Use the maximum possible dice; use the higher die when only one can be played.");
  const history = turnMoveUndo.get(g) || { playerId, snapshots: [] };
  history.snapshots.push(structuredClone(g));
  turnMoveUndo.set(g, history);
  applyMove(g, move);
  g.moveNumber += 1;
  if (g.sequence) g.sequence.started = true;
  if (g.borneOff[side] === 15 || g.tapaWinner === side) finish(g, side);
  else settleDice(g);
}
