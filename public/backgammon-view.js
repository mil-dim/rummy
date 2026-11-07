// Coordinates are display-only. Actions always retain authoritative point IDs.
export const variantName = variant => ({normal:'Normal backgammon',gulbara:'Gulbara',tapa:'Tapa'})[variant] || 'Normal backgammon';
export function boardView(variant, side = 0) {
 const physical = rank => side !== 1 ? rank : variant === 'gulbara' ? (rank + 12) % 24 : 23 - rank;
 return { top:Array.from({length:12},(_,i)=>physical(i+12)),
   bottom:Array.from({length:12},(_,i)=>physical(11-i)),
   label:point=>(side !== 1 ? point : variant === 'gulbara' ? (point+12)%24 : 23-point)+1 };
}

export function moveDestination(game,move,side){
 const die=Number(game.dice[move.dieIndex]);
 if(move.from==='bar')return side===0?24-die:die-1;
 const rank=side===0?move.from:game.variant==='gulbara'?(move.from+12)%24:23-move.from;
 const destinationRank=rank-die;
 if(destinationRank<0)return 'off';
 return side===0?destinationRank:game.variant==='gulbara'?(destinationRank+12)%24:23-destinationRank;
}
