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

export function backgammonAction(g, playerId, a) {
  if (g.winner) throw Error("This game has finished.");
  const side = g.players.indexOf(playerId);
  if (side !== g.turn) throw Error("It is not your turn.");
  if (a.type === "roll") {
    if (g.dice.length) throw Error("Move your current dice first.");
    const d = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
    g.dice = d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : d;
    g.used = [];
    return;
  }
  if (a.type === "end") {
    if (!g.dice.length) throw Error("Roll first.");
    g.dice = []; g.used = []; g.turn = 1 - g.turn; return;
  }
  if (a.type !== "move" || !g.dice.length) throw Error("Roll first.");
  const dieIndex = Number(a.dieIndex);
  if (g.used.includes(dieIndex) || !g.dice[dieIndex]) throw Error("Choose an unused die.");
  const from = a.from === "bar" ? "bar" : Number(a.from);
  if (g.bar[side] && from !== "bar") throw Error("Enter checkers from the bar first.");
  const to = from === "bar" ? (side === 0 ? 24 - g.dice[dieIndex] : g.dice[dieIndex] - 1)
    : destination(from, g.dice[dieIndex], side);
  const bearing = to < 0 || to > 23;
  if (bearing) {
    const allHome = g.bar[side] === 0 && g.points.every((p, i) => p.owner !== side || home(i, side));
    if (!allHome || from === "bar") throw Error("You cannot bear off yet.");
  } else if (g.points[to].owner !== null && g.points[to].owner !== side && g.points[to].count > 1)
    throw Error("That point is blocked.");
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
  else if (g.used.length === g.dice.length) { g.dice = []; g.used = []; g.turn = 1 - g.turn; }
}
