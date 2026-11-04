export function startBackgammonMatch(room, gameCount = 5) {
  const count = gameCount;
  if (!Number.isInteger(count) || count < 1 || count > 100) throw Error("Choose between 1 and 100 games.");
  room.gameNumber = 0;
  room.formerPlayers = [];
  room.match = { totalGames: count, completedGames: 0, finished: false,
    cumulative: Object.fromEntries(room.players.map(player => [player.id, 0])) };
}

export function recordBackgammonResult(room) {
  const game = room.game;
  if (game?.kind !== "backgammon" || !game.winner || game.resultRecorded) return;
  game.resultRecorded = true;
  room.match.cumulative[game.winner] += game.scores.awarded;
  room.match.completedGames = game.gameNumber;
  room.match.finished = Boolean(room.match.endAfterHand) || room.match.completedGames >= room.match.totalGames;
}
