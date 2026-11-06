export function startSantaseMatch(room){
 room.formerPlayers=[];room.gameNumber=0;
 room.match={kind:'santase',target:11,totalGames:null,completedGames:0,cumulative:Object.fromEntries(room.players.map(player=>[player.id,0])),dealer:0,finished:false};
}

export function recordSantaseResult(room){
 const game=room.game;if(game?.kind!=='santase'||!game.finished||game.resultRecorded)return;
 game.resultRecorded=true;room.match.completedGames++;
 if(game.winner)room.match.cumulative[game.winner]=(room.match.cumulative[game.winner]||0)+game.awarded;
 room.match.dealer=game.draw?game.dealer:game.winner?game.players.indexOf(game.winner):game.dealer;
 room.match.finished=Boolean(room.match.endAfterHand)||Object.values(room.match.cumulative).some(score=>score>=room.match.target);
}

export function startBlatoMatch(room){
 room.formerPlayers=[];room.gameNumber=0;
 room.match={kind:'blato',totalGames:9,completedGames:0,cumulative:Object.fromEntries(room.players.map(player=>[player.id,0])),
  previousScores:[0,0,0],passesUsed:[false,false,false],finished:false};
}

export function recordBlatoResult(room){
 const game=room.game;if(game?.kind!=='blato'||!game.finished||game.resultRecorded)return;
 game.resultRecorded=true;
 for(let side=0;side<game.players.length;side++)room.match.cumulative[game.players[side]]=(room.match.cumulative[game.players[side]]||0)+Number(game.scores?.[side]||0);
 room.match.previousScores=[...(game.scores||[0,0,0])];room.match.passesUsed=[...game.passesUsed];room.match.completedGames=game.gameNumber;
 room.match.finished=Boolean(room.match.endAfterHand)||Boolean(game.forfeit)||room.match.completedGames>=room.match.totalGames;
}
