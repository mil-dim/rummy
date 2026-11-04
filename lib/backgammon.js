export function newBackgammon(players, { gameNumber = 1, starter = null } = {}) {
  const points = Array(24).fill(null).map(() => ({ owner: null, count: 0 }));
  const put = (i, owner, count) => points[i] = { owner, count };
  put(23, 0, 2); put(12, 0, 5); put(7, 0, 3); put(5, 0, 5);
  put(0, 1, 2); put(11, 1, 5); put(16, 1, 3); put(18, 1, 5);
  return { kind: "backgammon", players: players.map(p => p.id), points, bar: [0, 0],
    borneOff: [0, 0], turn: Math.max(0, players.findIndex(p => p.id === starter)),
    dice: [], used: [], winner: null, scores: null, gameNumber,
    phase: starter ? "roll" : "opening", openingRolls: [null, null],
    openingPrevious: null, openingRound: 1, lastTurn: null };
}

const destination = (from, die, side) => from + (side === 0 ? -die : die);
const home = (p, side) => side === 0 ? p >= 0 && p <= 5 : p >= 18 && p <= 23;

function canBearOff(g, side, from, die) {
  if (g.bar[side] || !g.points.every((point, index) => point.owner !== side || home(index, side)))
    return false;
  const to = destination(from, die, side);
  if (side === 0) {
    if (to === -1) return true;
    if (to < -1) return !g.points.slice(from + 1, 6).some(point => point.owner === side);
  } else {
    if (to === 24) return true;
    if (to > 24) return !g.points.slice(18, from).some(point => point.owner === side);
  }
  return false;
}

function canMove(g, side, from, die) {
  if (g.bar[side] && from !== "bar") return false;
  if (from !== "bar") {
    const point = g.points[from];
    if (!point || point.owner !== side || point.count < 1) return false;
  }
  const to = from === "bar" ? (side === 0 ? 24 - die : die - 1) : destination(from, die, side);
  if (to < 0 || to > 23) return from !== "bar" && canBearOff(g, side, from, die);
  const target = g.points[to];
  return target.owner === null || target.owner === side || target.count === 1;
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
  const to = from === "bar" ? (side === 0 ? 24 - die : die - 1) : destination(from, die, side);
  if (from === "bar") g.bar[side]--;
  else if (--g.points[from].count === 0) g.points[from].owner = null;
  if (to < 0 || to > 23) g.borneOff[side]++;
  else {
    const target = g.points[to];
    if (target.owner !== null && target.owner !== side) {
      g.bar[1 - side]++; target.owner = side; target.count = 1;
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
    if (position.borneOff[position.turn] === 15) return 0;
    const key = JSON.stringify([position.points, position.bar, position.borneOff,
      position.dice.filter((_, i) => !position.used.includes(i)).sort()]);
    if (memo.has(key)) return memo.get(key);
    let best = 0;
    for (const move of candidates(position)) best = Math.max(best, 1 + maxMoves(nextPosition(position, move)));
    memo.set(key, best);
    return best;
  }
  const ranked = candidates(g).map(move => ({ ...move, length: 1 + maxMoves(nextPosition(g, move)) }));
  const maximum = Math.max(0, ...ranked.map(move => move.length));
  let best = ranked.filter(move => move.length === maximum);
  // When only one of two different dice can be used, the higher is compulsory.
  if (maximum === 1 && g.dice.length === 2 && g.dice[0] !== g.dice[1] && !g.used.length) {
    const higher = Math.max(...best.map(move => g.dice[move.dieIndex]));
    best = best.filter(move => g.dice[move.dieIndex] === higher);
  }
  // Doubles are interchangeable, so allow selecting any unused equivalent die.
  return best.flatMap(move => g.dice.flatMap((die, dieIndex) =>
    !g.used.includes(dieIndex) && die === g.dice[move.dieIndex] ? [{ from: move.from, dieIndex }] : []));
}

const firstMoveUndo = new WeakMap();
function finish(g, side, forfeit = false) {
  g.winner = g.players[side]; g.phase = "finished";
  const mars = !forfeit && g.borneOff[1 - side] === 0;
  g.scores = { winner: g.winner, awarded: mars ? 2 : 1, mars, forfeit };
  firstMoveUndo.delete(g);
}
function nextTurn(g, reason) {
  g.lastTurn = { playerId: g.players[g.turn], dice: [...g.dice], used: [...g.used], reason };
  g.dice = []; g.used = []; g.turn = 1 - g.turn; g.phase = "roll";
}

export function publicBackgammon(g, viewer) {
  return { ...g, canUndo: !g.winner && firstMoveUndo.get(g)?.playerId === viewer,
    legalMoves: g.phase === "play" && g.players[g.turn] === viewer ? legalBackgammonMoves(g) : [] };
}

export function forfeitBackgammon(g, playerId) {
  const side = g.players.indexOf(playerId);
  if (side < 0) throw Error("Player is not in this game.");
  if (g.winner) return;
  g.forfeited = [playerId];
  finish(g, 1 - side, true);
}

const rollDie = () => 1 + Math.floor(Math.random() * 6);
export function backgammonAction(g, playerId, a) {
  if (g.winner) throw Error("This game has finished.");
  const side = g.players.indexOf(playerId);
  if (side < 0) throw Error("Player is not in this game.");
  if (!a || typeof a !== "object" || Array.isArray(a)) throw Error("Invalid action.");
  if (a.type === "undo") {
    const saved = firstMoveUndo.get(g);
    if (!saved || saved.playerId !== playerId) throw Error("Only the first move can be undone, before the second move or the opponent rolls.");
    for (const key of Object.keys(g)) delete g[key];
    Object.assign(g, saved.snapshot); firstMoveUndo.delete(g); return;
  }
  if (g.phase === "opening") {
    if (a.type !== "roll") throw Error("Roll to decide who starts first.");
    if (g.openingRolls[side] !== null) throw Error("Wait for the other player's opening roll.");
    g.openingRolls[side] = rollDie();
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
    firstMoveUndo.delete(g); g.lastTurn = null;
    const d = [rollDie(), rollDie()];
    g.dice = d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : d;
    g.used = []; g.phase = "play";
    if (!legalBackgammonMoves(g).length) nextTurn(g, "blocked");
    return;
  }
  if (a.type !== "move" || g.phase !== "play") throw Error("Roll first; passing is not allowed.");
  const dieIndex = a.dieIndex;
  const from = a.from;
  if (!Number.isInteger(dieIndex) || dieIndex < 0 || dieIndex >= g.dice.length ||
      (from !== "bar" && (!Number.isInteger(from) || from < 0 || from > 23))) throw Error("Invalid move.");
  const move = legalBackgammonMoves(g).find(m => m.from === from && m.dieIndex === dieIndex);
  if (!move) throw Error("That move is not legal. Use the maximum possible dice; use the higher die when only one can be played.");
  if (!g.used.length) firstMoveUndo.set(g, { playerId, snapshot: structuredClone(g) });
  else firstMoveUndo.delete(g);
  applyMove(g, move);
  if (g.borneOff[side] === 15) finish(g, side);
  else if (g.used.length === g.dice.length) nextTurn(g, "complete");
  else if (!legalBackgammonMoves(g).length) nextTurn(g, "blocked");
}
