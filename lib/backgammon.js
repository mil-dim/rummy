export function newBackgammon(players) {
  const points = Array(24).fill(null).map(() => ({ owner: null, count: 0 }));
  const put = (i, owner, count) => points[i] = { owner, count };
  put(23, 0, 2); put(12, 0, 5); put(7, 0, 3); put(5, 0, 5);
  put(0, 1, 2); put(11, 1, 5); put(16, 1, 3); put(18, 1, 5);
  return { kind: "backgammon", players: players.map(p => p.id), points, bar: [0, 0],
    borneOff: [0, 0], turn: 0, dice: [], used: [], winner: null };
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

function hasLegalMove(g, side) {
  return g.dice.some((die, dieIndex) => {
    if (g.used.includes(dieIndex)) return false;
    if (g.bar[side]) return canMove(g, side, "bar", die);
    return g.points.some((_point, from) => canMove(g, side, from, die));
  });
}

function nextTurn(g) {
  g.dice = []; g.used = []; g.turn = 1 - g.turn;
}

export function backgammonAction(g, playerId, a) {
  if (g.winner) throw Error("This game has finished.");
  const side = g.players.indexOf(playerId);
  if (side !== g.turn) throw Error("It is not your turn.");
  if (a.type === "roll") {
    if (g.dice.length) throw Error("Move your current dice first.");
    const d = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    g.dice = d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : d;
    g.used = [];
    if (!hasLegalMove(g, side)) nextTurn(g);
    return;
  }
  if (a.type !== "move" || !g.dice.length) throw Error("Roll first.");
  const dieIndex = Number(a.dieIndex);
  if (g.used.includes(dieIndex) || !g.dice[dieIndex]) throw Error("Choose an unused die.");
  const from = a.from === "bar" ? "bar" : Number(a.from);
  if (!canMove(g, side, from, g.dice[dieIndex])) throw Error("That move is not legal.");
  if (g.bar[side] && from !== "bar") throw Error("Enter checkers from the bar first.");
  const to = from === "bar" ? (side === 0 ? 24 - g.dice[dieIndex] : g.dice[dieIndex] - 1)
    : destination(from, g.dice[dieIndex], side);
  const bearing = to < 0 || to > 23;
  if (from === "bar") g.bar[side]--;
  else {
    const p = g.points[from];
    if (!p || p.owner !== side || p.count < 1) throw Error("No checker there.");
    if (--p.count === 0) p.owner = null;
  }
  if (bearing) g.borneOff[side]++;
  else {
    const p = g.points[to];
    if (p.owner !== null && p.owner !== side) {
      g.bar[1 - side]++; p.owner = side; p.count = 1;
    } else { p.owner = side; p.count++; }
  }
  g.used.push(dieIndex);
  if (g.borneOff[side] === 15) g.winner = playerId;
  else if (g.used.length === g.dice.length || !hasLegalMove(g, side)) nextTurn(g);
}
