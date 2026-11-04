export const backgammonVariant = gameNumber => ["normal", "gulbara", "tapa"][(gameNumber - 1) % 3];

export function startBackgammonMatch(room, roundCount = 3) {
  const count = roundCount;
  if (!Number.isInteger(count) || count < 1 || count > 100) throw Error("Choose between 1 and 100 rounds.");
  room.gameNumber = 0;
  room.formerPlayers = [];
  room.match = { roundCount: count, totalGames: count * 3, completedGames: 0, finished: false,
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
